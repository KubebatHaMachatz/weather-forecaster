import { describe, expect, it } from 'vitest'
import { assertCleanPick, buildStationRecord, utcOffsetSeconds } from './assemble-stations.mjs'

describe('utcOffsetSeconds', () => {
  it('computes a known UTC-4 offset', () => {
    expect(utcOffsetSeconds('America/Santiago', new Date('2026-07-26T00:00:00Z'))).toBe(-4 * 3600)
  })

  it('computes UTC+0', () => {
    expect(utcOffsetSeconds('Atlantic/Reykjavik', new Date('2026-07-26T00:00:00Z'))).toBe(0)
  })

  it('computes a fractional-hour offset', () => {
    expect(utcOffsetSeconds('Asia/Kathmandu', new Date('2026-07-26T00:00:00Z'))).toBe(5 * 3600 + 45 * 60)
  })
})

describe('assertCleanPick', () => {
  const clean = { queryName: 'Alert', expectedCountry: 'Canada', countryMatched: true, ambiguous: false }

  it('accepts a clean, country-matched, unambiguous pick', () => {
    expect(() => assertCleanPick(clean)).not.toThrow()
  })

  /**
   * Regression test for a review finding: build-stations.mjs computes and
   * logs countryMatched to stderr, but assemble-stations.mjs never read it
   * — a mismatched station flowed straight through into shipped data with
   * only a human reading a 314-line stderr batch as the safety net.
   */
  it('rejects a country-mismatched record instead of shipping it silently', () => {
    expect(() => assertCleanPick({ ...clean, countryMatched: false })).toThrow(/country/i)
  })

  /**
   * Regression test for a review finding: pickBest's ambiguous flag (no
   * capital/exact-match/population signal broke the tie) was computed but
   * never surfaced past the intermediate JSON — assemble-stations.mjs must
   * refuse to ship an admittedly-arbitrary pick rather than silently
   * accepting it.
   */
  it('rejects an ambiguous pick instead of shipping it silently', () => {
    expect(() => assertCleanPick({ ...clean, ambiguous: true })).toThrow(/ambiguous/i)
  })
})

describe('buildStationRecord', () => {
  const resolvedEntry = {
    queryName: 'Valparaíso',
    expectedCountry: 'Chile',
    climateRegime: 'mediterranean',
    countryMatched: true,
    ambiguous: false,
    name: 'Valparaíso',
    country: 'Chile',
    countryCode: 'CL',
    admin1: null,
    lat: -33.05,
    lon: -71.62,
    timezone: 'America/Santiago',
    population: 296000,
    featureCode: 'PPLA2',
  }
  const enrichment = { descriptor: 'Pacific coast, 120 km west of Santiago.' }

  it('builds a complete station record', () => {
    const record = buildStationRecord(resolvedEntry, enrichment)
    expect(record.name).toBe('Valparaíso')
    expect(record.country).toBe('Chile')
    expect(record.descriptor).toBe(enrichment.descriptor)
    expect(record.climateRegime).toBe('mediterranean')
    expect(record.utcOffsetSeconds).toBe(-4 * 3600)
  })

  it('applies a displayName override from enrichment when given', () => {
    const record = buildStationRecord(resolvedEntry, { ...enrichment, displayName: 'Valpo' })
    expect(record.name).toBe('Valpo')
  })

  /**
   * Regression test for a review finding: displayCountry used to prefer the
   * geocoder's raw returned country string over the canonical name
   * declared in station-candidates.mjs, producing inconsistent results —
   * some countries shipped canonical, others shipped whatever alias
   * variant the geocoder happened to return (e.g. "The Netherlands"
   * instead of "Netherlands", though country DID match via
   * COUNTRY_ALIASES). The canonical, declared country must always win.
   */
  it('always uses the canonical expectedCountry for display, never the geocoder-returned variant', () => {
    const record = buildStationRecord(
      { ...resolvedEntry, expectedCountry: 'Netherlands', country: 'The Netherlands' },
      enrichment,
    )
    expect(record.country).toBe('Netherlands')
  })

  /**
   * A territory (country: null from the geocoder, matched via country_code)
   * must still get a real displayed country from expectedCountry.
   */
  it('falls back to expectedCountry when the geocoder returned no country at all', () => {
    const record = buildStationRecord({ ...resolvedEntry, country: null, expectedCountry: 'Greenland' }, enrichment)
    expect(record.country).toBe('Greenland')
  })

  /**
   * Regression test for a review finding: Alert, Canada shipped with
   * timezone "America/Halifax" (Atlantic time) — verified wrong by cross-
   * checking Open-Meteo's FORECAST api (a separate timezone lookup from its
   * geocoding database) for Alert's exact coordinates, which resolves to
   * "America/Iqaluit" (Eastern time, matching the rest of Nunavut) instead.
   * The two are NOT equivalent zones (different real-world clock behaviour,
   * unlike the Hanoi case below), so this must be a real override that also
   * changes utcOffsetSeconds, not just a display-name substitution.
   */
  it('overrides Alert, Canada to the timezone its coordinates actually resolve to', () => {
    const record = buildStationRecord(
      { ...resolvedEntry, queryName: 'Alert', expectedCountry: 'Canada', name: 'Alert', timezone: 'America/Halifax' },
      enrichment,
    )
    expect(record.timezone).toBe('America/Iqaluit')
  })

  /**
   * Regression test for a review finding: Hanoi shipped with timezone
   * "Asia/Bangkok". Cross-checked via the same forecast-api method used for
   * Alert: Open-Meteo's OWN forecast timezone lookup ALSO returns
   * "Asia/Bangkok" for Hanoi's exact coordinates (unlike Alert, where the
   * two lookups disagreed) — Bangkok and Ho_Chi_Minh share identical
   * UTC+7-no-DST rules, so this is very likely an IANA tzdata alias choice
   * (one canonical zone, multiple representative-city names), not a
   * functional error. The override here is display-only: it must NOT
   * change utcOffsetSeconds, only the more geographically apt zone name.
   */
  it('overrides Hanoi to a more geographically apt zone name with no change to utcOffsetSeconds', () => {
    const before = buildStationRecord(
      { ...resolvedEntry, queryName: 'Hanoi', expectedCountry: 'Vietnam', name: 'Hanoi', timezone: 'Asia/Bangkok' },
      enrichment,
    )
    expect(before.timezone).toBe('Asia/Ho_Chi_Minh')
    expect(before.utcOffsetSeconds).toBe(7 * 3600)
  })
})
