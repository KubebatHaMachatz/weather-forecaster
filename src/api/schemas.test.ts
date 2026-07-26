import { describe, expect, it } from 'vitest'
import { errorEnvelopeSchema, openMeteoEnvelopeSchema } from './schemas.js'

/**
 * Shapes below are modelled on the live responses captured during the API
 * spike (SPIKE.md) — field names, nesting, and the error envelope are all
 * confirmed against the real API, not guessed from documentation.
 */

const REALISTIC_SINGLE_VARIABLE = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 0.34,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  elevation: 56,
  hourly_units: { time: 'iso8601', temperature_2m: '°C' },
  hourly: {
    time: ['2026-07-26T00:00', '2026-07-26T01:00', '2026-07-26T02:00'],
    temperature_2m: [12.3, 11.7, 11.4],
  },
}

// SPIKE.md §2: a single multi-model call returns one series per model, keyed
// `<variable>_<model>`, with regional coverage gaps surfacing as null.
const REALISTIC_MULTI_MODEL = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 0.34,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  elevation: 56,
  hourly_units: { time: 'iso8601' },
  hourly: {
    time: ['2026-07-26T00:00', '2026-07-26T01:00'],
    temperature_2m_ecmwf_ifs025: [12.0, 12.4],
    temperature_2m_icon_seamless: [13.3, 13.5],
    temperature_2m_gfs_seamless: [13.8, 13.9],
    temperature_2m_bom_access_global: [null, null], // no regional coverage
  },
}

// Not spike-verified (the spike never exercised `current`) — modelled on
// Open-Meteo's documented current-conditions shape: a single snapshot, not a
// time series, with `time`/`interval` plus one value per requested variable.
const REALISTIC_CURRENT = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 0.12,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  elevation: 56,
  current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C' },
  current: {
    time: '2026-07-26T07:30',
    interval: 900,
    temperature_2m: 15.3,
  },
}

const REALISTIC_ARCHIVE = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 1.02,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  hourly_units: { time: 'iso8601', temperature_2m: '°C' },
  hourly: {
    time: ['2026-07-25T00:00', '2026-07-25T01:00'],
    temperature_2m: [13.4, 13.5],
  },
}

describe('openMeteoEnvelopeSchema', () => {
  it('parses a realistic single-variable forecast response', () => {
    const result = openMeteoEnvelopeSchema.parse(REALISTIC_SINGLE_VARIABLE)
    expect(result.hourly?.time).toEqual(REALISTIC_SINGLE_VARIABLE.hourly.time)
    expect(result.hourly?.temperature_2m).toEqual([12.3, 11.7, 11.4])
    expect(result.elevation).toBe(56)
  })

  it('parses arbitrary per-model keys in a multi-model response', () => {
    const result = openMeteoEnvelopeSchema.parse(REALISTIC_MULTI_MODEL)
    expect(result.hourly?.temperature_2m_ecmwf_ifs025).toEqual([12.0, 12.4])
    expect(result.hourly?.temperature_2m_icon_seamless).toEqual([13.3, 13.5])
  })

  it('accepts null within an hourly series for a model with no regional coverage', () => {
    const result = openMeteoEnvelopeSchema.parse(REALISTIC_MULTI_MODEL)
    expect(result.hourly?.temperature_2m_bom_access_global).toEqual([null, null])
  })

  it('parses an archive response with no elevation field', () => {
    const result = openMeteoEnvelopeSchema.parse(REALISTIC_ARCHIVE)
    expect(result.elevation).toBeUndefined()
    expect(result.hourly?.temperature_2m).toEqual([13.4, 13.5])
  })

  it('parses a response with a daily block alongside hourly', () => {
    const result = openMeteoEnvelopeSchema.parse({
      ...REALISTIC_SINGLE_VARIABLE,
      daily_units: { time: 'iso8601', temperature_2m_max: '°C' },
      daily: {
        time: ['2026-07-26'],
        temperature_2m_max: [18.2],
      },
    })
    expect(result.daily?.temperature_2m_max).toEqual([18.2])
  })

  it('parses a response with neither hourly nor daily present', () => {
    const { hourly: _h, hourly_units: _hu, ...rest } = REALISTIC_SINGLE_VARIABLE
    const result = openMeteoEnvelopeSchema.parse(rest)
    expect(result.hourly).toBeUndefined()
  })

  it('rejects a response missing required top-level fields', () => {
    const { latitude: _lat, ...rest } = REALISTIC_SINGLE_VARIABLE
    expect(() => openMeteoEnvelopeSchema.parse(rest)).toThrow()
  })

  it('rejects an hourly block with no time array', () => {
    const broken = {
      ...REALISTIC_SINGLE_VARIABLE,
      hourly: { temperature_2m: [12.3, 11.7, 11.4] },
    }
    expect(() => openMeteoEnvelopeSchema.parse(broken)).toThrow()
  })

  it('rejects an hourly series that is not an array of nullable numbers', () => {
    const broken = {
      ...REALISTIC_SINGLE_VARIABLE,
      hourly: { time: ['2026-07-26T00:00'], temperature_2m: ['not-a-number'] },
    }
    expect(() => openMeteoEnvelopeSchema.parse(broken)).toThrow()
  })

  it('rejects latitude/longitude that are not numbers', () => {
    expect(() =>
      openMeteoEnvelopeSchema.parse({ ...REALISTIC_SINGLE_VARIABLE, latitude: 'north' }),
    ).toThrow()
  })

  /**
   * Regression test for a review finding: ForecastParams.current (forecast.ts)
   * is a real, wired-up query parameter, but the envelope schema had no
   * `current`/`current_units` field — Zod's default key-stripping silently
   * discarded whatever the API returned for it, with zero test coverage.
   */
  it('parses a current-conditions response and keeps the current block', () => {
    const result = openMeteoEnvelopeSchema.parse(REALISTIC_CURRENT)
    expect(result.current?.time).toBe('2026-07-26T07:30')
    expect(result.current?.interval).toBe(900)
    expect(result.current?.temperature_2m).toBe(15.3)
  })

  it('rejects a current block with no time field', () => {
    const broken = {
      ...REALISTIC_CURRENT,
      current: { interval: 900, temperature_2m: 15.3 },
    }
    expect(() => openMeteoEnvelopeSchema.parse(broken)).toThrow()
  })

  it('rejects a current block with no interval field', () => {
    const broken = {
      ...REALISTIC_CURRENT,
      current: { time: '2026-07-26T07:30', temperature_2m: 15.3 },
    }
    expect(() => openMeteoEnvelopeSchema.parse(broken)).toThrow()
  })

  it('accepts a null current variable, matching the nullable convention used elsewhere', () => {
    const result = openMeteoEnvelopeSchema.parse({
      ...REALISTIC_CURRENT,
      current: { ...REALISTIC_CURRENT.current, temperature_2m: null },
    })
    expect(result.current?.temperature_2m).toBeNull()
  })
})

describe('errorEnvelopeSchema', () => {
  it('parses the real error shape observed in the spike', () => {
    // Captured verbatim: SPIKE.md §2 (ensemble 429) and §4 (archive 400).
    const result = errorEnvelopeSchema.parse({
      error: true,
      reason: 'Daily API request limit exceeded. Please try again tomorrow.',
    })
    expect(result.reason).toBe('Daily API request limit exceeded. Please try again tomorrow.')
  })

  it('rejects a body with error: false', () => {
    expect(() => errorEnvelopeSchema.parse({ error: false, reason: 'fine' })).toThrow()
  })

  it('rejects a body missing reason', () => {
    expect(() => errorEnvelopeSchema.parse({ error: true })).toThrow()
  })

  it('rejects a successful envelope', () => {
    expect(() => errorEnvelopeSchema.parse({ latitude: 0, longitude: 0 })).toThrow()
  })
})
