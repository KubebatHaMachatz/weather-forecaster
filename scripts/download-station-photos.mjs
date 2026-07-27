/**
 * Downloads every station photograph into assets/photos/ and generates the
 * static require() map the app bundles.
 *
 * Why bundle rather than hotlink: Wikimedia Commons' reuse guidance says
 * plainly that "directly using a Commons file via embedding its URL
 * ('hotlinking') ... is not recommended". Loading 300+ banners straight off
 * upload.wikimedia.org spends their bandwidth for our app. Bundling also
 * makes the banner work offline, which suits an app that is otherwise
 * deliberately offline-friendly (DESIGN §9.7), and removes the
 * User-Agent/403 fragility entirely.
 *
 * Usage: npx tsx scripts/download-station-photos.mjs
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

/**
 * Wikimedia rate-limits, and a first unthrottled run of this script earned
 * a wall of HTTP 429s partway through — which is precisely the discourtesy
 * bundling exists to avoid. Matches the throttle the other live-API scripts
 * in this project already use.
 */
const THROTTLE_MS = 200

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Bundling width. Measured against the real files: 960px would ship ~66 MB
 * and 640px ~59 MB, both unshippable; 320px ~8 MB is visibly soft under a
 * full-width banner. 480px lands at ~20 MB, which is the honest middle for
 * a decorative image sitting behind text.
 */
const BUNDLE_WIDTH_PX = 480

const USER_AGENT =
  'EnsembleWeatherGame/0.1 (https://github.com/KubebatHaMachatz/weather-forecaster; build script)'

/**
 * Licences that impose no attribution requirement, so an entry with no
 * recorded author is still usable.
 */
const NO_ATTRIBUTION_REQUIRED = new Set(['cc0', 'public domain'])

/** Standard, reviewed grants. Anything else is not shipped on an assumption. */
const KNOWN_LICENCE_PATTERN = /^(cc[ -]by([ -]sa)?[ -]\d(\.\d)?|cc0|public domain|fal)/i

/**
 * True only when the entry can be shipped AND properly credited.
 *
 * CC BY and CC BY-SA require naming the author, so an image whose author
 * Commons doesn't record cannot be used however good it looks. A bare
 * "Attribution" licence is a custom, unreviewed term rather than a standard
 * CC grant, so it's excluded too.
 */
export function hasUsableAttribution(entry) {
  const licence = typeof entry.licence === 'string' ? entry.licence.trim() : ''
  if (licence === '') return false
  if (!KNOWN_LICENCE_PATTERN.test(licence)) return false

  if (NO_ATTRIBUTION_REQUIRED.has(licence.toLowerCase())) return true
  return typeof entry.artist === 'string' && entry.artist.trim() !== ''
}

/**
 * A stable, filesystem- and identifier-safe file name for a station key.
 * Derived from the full "name|country" identity, so two same-named cities
 * in different countries never collide.
 */
export function photoFileName(key) {
  const slug = key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[|\s,]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}.jpg`
}

async function resolveBundleUrl(sourcePage) {
  const title = decodeURIComponent(new URL(sourcePage).pathname.replace('/wiki/', ''))
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(BUNDLE_WIDTH_PX),
    titles: title,
  })
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!response.ok) return null
  const body = await response.json()
  const page = Object.values(body?.query?.pages ?? {})[0]
  return page?.thumbnail?.source ?? null
}

async function main() {
  const manifestPath = new URL('../assets/station-images.json', import.meta.url)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const photosDir = new URL('../assets/photos/', import.meta.url)
  mkdirSync(photosDir, { recursive: true })

  const kept = {}
  const dropped = []
  let bytes = 0

  const entries = Object.entries(manifest)
  for (let i = 0; i < entries.length; i++) {
    const [key, entry] = entries[i]
    process.stderr.write(`[${i + 1}/${entries.length}] ${key}... `)

    if (!hasUsableAttribution(entry)) {
      dropped.push({ key, reason: `cannot attribute (${entry.licence ?? 'no licence'}, artist: ${entry.artist ?? 'none'})` })
      process.stderr.write('DROPPED (attribution)\n')
      continue
    }

    const fileName = photoFileName(key)
    const filePath = new URL(fileName, photosDir)

    try {
      // Resumable: a run interrupted by rate limiting or a dropped
      // connection must not re-download everything it already has, both to
      // be a good citizen and so retrying is cheap.
      let size = existsSync(filePath) ? statSync(filePath).size : 0
      if (size === 0) {
        const url = (await resolveBundleUrl(entry.sourcePage)) ?? entry.url
        await sleep(THROTTLE_MS)
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        writeFileSync(filePath, buffer)
        size = buffer.byteLength
        await sleep(THROTTLE_MS)
      }
      bytes += size

      kept[key] = {
        file: fileName,
        sourcePage: entry.sourcePage,
        licence: entry.licence,
        ...(entry.artist !== undefined ? { artist: entry.artist } : {}),
        ...(entry.licenceUrl !== undefined ? { licenceUrl: entry.licenceUrl } : {}),
      }
      process.stderr.write(`ok (${Math.round(size / 1024)} KB)\n`)
    } catch (err) {
      dropped.push({ key, reason: err.message })
      process.stderr.write(`FAILED: ${err.message}\n`)
    }
  }

  /**
   * A partial run must NOT rewrite the manifest.
   *
   * The first version did, and a wall of rate-limit failures silently
   * deleted 155 perfectly good entries — turning a transient network
   * problem into destroyed content that only `git checkout` recovered.
   * Failures that are merely transient get a non-zero exit and an intact
   * manifest, so re-running resumes rather than compounding the damage.
   */
  const transientFailures = dropped.filter((d) => !d.reason.startsWith('cannot attribute'))
  if (transientFailures.length > 0) {
    process.stderr.write(
      `\nREFUSING to rewrite the manifest: ${transientFailures.length} download(s) failed for ` +
        'transient reasons. Re-run to resume — already-downloaded files are skipped.\n',
    )
    for (const { key, reason } of transientFailures) process.stderr.write(`  ${key}: ${reason}\n`)
    process.exit(1)
  }

  writeFileSync(manifestPath, JSON.stringify(kept, null, 2) + '\n')

  // Metro can only resolve require() with a static literal path, so the
  // key -> asset mapping has to be generated rather than built at runtime.
  const lines = Object.entries(kept)
    .map(([key, value]) => `  ${JSON.stringify(key)}: require('../../assets/photos/${value.file}'),`)
    .join('\n')
  writeFileSync(
    new URL('../src/geo/stationPhotoAssets.ts', import.meta.url),
    `/**\n * GENERATED by scripts/download-station-photos.mjs — do not edit.\n *\n * Metro resolves require() only from static literal paths, so the\n * station-key -> bundled-asset mapping cannot be built at runtime.\n */\n\n/* eslint-disable */\nexport const STATION_PHOTO_ASSETS: Record<string, number> = {\n${lines}\n}\n`,
  )

  process.stderr.write(
    `\nbundled ${Object.keys(kept).length} photos (${(bytes / 1024 / 1024).toFixed(1)} MB), dropped ${dropped.length}\n`,
  )
  for (const { key, reason } of dropped) process.stderr.write(`  ${key}: ${reason}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
