import { describe, expect, it } from 'vitest'
// Explicit .ts extension: Vitest can't follow this project's bundler-style
// '.js'-pointing-at-'.ts' specifiers from a .mjs file (verified — it fails
// on both static and dynamic imports), but resolves the real path fine.
// Worth the small inconsistency to test against the REAL, already-tested
// haversine instead of a fake that could agree with a wrong implementation.
import { greatCircleDistanceKm } from '../src/geo/bearing.ts'
import {
  MAX_MATCH_DISTANCE_KM,
  cleanArtist,
  fileTitleFromThumbnail,
  isPhotographicFile,
  isPlausibleMatch,
  pageQueryUrl,
  titleCandidates,
} from './build-station-images.mjs'

const BUJUMBURA = { name: 'Bujumbura', country: 'Burundi', lat: -3.3814, lon: 29.3599 }

/** Binds the real distance function so each assertion reads as the decision, not the plumbing. */
const matches = (summary, station) => isPlausibleMatch(summary, station, greatCircleDistanceKm)

describe('titleCandidates', () => {
  it('tries the bare name first, then name-with-country', () => {
    expect(titleCandidates(BUJUMBURA)).toEqual(['Bujumbura', 'Bujumbura, Burundi'])
  })

  it('includes an admin1-qualified candidate when the station has one', () => {
    const alert = { name: 'Alert', country: 'Canada', admin1: 'Nunavut', lat: 82.5, lon: -62.35 }
    expect(titleCandidates(alert)).toContain('Alert, Nunavut')
  })

  it('does not emit duplicate candidates when admin1 equals country', () => {
    const odd = { name: 'Singapore', country: 'Singapore', admin1: 'Singapore', lat: 1.29, lon: 103.85 }
    expect(new Set(titleCandidates(odd)).size).toBe(titleCandidates(odd).length)
  })
})

describe('isPlausibleMatch', () => {
  /**
   * The whole point of this check: Wikipedia will happily return a
   * confidently-wrong article for an ambiguous name (the same failure class
   * that made "Goa" geocode to a Philippines town in the station pipeline).
   * Coordinates are the ground truth, not the title.
   */
  // The MediaWiki query API returns coordinates as an ARRAY (a page can
  // carry several), unlike the REST summary's single object — pinned here
  // because getting this shape wrong silently rejects every station.
  const page = (lat, lon) => ({ coordinates: [{ lat, lon, primary: '', globe: 'earth' }] })

  it('accepts an article whose coordinates are at the station', () => {
    expect(matches(page(-3.36277778, 29.36555556), BUJUMBURA)).toBe(true)
  })

  it('rejects a same-named place on the other side of the world', () => {
    const goaPhilippines = page(13.6, 123.36)
    expect(matches(goaPhilippines, { name: 'Goa', country: 'India', lat: 15.49, lon: 73.82 })).toBe(false)
  })

  it('rejects an article with no coordinates at all rather than assuming', () => {
    expect(matches({}, BUJUMBURA)).toBe(false)
    expect(matches({ coordinates: null }, BUJUMBURA)).toBe(false)
    expect(matches({ coordinates: [] }, BUJUMBURA)).toBe(false)
  })

  it('accepts a city-centre offset within the tolerance', () => {
    // Station coords and the article's coords rarely agree exactly; both
    // describe the same city, so the tolerance must be generous enough for
    // a large metro area but far tighter than "another country".
    expect(matches(page(BUJUMBURA.lat + 0.1, BUJUMBURA.lon + 0.1), BUJUMBURA)).toBe(true)
  })

  it('rejects a non-Earth coordinate rather than measuring distance on it', () => {
    // Some articles carry coordinates on the Moon or Mars; comparing those
    // to a terrestrial station is meaningless.
    const lunar = { coordinates: [{ lat: -3.3627, lon: 29.3655, globe: 'moon' }] }
    expect(matches(lunar, BUJUMBURA)).toBe(false)
  })

  it('exposes its tolerance as a real distance, not a magic degree delta', () => {
    expect(MAX_MATCH_DISTANCE_KM).toBeGreaterThan(0)
    expect(MAX_MATCH_DISTANCE_KM).toBeLessThan(200)
  })
})

describe('pageQueryUrl', () => {
  /**
   * Regression test for a bug found only by running the app on a device:
   * hand-rewriting a thumbnail URL's width (330px -> 800px) produces a URL
   * Wikimedia REJECTS with HTTP 400 ("Use thumbnail sizes listed on
   * w.wiki/GHai") — only certain widths are served. The width must be asked
   * for via pithumbsize so the API returns a URL it will actually serve.
   */
  it('requests the thumbnail size from the API instead of rewriting a URL', () => {
    const url = pageQueryUrl(['Bujumbura'], 900)
    expect(url).toContain('pithumbsize=900')
    expect(url).toContain('piprop=thumbnail')
  })

  it('asks for coordinates in the same call, so verification needs no second request', () => {
    expect(pageQueryUrl(['Bujumbura'], 900)).toContain('coordinates')
  })

  it('follows redirects, so "Krakow" reaches the "Kraków" article', () => {
    expect(pageQueryUrl(['Krakow'], 900)).toContain('redirects=1')
  })

  /**
   * Form encoding (space as "+", per URLSearchParams) rather than
   * percent-encoding — verified against the live API, which resolves both
   * "Alert, Nunavut" and "Tromsø" correctly from exactly this URL.
   */
  it('encodes titles containing spaces, commas, and non-ASCII', () => {
    const url = pageQueryUrl(['Alert, Nunavut', 'Tromsø'], 900)
    expect(url).toContain('Alert%2C+Nunavut')
    expect(url).toContain('Troms%C3%B8')
    // Titles are pipe-separated in the MediaWiki API; the separator must
    // survive as an encoded pipe rather than merging the two titles.
    expect(url).toContain('%7C')
  })
})

describe('fileTitleFromThumbnail', () => {
  it('extracts the Commons file title from a thumbnail URL', () => {
    expect(
      fileTitleFromThumbnail(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/BujumburaFromCathedral.jpg/330px-BujumburaFromCathedral.jpg',
      ),
    ).toBe('File:BujumburaFromCathedral.jpg')
  })

  /**
   * Percent-escapes must be decoded (São, not S%C3%A3o) but underscores must
   * NOT be turned into spaces: MediaWiki treats the two as equivalent in
   * titles, and the underscore form is what the URL actually carries —
   * verified against the live API, which resolves such titles fine.
   */
  it('percent-decodes a title while leaving underscores intact', () => {
    expect(
      fileTitleFromThumbnail(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/S%C3%A3o_Paulo.jpg/330px-S%C3%A3o_Paulo.jpg',
      ),
    ).toBe('File:São_Paulo.jpg')
  })

  /**
   * Regression test for a real regression: when the requested pithumbsize
   * exceeds the file's own width, the API returns the ORIGINAL file URL —
   * no "/thumb/" segment and no "NNNpx-" prefix (Cardiff's photo is only
   * 500px wide, so asking for 900 yields the original). A thumb-only regex
   * silently dropped 22 stations this way.
   */
  it('extracts the file title from an original (non-thumb) Commons URL', () => {
    expect(fileTitleFromThumbnail('https://upload.wikimedia.org/wikipedia/commons/1/1f/Cardiff_Bay_WMC.jpg')).toBe(
      'File:Cardiff_Bay_WMC.jpg',
    )
  })

  it('handles an original URL hosted on en.wikipedia rather than commons', () => {
    expect(fileTitleFromThumbnail('https://upload.wikimedia.org/wikipedia/en/a/ab/Local_Photo.jpg')).toBe(
      'File:Local_Photo.jpg',
    )
  })

  it('returns null for a URL that is not a Wikimedia upload', () => {
    expect(fileTitleFromThumbnail('https://example.com/photo.jpg')).toBeNull()
  })
})

describe('isPhotographicFile', () => {
  /**
   * Wikipedia's summary thumbnail is whatever the infobox leads with, which
   * for some places is the municipal flag or coat of arms rather than a
   * photograph — found by inspecting a real 314-station run, where
   * Djibouti, Singapore and Hong Kong all came back as flags. A flag is not
   * "an image of the location", so it must be rejected and fall back.
   */
  it('rejects flags, seals, coats of arms, and logos', () => {
    expect(isPhotographicFile('File:Flag_of_Djibouti.svg')).toBe(false)
    expect(isPhotographicFile('File:Flag_of_Valdivia,_Chile.svg')).toBe(false)
    expect(isPhotographicFile('File:Seal_of_Portland.png')).toBe(false)
    expect(isPhotographicFile('File:Coat_of_arms_of_Vienna.svg')).toBe(false)
    expect(isPhotographicFile('File:Logo_of_Somewhere.png')).toBe(false)
  })

  it('rejects maps and location diagrams', () => {
    expect(isPhotographicFile('File:Map_of_Chile.svg')).toBe(false)
    expect(isPhotographicFile('File:Location_map_Norway.png')).toBe(false)
  })

  it('rejects any SVG, since a photograph is never vector art', () => {
    expect(isPhotographicFile('File:Anything.svg')).toBe(false)
  })

  it('accepts ordinary photograph filenames', () => {
    expect(isPhotographicFile('File:BujumburaFromCathedral.jpg')).toBe(true)
    expect(isPhotographicFile('File:CFS_Alert_May_2016.jpg')).toBe(true)
    expect(isPhotographicFile('File:Hanoi_skyline.jpeg')).toBe(true)
    expect(isPhotographicFile('File:Tromsø_sentrum.JPG')).toBe(true)
  })

  it('does not reject a photo whose place name merely contains a trigger word', () => {
    // "Flagstaff" starts with "flag"; the check must not be a bare substring.
    expect(isPhotographicFile('File:Flagstaff_Arizona_downtown.jpg')).toBe(true)
  })
})

describe('cleanArtist', () => {
  it('strips the anchor markup Commons returns and keeps the name', () => {
    expect(cleanArtist('<a href="//commons.wikimedia.org/wiki/User:X" title="X">SteveRwanda</a>')).toBe('SteveRwanda')
  })

  it('collapses whitespace from multi-line markup', () => {
    expect(cleanArtist('<span>\n  Jane   Doe\n</span>')).toBe('Jane Doe')
  })

  it('returns null for missing or empty attribution rather than an empty string', () => {
    expect(cleanArtist(undefined)).toBeNull()
    expect(cleanArtist('')).toBeNull()
    expect(cleanArtist('<span>   </span>')).toBeNull()
  })
})
