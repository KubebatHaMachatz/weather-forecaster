/**
 * Resolves one representative photograph per station from Wikipedia, into
 * the bundled assets/station-images.json the home screen renders as a
 * banner.
 *
 * Deliberately NOT scraped from an image search: these are Wikipedia/
 * Wikimedia Commons files with real, machine-readable licence metadata, so
 * the app can honour the CC attribution those licences require (the same
 * obligation DESIGN §9.6a already establishes for Open-Meteo's data). Any
 * image whose licence metadata can't be read is dropped rather than shipped
 * unattributed.
 *
 * Matching is verified by COORDINATES, not by title: Wikipedia will happily
 * return a confidently-wrong article for an ambiguous place name — exactly
 * the failure that made "Goa" resolve to a Philippines town while building
 * the station list. An article more than MAX_MATCH_DISTANCE_KM from the
 * station is rejected.
 *
 * Run via tsx (it imports src/geo's tested haversine rather than
 * re-deriving distance):
 *   npx tsx scripts/build-station-images.mjs
 * Diagnostics go to stderr.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const THROTTLE_MS = 150
const BANNER_WIDTH_PX = 900

/**
 * Generous enough that a station's coordinates and its city article's
 * coordinates agree across a large metro area, tight enough that a
 * same-named place in another country never passes.
 */
export const MAX_MATCH_DISTANCE_KM = 75

const USER_AGENT =
  'EnsembleWeatherGame/0.1 (https://github.com/KubebatHaMachatz/weather-forecaster; build script) node-fetch'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wikipedia article titles worth trying, most-likely first. The bare name
 * usually wins; the qualified forms rescue ambiguous ones ("Alert" alone is
 * a disambiguation page, "Alert, Nunavut" is the settlement).
 */
export function titleCandidates(station) {
  const candidates = [station.name, `${station.name}, ${station.country}`]
  if (station.admin1) {
    candidates.push(`${station.name}, ${station.admin1}`)
  }
  return [...new Set(candidates)]
}

/**
 * True only when the page carries a terrestrial coordinate within
 * MAX_MATCH_DISTANCE_KM of the station. No coordinates means "can't
 * verify", which is treated as a miss rather than an assumed hit.
 *
 * `page.coordinates` is an ARRAY here (the MediaWiki query API's shape — a
 * page can carry several), and entries can sit on other bodies, so
 * non-Earth globes are filtered out before measuring.
 */
export function isPlausibleMatch(page, station, greatCircleDistanceKm) {
  const coordinates = page?.coordinates
  if (!Array.isArray(coordinates)) return false

  return coordinates.some((coordinate) => {
    if (typeof coordinate?.lat !== 'number' || typeof coordinate?.lon !== 'number') return false
    if (coordinate.globe !== undefined && coordinate.globe !== 'earth') return false
    const distanceKm = greatCircleDistanceKm(
      { lat: coordinate.lat, lon: coordinate.lon },
      { lat: station.lat, lon: station.lon },
    )
    return distanceKm <= MAX_MATCH_DISTANCE_KM
  })
}

/**
 * One MediaWiki query for both the coordinates (verification) and a
 * correctly-sized thumbnail URL.
 *
 * The size MUST be requested via pithumbsize rather than by rewriting a
 * URL's width: Wikimedia serves only certain thumbnail widths and answers
 * anything else with HTTP 400 ("Use thumbnail sizes listed on
 * w.wiki/GHai"). That was found the hard way — hand-built 800px URLs
 * passed every build-time check and then failed on the device. The API
 * rounds the request up to a width it will actually serve (asking 900
 * yields 960), so the URL it hands back is guaranteed loadable.
 *
 * redirects=1 so a station name that's an alias ("Krakow") still reaches
 * its real article ("Kraków").
 */
export function pageQueryUrl(titles, thumbSize) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    prop: 'pageimages|coordinates',
    piprop: 'thumbnail',
    pithumbsize: String(thumbSize),
    titles: titles.join('|'),
  })
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`
}

/**
 * Non-photographic infobox images, which Wikipedia's summary thumbnail
 * happily returns for some places — a real 314-station run came back with
 * the municipal FLAG for Djibouti, Singapore and Hong Kong, and the city
 * flag for Valdivia. A flag is not a picture of a place, so it's rejected
 * and the station falls back.
 *
 * Word-boundary anchored so a genuine photo of Flagstaff isn't caught by
 * "flag". SVG is excluded outright: a photograph is never vector art.
 */
const NON_PHOTO_PATTERNS = [
  /\.svg$/i,
  /\b(flag|seal|logo|emblem|banner|crest|insignia)s?\b/i,
  /\bcoats?[_\s-]of[_\s-]arms\b/i,
  /\b(location[_\s-])?map\b/i,
]

export function isPhotographicFile(fileTitle) {
  const name = fileTitle.replace(/^File:/, '').replace(/_/g, ' ')
  return !NON_PHOTO_PATTERNS.some((pattern) => pattern.test(name))
}

/** Commons returns Artist as an HTML fragment (usually a user-page anchor). */
export function cleanArtist(html) {
  if (!html) return null
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0 ? text : null
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.json()
}

/** The single page the API returned for `title`, or null if it has no article. */
async function fetchPage(title) {
  const body = await fetchJson(pageQueryUrl([title], BANNER_WIDTH_PX))
  const page = Object.values(body?.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined) return null
  return page
}

/**
 * The licence facts CC attribution actually requires. Returns null when the
 * metadata can't be read — the caller drops the image rather than shipping
 * a photo it can't credit.
 */
async function fetchLicence(fileTitle) {
  // Commons first, en.wikipedia second. Most files live on Commons, and
  // en.wikipedia's API reports some of them as `missing` rather than
  // resolving them across the repo boundary (found while investigating why
  // Valdivia was dropped: en.wikipedia said missing, Commons returned the
  // licence fine). Falling back the other way still covers the files that
  // are hosted locally on en.wikipedia instead.
  const hosts = ['commons.wikimedia.org', 'en.wikipedia.org']
  for (const host of hosts) {
    const url =
      `https://${host}/w/api.php?action=query&format=json&prop=imageinfo` +
      `&iiprop=extmetadata%7Curl&titles=${encodeURIComponent(fileTitle)}`
    const meta = await licenceMetaFrom(url)
    if (meta) return meta
  }
  return null
}

async function licenceMetaFrom(url) {
  const body = await fetchJson(url)
  const page = Object.values(body?.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined) return null
  const meta = page?.imageinfo?.[0]?.extmetadata
  if (!meta) return null

  const licence = meta.LicenseShortName?.value
  if (!licence) return null

  return {
    licence,
    ...(cleanArtist(meta.Artist?.value) ? { artist: cleanArtist(meta.Artist?.value) } : {}),
    ...(meta.LicenseUrl?.value ? { licenceUrl: meta.LicenseUrl.value } : {}),
  }
}

/**
 * File title for a Wikimedia upload URL, in either shape it can arrive as:
 *
 *   thumb:    .../commons/thumb/f/f9/Foo.jpg/960px-Foo.jpg
 *   original: .../commons/f/f9/Foo.jpg
 *
 * The original shape is NOT an edge case: pithumbsize only ever scales
 * down, so any file narrower than the requested width comes back as its
 * original URL (Cardiff's photo is 500px wide). Handling only the thumb
 * shape silently dropped 22 stations.
 */
export function fileTitleFromThumbnail(url) {
  const thumb = /\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//.exec(url)
  if (thumb) return `File:${decodeURIComponent(thumb[1])}`

  const original = /\/wikipedia\/[^/]+\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)$/.exec(url)
  return original ? `File:${decodeURIComponent(original[1])}` : null
}

export async function resolveStationImage(station, greatCircleDistanceKm) {
  for (const title of titleCandidates(station)) {
    const page = await fetchPage(title)
    await sleep(THROTTLE_MS)
    if (!page?.thumbnail?.source) continue
    if (!isPlausibleMatch(page, station, greatCircleDistanceKm)) continue

    const fileTitle = fileTitleFromThumbnail(page.thumbnail.source)
    if (!fileTitle) continue
    // A flag/seal/map is not a photograph of the place — fall through to the
    // next candidate title rather than shipping it as the banner.
    if (!isPhotographicFile(fileTitle)) continue

    const licence = await fetchLicence(fileTitle)
    await sleep(THROTTLE_MS)
    if (!licence) continue

    return {
      // Straight from the API — never hand-resized (see pageQueryUrl).
      url: page.thumbnail.source,
      // page.title is post-redirect ("Kraków" for a "Krakow" query), so the
      // link points at the article the photo actually came from.
      sourcePage: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      ...licence,
    }
  }
  return null
}

async function main() {
  const { greatCircleDistanceKm } = await import('../src/geo/bearing.js')

  const stations = JSON.parse(readFileSync(new URL('../assets/stations.json', import.meta.url), 'utf8'))
  /** Keyed by "name|country" — the same identity daily.ts hashes on. */
  const images = {}
  const misses = []

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]
    process.stderr.write(`[${i + 1}/${stations.length}] ${station.name}, ${station.country}... `)
    try {
      const image = await resolveStationImage(station, greatCircleDistanceKm)
      if (image) {
        images[`${station.name}|${station.country}`] = image
        process.stderr.write(`OK (${image.licence})\n`)
      } else {
        misses.push(station)
        process.stderr.write('NO VERIFIED IMAGE\n')
      }
    } catch (err) {
      misses.push(station)
      process.stderr.write(`ERROR: ${err.message}\n`)
    }
  }

  writeFileSync(
    new URL('../assets/station-images.json', import.meta.url),
    JSON.stringify(images, null, 2) + '\n',
  )
  process.stderr.write(
    `\nwrote assets/station-images.json: ${Object.keys(images).length}/${stations.length} stations have a verified, licensed image, ${misses.length} without\n`,
  )
  if (misses.length > 0) {
    process.stderr.write(
      `\nWITHOUT IMAGES (the app falls back gracefully for these):\n${misses
        .map((s) => `  ${s.name}, ${s.country}`)
        .join('\n')}\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
