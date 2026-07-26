import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatStation } from './station.js'
import { CLIMATE_REGIMES } from './station.js'
import { validateStationList } from './stationData.js'
import { assertQueryableLatLon } from './coordinates.js'

/**
 * Validates the real bundled content (assets/stations.json, DESIGN §9.5) —
 * not a fixture. Every station here came from a live Open-Meteo geocoding
 * lookup (scripts/build-stations.mjs); descriptors and climate regimes are
 * hand-authored (scripts/station-enrichment.mjs).
 */

const STATIONS_PATH = fileURLToPath(new URL('../../assets/stations.json', import.meta.url))
const raw: unknown[] = JSON.parse(readFileSync(STATIONS_PATH, 'utf8'))

describe('assets/stations.json', () => {
  it('passes full schema validation', () => {
    expect(() => validateStationList(raw)).not.toThrow()
  })

  const stations = validateStationList(raw)

  it('has a substantial number of stations', () => {
    // DESIGN §9.5 targets ~300; not pinned exactly since this is real
    // curated content, not a generated fixture.
    expect(stations.length).toBeGreaterThanOrEqual(250)
  })

  it('formats every station without throwing (DESIGN §2.2)', () => {
    for (const station of stations) {
      expect(() => formatStation(station)).not.toThrow()
    }
  })

  it('passes the stricter network-boundary coordinate check for every station', () => {
    for (const station of stations) {
      expect(() => assertQueryableLatLon({ lat: station.lat, lon: station.lon }, station.name)).not.toThrow()
    }
  })

  it('covers every climate regime in the taxonomy', () => {
    const covered = new Set(stations.map((s) => s.climateRegime))
    for (const regime of CLIMATE_REGIMES) {
      expect(covered.has(regime)).toBe(true)
    }
  })

  it('spans both hemispheres', () => {
    expect(stations.some((s) => s.lat > 0)).toBe(true)
    expect(stations.some((s) => s.lat < 0)).toBe(true)
  })

  it('spans a wide range of latitudes, poles to tropics', () => {
    const lats = stations.map((s) => s.lat)
    expect(Math.max(...lats)).toBeGreaterThan(60) // high Arctic
    expect(Math.min(...lats)).toBeLessThan(-45) // sub-Antarctic
    expect(stations.some((s) => Math.abs(s.lat) < 5)).toBe(true) // near-equatorial
  })

  it('spans a wide range of longitudes, not clustered in one region', () => {
    const lons = stations.map((s) => s.lon)
    expect(Math.max(...lons) - Math.min(...lons)).toBeGreaterThan(300)
  })

  it('covers a substantial number of distinct countries', () => {
    const countries = new Set(stations.map((s) => s.country))
    expect(countries.size).toBeGreaterThanOrEqual(100)
  })

  it('every station has a real, non-placeholder descriptor', () => {
    for (const station of stations) {
      expect(station.descriptor.length).toBeGreaterThan(10)
      expect(station.descriptor).not.toMatch(/^(TODO|TBD|placeholder|xxx)$/i)
    }
  })

  it('has no exact duplicate descriptors (a sign of copy-paste content)', () => {
    const descriptors = stations.map((s) => s.descriptor)
    expect(new Set(descriptors).size).toBe(descriptors.length)
  })

  it('has plausible per-regime coverage (no regime with only a token entry)', () => {
    const counts = new Map<string, number>()
    for (const s of stations) {
      // climateRegime is optional on the pure Station type (arbitrary test
      // fixtures don't need it) but required by validateStationList's
      // content schema — always present here, hence the explicit check
      // rather than a silent `!` assertion.
      if (!s.climateRegime) throw new Error(`validated station "${s.name}" has no climateRegime`)
      counts.set(s.climateRegime, (counts.get(s.climateRegime) ?? 0) + 1)
    }
    for (const regime of CLIMATE_REGIMES) {
      expect(counts.get(regime) ?? 0).toBeGreaterThanOrEqual(5)
    }
  })
})
