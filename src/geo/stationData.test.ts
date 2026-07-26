import { describe, expect, it } from 'vitest'
import { stationRecordSchema, validateStationList } from './stationData.js'

/**
 * Validates the bundled JSON content (assets/stations.json, DESIGN §9.5)
 * against requirements the pure Station interface doesn't enforce — e.g.
 * climateRegime is optional on the TS type (so existing test fixtures don't
 * need it) but required in the real, shipped data.
 */

const VALID_RECORD = {
  name: 'Valparaíso',
  country: 'Chile',
  lat: -33.05,
  lon: -71.62,
  timezone: 'America/Santiago',
  utcOffsetSeconds: -4 * 3600,
  descriptor: 'Pacific coast, 120 km west of Santiago',
  climateRegime: 'mediterranean',
}

describe('stationRecordSchema', () => {
  it('parses a valid record', () => {
    const result = stationRecordSchema.parse(VALID_RECORD)
    expect(result.name).toBe('Valparaíso')
    expect(result.climateRegime).toBe('mediterranean')
  })

  it('accepts an optional admin1', () => {
    const result = stationRecordSchema.parse({ ...VALID_RECORD, admin1: 'Valparaíso Region' })
    expect(result.admin1).toBe('Valparaíso Region')
  })

  it('rejects an empty name', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, name: '' })).toThrow()
  })

  it('rejects an empty country', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, country: '' })).toThrow()
  })

  it('rejects a latitude outside [-90, 90]', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, lat: 91 })).toThrow()
  })

  it('rejects a longitude outside [-180, 180]', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, lon: 200 })).toThrow()
  })

  it('rejects a timezone that does not look like an IANA zone name', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, timezone: 'GMT-4' })).toThrow()
  })

  it('accepts a multi-segment IANA zone name', () => {
    const result = stationRecordSchema.parse({
      ...VALID_RECORD,
      timezone: 'America/Argentina/Buenos_Aires',
    })
    expect(result.timezone).toBe('America/Argentina/Buenos_Aires')
  })

  /**
   * Regression test: assets/stations.json's real, live-geocoded data for
   * Port-au-Prince has timezone "America/Port-au-Prince" — a genuine IANA
   * zone name containing hyphens, which the schema's regex rejected.
   */
  it('accepts a real IANA zone name containing hyphens', () => {
    const result = stationRecordSchema.parse({
      ...VALID_RECORD,
      timezone: 'America/Port-au-Prince',
    })
    expect(result.timezone).toBe('America/Port-au-Prince')
  })

  it('rejects a utcOffsetSeconds outside the real-world range', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, utcOffsetSeconds: 20 * 3600 })).toThrow()
  })

  it('rejects a non-integer utcOffsetSeconds', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, utcOffsetSeconds: 3600.5 })).toThrow()
  })

  it('rejects an empty descriptor', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, descriptor: '' })).toThrow()
  })

  it('rejects a descriptor over 140 characters', () => {
    expect(() =>
      stationRecordSchema.parse({ ...VALID_RECORD, descriptor: 'x'.repeat(141) }),
    ).toThrow()
  })

  it('rejects a climateRegime outside the known set', () => {
    expect(() => stationRecordSchema.parse({ ...VALID_RECORD, climateRegime: 'tundra' })).toThrow()
  })

  it('rejects a record missing climateRegime, unlike the pure Station type', () => {
    const { climateRegime: _omit, ...withoutRegime } = VALID_RECORD
    expect(() => stationRecordSchema.parse(withoutRegime)).toThrow()
  })
})

describe('validateStationList', () => {
  const otherStation = {
    ...VALID_RECORD,
    name: 'Reykjavík',
    country: 'Iceland',
    lat: 64.15,
    lon: -21.94,
    timezone: 'Atlantic/Reykjavik',
    utcOffsetSeconds: 0,
    climateRegime: 'subarctic',
  }

  it('accepts a list of distinct, valid stations', () => {
    expect(() => validateStationList([VALID_RECORD, otherStation])).not.toThrow()
  })

  it('rejects an empty list', () => {
    expect(() => validateStationList([])).toThrow(/empty/i)
  })

  /**
   * daily.ts's station-selection hash is keyed on (date, country, name) —
   * NOT admin1 — so two records sharing a (country, name) pair would be
   * indistinguishable to the picker: one would permanently shadow the other.
   */
  it('rejects two stations with the same (country, name) pair', () => {
    const duplicate = { ...otherStation, name: VALID_RECORD.name, country: VALID_RECORD.country }
    expect(() => validateStationList([VALID_RECORD, duplicate])).toThrow(/duplicate/i)
  })

  it('allows the same city name in two different countries', () => {
    const cordobaSpain = { ...VALID_RECORD, name: 'Córdoba', country: 'Spain', admin1: 'Andalusia' }
    const cordobaArgentina = { ...otherStation, name: 'Córdoba', country: 'Argentina' }
    expect(() => validateStationList([cordobaSpain, cordobaArgentina])).not.toThrow()
  })

  it('rejects a list containing an invalid record, reporting which one', () => {
    const broken = { ...otherStation, lat: 999 }
    expect(() => validateStationList([VALID_RECORD, broken])).toThrow(/Reykjavík/)
  })
})
