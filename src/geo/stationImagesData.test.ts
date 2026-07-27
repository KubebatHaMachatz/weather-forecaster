import { existsSync, readFileSync } from 'node:fs'
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

/**
 * The generated require() map is read as TEXT, not imported: its values are
 * Metro asset requires for .jpg files, which only Metro can resolve. Parsing
 * the keys still verifies the invariant that matters here — that the
 * generated artifact and the manifest agree.
 */
const generatedKeys = new Set(
  [...readFileSync(fileURLToPath(new URL('./stationPhotoAssets.ts', import.meta.url)), 'utf8')
    .matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*require\(/gm)].map((m) => JSON.parse(`"${m[1]}"`)),
)
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

  it('gives every entry a bundled photo file, not a remote URL', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      expect(image.file, key).toMatch(/^[a-z0-9-]+\.jpg$/)
      expect(image, key).not.toHaveProperty('url')
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
      const filename = image.file
      expect(filename, key).not.toMatch(/\.svg/i)
      expect(filename.replace(/_/g, ' '), key).not.toMatch(/\b(flags?|seals?|coats? of arms|logos?)\b/i)
    }
  })

  /**
   * Every manifest entry must have a real file on disk AND an entry in the
   * generated require() map — a manifest row with no bundled asset renders
   * the fallback, silently losing a photo we believed we shipped.
   */
  it('has a real file on disk for every entry', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      const path = fileURLToPath(new URL(`../../assets/photos/${image.file}`, import.meta.url))
      expect(existsSync(path), `${key} -> ${image.file}`).toBe(true)
    }
  })

  it('has a generated require() entry for every manifest entry', () => {
    for (const key of Object.keys(rawImages)) {
      expect(generatedKeys.has(key), key).toBe(true)
    }
  })

  it('has no orphaned require() entry without a manifest row', () => {
    for (const key of generatedKeys) {
      expect(rawImages, key).toHaveProperty(key)
    }
  })

  /**
   * CC BY and CC BY-SA require naming the author. Only CC0 and public
   * domain may ship without one, so anything else missing an artist means
   * the pipeline's attribution gate failed.
   */
  it('names an author for every licence that requires attribution', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      const exempt = /^(cc0|public domain)$/i.test(image.licence)
      if (!exempt) expect(image.artist, `${key} (${image.licence})`).toBeTruthy()
    }
  })

  it('uses only known free licences, never a vague custom grant', () => {
    for (const [key, image] of Object.entries(rawImages)) {
      expect(image.licence, key).toMatch(/^(cc[ -]by([ -]sa)?[ -]\d(\.\d)?|cc0|public domain|fal)/i)
    }
  })
})
