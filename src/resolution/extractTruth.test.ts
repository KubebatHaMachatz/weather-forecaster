import { describe, expect, it } from 'vitest'
import { archiveQueryFor, extractTruth } from './extractTruth.js'
import type { Call } from '../puzzle/daily.js'

const station = {
  name: 'Valparaíso',
  country: 'Chile',
  lat: -33.05,
  lon: -71.62,
  timezone: 'America/Santiago',
  utcOffsetSeconds: -14400,
  descriptor: 'x',
}

const call = (overrides: Partial<Call> = {}): Call => ({
  date: '2026-07-27',
  targetDate: '2026-07-28',
  station,
  questionType: 'point-temperature',
  signalBudget: 10,
  stationLabel: 'Valparaíso, Chile',
  targetHourLocal: 15,
  ...overrides,
})

describe('archiveQueryFor', () => {
  /**
   * DESIGN §9.2: truth ALWAYS comes from the archive, and the request must
   * cover exactly the target date — a wider window would risk reading the
   * wrong day's weather.
   */
  it('asks for exactly the target date', () => {
    const query = archiveQueryFor(call())
    expect(query.startDate).toBe('2026-07-28')
    expect(query.endDate).toBe('2026-07-28')
  })

  it('asks in the station’s own timezone, not UTC', () => {
    // The target hour is a LOCAL hour, so the series must be local too or
    // hour 15 would index into a different moment entirely.
    expect(archiveQueryFor(call()).timezone).toBe('America/Santiago')
  })

  it('requests hourly temperature for a point-temperature question', () => {
    expect(archiveQueryFor(call()).hourly).toContain('temperature_2m')
  })

  it('requests a daily maximum for a daily-extreme question', () => {
    const query = archiveQueryFor(call({ questionType: 'daily-extreme' }))
    expect(query.daily).toContain('temperature_2m_max')
  })

  it('requests daily precipitation for a precipitation question', () => {
    const query = archiveQueryFor(call({ questionType: 'precipitation' }))
    expect(query.daily).toContain('precipitation_sum')
  })

  it('requests peak gusts for a gust-exceedance question', () => {
    const query = archiveQueryFor(call({ questionType: 'gust-exceedance' }))
    expect(query.daily).toContain('wind_gusts_10m_max')
  })
})

describe('extractTruth — point temperature', () => {
  const hourly = {
    time: Array.from({ length: 24 }, (_, h) => `2026-07-28T${String(h).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, h) => h),
  }

  it('reads the value at the asked-about local hour, not the first hour', () => {
    expect(extractTruth(call(), { hourly })).toEqual({ kind: 'value', value: 15 })
  })

  it('reads a different hour when the Call asks for one', () => {
    expect(extractTruth(call({ targetHourLocal: 6 }), { hourly })).toEqual({ kind: 'value', value: 6 })
  })

  /**
   * Matching by timestamp rather than by array index: an archive response
   * that omits or pads hours would silently score the wrong moment if the
   * index were trusted.
   */
  it('matches on the timestamp, so a short or shifted series cannot mis-index', () => {
    const shifted = {
      time: ['2026-07-28T13:00', '2026-07-28T14:00', '2026-07-28T15:00'],
      temperature_2m: [130, 140, 150],
    }
    expect(extractTruth(call(), { hourly: shifted })).toEqual({ kind: 'value', value: 150 })
  })

  it('returns null when the asked-about hour is absent rather than guessing', () => {
    const missing = { time: ['2026-07-28T13:00'], temperature_2m: [130] }
    expect(extractTruth(call(), { hourly: missing })).toBeNull()
  })

  it('returns null when the value at that hour is null', () => {
    const gappy = { time: ['2026-07-28T15:00'], temperature_2m: [null] }
    expect(extractTruth(call(), { hourly: gappy })).toBeNull()
  })

  it('returns null when the response has no hourly block at all', () => {
    expect(extractTruth(call(), {})).toBeNull()
  })
})

describe('extractTruth — daily questions', () => {
  it('reads the daily maximum for a daily-extreme question', () => {
    const daily = { time: ['2026-07-28'], temperature_2m_max: [21.5] }
    expect(extractTruth(call({ questionType: 'daily-extreme' }), { daily })).toEqual({
      kind: 'value',
      value: 21.5,
    })
  })

  /**
   * DESIGN §2.1's precipitation question is "≥0.2 mm", so the threshold is
   * part of the question — scoring against "any measurable rain" would be
   * scoring a different question than the player was asked.
   */
  it('resolves precipitation as occurrence at the 0.2 mm threshold', () => {
    const at = (sum: number) => extractTruth(call({ questionType: 'precipitation' }), { daily: { time: ['2026-07-28'], precipitation_sum: [sum] } })
    expect(at(0.5)).toEqual({ kind: 'occurred', occurred: true })
    expect(at(0.2)).toEqual({ kind: 'occurred', occurred: true })
    expect(at(0.1)).toEqual({ kind: 'occurred', occurred: false })
    expect(at(0)).toEqual({ kind: 'occurred', occurred: false })
  })

  it('resolves gusts as occurrence at the 40 km/h threshold', () => {
    const at = (gust: number) => extractTruth(call({ questionType: 'gust-exceedance' }), { daily: { time: ['2026-07-28'], wind_gusts_10m_max: [gust] } })
    expect(at(55)).toEqual({ kind: 'occurred', occurred: true })
    expect(at(40)).toEqual({ kind: 'occurred', occurred: false }) // "over 40", not "at least"
    expect(at(12)).toEqual({ kind: 'occurred', occurred: false })
  })

  it('returns null for a daily series missing the target date', () => {
    const daily = { time: ['2026-07-29'], temperature_2m_max: [21.5] }
    expect(extractTruth(call({ questionType: 'daily-extreme' }), { daily })).toBeNull()
  })

  it('returns null when the daily value is null', () => {
    const daily = { time: ['2026-07-28'], precipitation_sum: [null] }
    expect(extractTruth(call({ questionType: 'precipitation' }), { daily })).toBeNull()
  })
})
