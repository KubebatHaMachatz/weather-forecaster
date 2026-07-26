import { describe, expect, it } from 'vitest'
import { isResolvable, stationLocalDate } from './resolution.js'

/**
 * The spike (SPIKE.md §4) found that the Archive API happily returns a full
 * 24 hours for *today* — including hours that have not happened yet, filled
 * from forecast rather than analysis. Resolving against "today" would score
 * players against a forecast masquerading as truth.
 *
 * Invariant: only resolve a Call whose target date is strictly in the past
 * in the STATION's local time, never the device's and never UTC.
 */

const UTC = 0
const KIRITIMATI = +14 * 3600 // UTC+14, the earliest timezone on Earth
const MIDWAY = -11 * 3600 // UTC−11, the latest
const SANTIAGO = -4 * 3600
const KATHMANDU = 5 * 3600 + 45 * 60 // deliberately not a whole hour

describe('stationLocalDate', () => {
  it('returns the UTC date at zero offset', () => {
    expect(stationLocalDate(new Date('2026-07-26T11:00:00Z'), UTC)).toBe('2026-07-26')
  })

  it('rolls forward across the date line', () => {
    expect(stationLocalDate(new Date('2026-07-26T11:00:00Z'), KIRITIMATI)).toBe('2026-07-27')
  })

  it('rolls backward for negative offsets', () => {
    expect(stationLocalDate(new Date('2026-07-26T10:59:59Z'), MIDWAY)).toBe('2026-07-25')
  })

  it('handles half-hour and quarter-hour offsets', () => {
    expect(stationLocalDate(new Date('2026-07-26T18:20:00Z'), KATHMANDU)).toBe('2026-07-27')
    expect(stationLocalDate(new Date('2026-07-26T18:10:00Z'), KATHMANDU)).toBe('2026-07-26')
  })

  it('pads month and day to two digits', () => {
    expect(stationLocalDate(new Date('2026-01-05T12:00:00Z'), UTC)).toBe('2026-01-05')
  })

  it('handles a year boundary', () => {
    expect(stationLocalDate(new Date('2025-12-31T23:00:00Z'), SANTIAGO)).toBe('2025-12-31')
    expect(stationLocalDate(new Date('2026-01-01T02:00:00Z'), KIRITIMATI)).toBe('2026-01-01')
    expect(stationLocalDate(new Date('2025-12-31T14:00:00Z'), KIRITIMATI)).toBe('2026-01-01')
  })

  it('handles a leap day', () => {
    expect(stationLocalDate(new Date('2028-02-28T23:00:00Z'), KIRITIMATI)).toBe('2028-02-29')
  })
})

describe('isResolvable', () => {
  const at = (iso: string) => new Date(iso)

  it('resolves a target that is yesterday at the station', () => {
    expect(isResolvable('2026-07-25', SANTIAGO, at('2026-07-26T15:00:00Z'))).toBe(true)
  })

  it('refuses a target that is still today at the station', () => {
    expect(isResolvable('2026-07-26', SANTIAGO, at('2026-07-26T15:00:00Z'))).toBe(false)
  })

  it('refuses a target in the future', () => {
    expect(isResolvable('2026-07-27', SANTIAGO, at('2026-07-26T15:00:00Z'))).toBe(false)
  })

  it('resolves anything comfortably in the past', () => {
    expect(isResolvable('2026-01-01', SANTIAGO, at('2026-07-26T15:00:00Z'))).toBe(true)
  })

  /**
   * The case that makes this function necessary. At one single instant, the
   * same target date is safely historical at one station and still unfolding
   * at another. Anything keyed on UTC or on the device clock gets one of
   * these two wrong, and does so silently.
   */
  it('gives opposite answers for two stations at the same instant', () => {
    const instant = at('2026-07-26T11:00:00Z')
    expect(stationLocalDate(instant, KIRITIMATI)).toBe('2026-07-27')
    expect(stationLocalDate(instant, MIDWAY)).toBe('2026-07-26')

    expect(isResolvable('2026-07-26', KIRITIMATI, instant)).toBe(true)
    expect(isResolvable('2026-07-26', MIDWAY, instant)).toBe(false)
  })

  it('flips exactly at station-local midnight, not before', () => {
    // 23:59:59 local on the 26th — the 26th is still today, so: no.
    expect(isResolvable('2026-07-26', UTC, at('2026-07-26T23:59:59Z'))).toBe(false)
    // 00:00:00 local on the 27th — the 26th is now yesterday, so: yes.
    expect(isResolvable('2026-07-26', UTC, at('2026-07-27T00:00:00Z'))).toBe(true)
  })

  it('rejects a malformed target date rather than guessing', () => {
    const now = at('2026-07-26T15:00:00Z')
    expect(() => isResolvable('26-07-2026', UTC, now)).toThrow(/date/i)
    expect(() => isResolvable('2026-7-6', UTC, now)).toThrow(/date/i)
    expect(() => isResolvable('', UTC, now)).toThrow(/date/i)
  })

  it('rejects an implausible UTC offset', () => {
    const now = at('2026-07-26T15:00:00Z')
    expect(() => isResolvable('2026-07-25', 20 * 3600, now)).toThrow(/offset/i)
    expect(() => isResolvable('2026-07-25', -20 * 3600, now)).toThrow(/offset/i)
  })

  it('rejects an invalid clock', () => {
    expect(() => isResolvable('2026-07-25', UTC, new Date('nonsense'))).toThrow()
  })
})
