import { describe, expect, it } from 'vitest'
import { dayLengthHours, dayOfYear } from './daylight.js'

/**
 * Day length is shown on the Chart (DESIGN §5.1) because it is one of the
 * first things a forecaster reads off a location — it encodes latitude and
 * season together. Purely astronomical, so it needs no API call.
 */

const JUNE_SOLSTICE = 172 // 21 June in a non-leap year
const DECEMBER_SOLSTICE = 355 // 21 December
const EQUINOX = 80 // ~21 March

describe('dayOfYear', () => {
  it.each([
    ['2026-01-01', 1],
    ['2026-02-01', 32],
    ['2026-06-21', 172],
    ['2026-12-31', 365],
  ])('maps %s to day %i', (date, expected) => {
    expect(dayOfYear(date)).toBe(expected)
  })

  it('accounts for a leap year', () => {
    expect(dayOfYear('2028-03-01')).toBe(61) // 60 in a non-leap year
    expect(dayOfYear('2028-12-31')).toBe(366)
  })

  it('rejects a malformed date', () => {
    expect(() => dayOfYear('21-06-2026')).toThrow(/date/i)
    expect(() => dayOfYear('2026-02-31')).toThrow(/date/i)
  })
})

describe('dayLengthHours', () => {
  it('is about twelve hours at the equator all year', () => {
    for (const day of [1, EQUINOX, JUNE_SOLSTICE, 250, DECEMBER_SOLSTICE, 365]) {
      expect(dayLengthHours(0, day)).toBeCloseTo(12.1, 1)
    }
  })

  it('is about twelve hours everywhere at the equinox', () => {
    for (const lat of [-60, -30, 0, 30, 60]) {
      expect(dayLengthHours(lat, EQUINOX)).toBeGreaterThan(11.7)
      expect(dayLengthHours(lat, EQUINOX)).toBeLessThan(12.6)
    }
  })

  it('matches the known London midsummer day length', () => {
    // London sees about 16h 38m on the June solstice.
    expect(dayLengthHours(51.5074, JUNE_SOLSTICE)).toBeCloseTo(16.63, 1)
  })

  it('matches the known London midwinter day length', () => {
    // ...and about 7h 50m at midwinter.
    expect(dayLengthHours(51.5074, DECEMBER_SOLSTICE)).toBeCloseTo(7.83, 1)
  })

  it('gives polar day inside the Arctic circle in June', () => {
    expect(dayLengthHours(78, JUNE_SOLSTICE)).toBe(24)
  })

  it('gives polar night inside the Arctic circle in December', () => {
    expect(dayLengthHours(78, DECEMBER_SOLSTICE)).toBe(0)
  })

  it('mirrors the hemispheres between solstices', () => {
    // Midsummer in the north is midwinter in the south, at the same latitude.
    expect(dayLengthHours(45, JUNE_SOLSTICE)).toBeCloseTo(
      dayLengthHours(-45, DECEMBER_SOLSTICE),
      1,
    )
  })

  it('lengthens with latitude in northern summer', () => {
    let previous = dayLengthHours(0, JUNE_SOLSTICE)
    for (const lat of [10, 20, 30, 40, 50, 60]) {
      const current = dayLengthHours(lat, JUNE_SOLSTICE)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })

  it('never returns a value outside [0, 24]', () => {
    for (let lat = -90; lat <= 90; lat += 5) {
      for (let day = 1; day <= 365; day += 7) {
        const hours = dayLengthHours(lat, day)
        expect(hours).toBeGreaterThanOrEqual(0)
        expect(hours).toBeLessThanOrEqual(24)
      }
    }
  })

  it('rejects an out-of-range latitude or day', () => {
    expect(() => dayLengthHours(91, 1)).toThrow(/latitude/i)
    expect(() => dayLengthHours(0, 0)).toThrow(/day/i)
    expect(() => dayLengthHours(0, 367)).toThrow(/day/i)
  })
})
