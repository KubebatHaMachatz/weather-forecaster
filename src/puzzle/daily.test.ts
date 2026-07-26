import { describe, expect, it } from 'vitest'
import { generateCall, nextDate, QUESTION_TYPES } from './daily.js'
import type { Station } from '../geo/station.js'

/**
 * The daily Call is a pure function of the date (DESIGN §10). That is what
 * lets every player get the same puzzle with no server: there is nothing to
 * synchronise, because nothing is random in the ordinary sense.
 */

const station = (name: string, country: string, lat: number, lon: number): Station => ({
  name,
  country,
  lat,
  lon,
  timezone: 'UTC',
  utcOffsetSeconds: 0,
  descriptor: `${name} descriptor`,
})

const STATIONS: Station[] = [
  station('Valparaíso', 'Chile', -33.05, -71.62),
  station('Reykjavík', 'Iceland', 64.15, -21.94),
  station('Wellington', 'New Zealand', -41.29, 174.78),
  station('Ulaanbaatar', 'Mongolia', 47.92, 106.92),
  station('Bergen', 'Norway', 60.39, 5.32),
  station('Perth', 'Australia', -31.95, 115.86),
]

describe('nextDate', () => {
  it.each([
    ['2026-07-27', '2026-07-28'],
    ['2026-07-31', '2026-08-01'],
    ['2026-12-31', '2027-01-01'],
    ['2026-02-28', '2026-03-01'],
    ['2028-02-28', '2028-02-29'],
    ['2028-02-29', '2028-03-01'],
  ])('advances %s to %s', (from, expected) => {
    expect(nextDate(from)).toBe(expected)
  })

  it('rejects a malformed date', () => {
    expect(() => nextDate('2026-7-1')).toThrow(/date/i)
  })
})

describe('generateCall', () => {
  it('is a pure function of the date', () => {
    const a = generateCall('2026-07-27', STATIONS)
    const b = generateCall('2026-07-27', STATIONS)
    expect(a).toEqual(b)
  })

  it('gives different dates different puzzles', () => {
    const week = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']
      .map((d) => generateCall(d, STATIONS))
    // Not a strict guarantee for any single pair, but across a week the odds
    // of total collision are negligible.
    const signatures = new Set(week.map((c) => `${c.station.name}|${c.questionType}`))
    expect(signatures.size).toBeGreaterThan(1)
  })

  it('targets the day after the Call is issued', () => {
    expect(generateCall('2026-12-31', STATIONS).targetDate).toBe('2027-01-01')
  })

  it('always picks a station from the supplied list', () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-04-${String(day).padStart(2, '0')}`
      const call = generateCall(date, STATIONS)
      expect(STATIONS).toContain(call.station)
    }
  })

  it('only issues question types that v1 actually supports', () => {
    // DESIGN §12 defers types 5-8 to a later release.
    for (let day = 1; day <= 28; day++) {
      const call = generateCall(`2026-04-${String(day).padStart(2, '0')}`, STATIONS)
      expect(QUESTION_TYPES).toContain(call.questionType)
    }
  })

  it('issues a Signal budget within the designed range', () => {
    for (let day = 1; day <= 28; day++) {
      const call = generateCall(`2026-04-${String(day).padStart(2, '0')}`, STATIONS)
      expect(call.signalBudget).toBeGreaterThanOrEqual(8)
      expect(call.signalBudget).toBeLessThanOrEqual(12)
      expect(Number.isInteger(call.signalBudget)).toBe(true)
    }
  })

  it('gives point-temperature questions a sensible local target hour', () => {
    const calls = Array.from({ length: 200 }, (_, i) =>
      generateCall(`2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, STATIONS),
    ).filter((c) => c.questionType === 'point-temperature')

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.targetHourLocal).toBeGreaterThanOrEqual(0)
      expect(call.targetHourLocal).toBeLessThanOrEqual(23)
      expect(Number.isInteger(call.targetHourLocal)).toBe(true)
    }
  })

  it('leaves targetHourLocal unset for whole-day questions', () => {
    const dailyExtreme = Array.from({ length: 200 }, (_, i) =>
      generateCall(`2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, STATIONS),
    ).find((c) => c.questionType === 'daily-extreme')

    expect(dailyExtreme).toBeDefined()
    expect(dailyExtreme?.targetHourLocal).toBeUndefined()
  })

  /**
   * Order-independence matters because the station list is a bundled JSON file
   * that someone will inevitably re-sort or append to. If ordering leaked into
   * the puzzle, editing that file would silently rewrite history.
   */
  it('does not depend on the order of the station list', () => {
    const reversed = [...STATIONS].reverse()
    expect(generateCall('2026-07-27', reversed)).toEqual(generateCall('2026-07-27', STATIONS))
  })

  it('spreads across the whole station list over time', () => {
    const seen = new Set<string>()
    for (let day = 1; day <= 366; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)
      seen.add(generateCall(date, STATIONS).station.name)
    }
    expect(seen.size).toBe(STATIONS.length)
  })

  it('uses every supported question type over time', () => {
    const seen = new Set<string>()
    for (let day = 1; day <= 366; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)
      seen.add(generateCall(date, STATIONS).questionType)
    }
    expect(seen.size).toBe(QUESTION_TYPES.length)
  })

  it('rejects an empty station list', () => {
    expect(() => generateCall('2026-07-27', [])).toThrow(/station/i)
  })

  it('rejects a malformed date', () => {
    expect(() => generateCall('July 27th', STATIONS)).toThrow(/date/i)
  })
})
