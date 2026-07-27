import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { stationImageFor, stationImageKey, type StationImage } from './stationImages.js'
import { validateStationList } from './stationData.js'
import type { Station } from './station.js'

/**
 * Validates the real bundled manifest (assets/station-images.json, produced
 * by scripts/build-station-images.mjs) — not a fixture. Mirrors
 * stations.test.ts: same beforeAll pattern, so a bad file fails as one clean
 * test rather than crashing whole-file collection.
 */
const IMAGES_PATH = fileURLToPath(new URL('../../assets/station-images.json', import.meta.url))
const STATIONS_PATH = fileURLToPath(new URL('../../assets/stations.json', import.meta.url))

const rawImages: Record<string, StationImage> = JSON.parse(readFileSync(IMAGES_PATH, 'utf8'))
const rawStations: unknown[] = JSON.parse(readFileSync(STATIONS_PATH, 'utf8'))

describe('assets/station-images.json', () => {
  let stations: Station[]
  beforeAll(() => {
    stations = validateStationList(rawStations)
  })

  it('covers the large majority of stations', () => {
    const covered = stations.filter((s) => stationImageFor(rawImages, s) !== null)
    expect(covered.length / stations.length).toBeGreaterThan(0.9)
  })

  it('has no entry that does not correspond to a real station', () => {
    const validKeys = new Set(stations.map(stationImageKey))
    const orphans = Object.keys(rawImages).filter((key) => !validKeys.has(key))
    expect(orphans).toEqual([])
  })

  it('gives every entry an https Wikimedia URL', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      expect(image.url, key).toMatch(/^https:\/\/upload\.wikimedia\.org\//)
    }
  })

  /**
   * The licence is what makes an image usable at all — DESIGN §9.6a treats
   * attribution as a licence obligation, not a nicety. The build script
   * drops any image it can't attribute, so an entry without a licence would
   * mean that guard broke.
   */
  it('gives every entry a non-empty licence', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      expect(image.licence, key).toBeTruthy()
    }
  })

  it('gives every entry a Wikipedia source page', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      expect(image.sourcePage, key).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//)
    }
  })

  /**
   * Regression test for a real finding: Wikipedia's summary thumbnail is
   * whatever the infobox leads with, which for several places was the
   * municipal FLAG rather than a photograph. A flag is not a picture of the
   * place, so none should survive into the shipped manifest.
   */
  it('contains no flags, seals, coats of arms, or other vector art', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      const filename = decodeURIComponent(image.url.split('/').pop() ?? '')
      expect(filename, key).not.toMatch(/\.svg/i)
      expect(filename.replace(/_/g, ' '), key).not.toMatch(/\b(flags?|seals?|coats? of arms|logos?)\b/i)
    }
  })

  /**
   * Regression test for a bug that passed every build-time check and only
   * failed on a real device: hand-rewriting a thumbnail URL's width yields
   * a size Wikimedia refuses to serve (HTTP 400, "Use thumbnail sizes
   * listed on w.wiki/GHai"). Widths must come from the API's own
   * pithumbsize response, which lands on a served size — so the assertion
   * is "big enough for a banner", not one specific number.
   */
  /**
   * A URL here is either a sized thumbnail (".../960px-Foo.jpg") or the
   * ORIGINAL file (".../commons/1/1f/Foo.jpg"), because pithumbsize only
   * scales down — a file narrower than the request comes back whole. Both
   * are legitimate; what must never appear is a hand-built width, which
   * Wikimedia refuses to serve (HTTP 400).
   */
  it('uses either an API-sized thumbnail or the original file, never a hand-built width', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      const width = /\/(\d+)px-/.exec(image.url)?.[1]
      if (width !== undefined) {
        expect(Number(width), `${key} (${image.url})`).toBeGreaterThanOrEqual(500)
      } else {
        expect(image.url, key).toMatch(/\/wikipedia\/[^/]+\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+$/)
      }
    }
  })
})
