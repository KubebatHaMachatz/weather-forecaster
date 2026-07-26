import { describe, expect, it } from 'vitest'
import { readServerDate, requireServerDate } from './serverTime.js'

/**
 * DESIGN §10 "Fairness without a server": the trusted clock is the HTTP Date
 * header on any Open-Meteo response, never the device clock. Verified live
 * in the spike (SPIKE.md §1, 1s skew against the device clock).
 */

describe('readServerDate', () => {
  it('parses the Date header from a real response', () => {
    const response = new Response(null, {
      headers: { date: 'Sun, 26 Jul 2026 07:39:41 GMT' },
    })
    const date = readServerDate(response)
    expect(date).not.toBeNull()
    expect(date?.toISOString()).toBe('2026-07-26T07:39:41.000Z')
  })

  it('returns null when no Date header is present', () => {
    const response = new Response(null, { headers: {} })
    expect(readServerDate(response)).toBeNull()
  })

  it('returns null for an unparseable Date header rather than an Invalid Date', () => {
    const response = new Response(null, { headers: { date: 'not a date' } })
    expect(readServerDate(response)).toBeNull()
  })

  /**
   * Regression test for a review finding: the module used to parse via
   * `new Date(header)`, relying on engine-specific RFC 1123 support that
   * ECMA-262 does not mandate (only the ISO 8601 subset is required) — a
   * real risk since this ships to Hermes (React Native) but tests run under
   * Node/V8. These cases exercise the explicit parser across the calendar
   * (every month abbreviation, a leap day, midnight, a single-vs-double-
   * digit day) so its correctness doesn't depend on any engine's Date.parse
   * behavior at all.
   */
  it.each([
    ['Thu, 01 Jan 2026 00:00:00 GMT', '2026-01-01T00:00:00.000Z'],
    ['Sun, 08 Feb 2026 12:30:15 GMT', '2026-02-08T12:30:15.000Z'],
    ['Tue, 31 Mar 2026 23:59:59 GMT', '2026-03-31T23:59:59.000Z'],
    ['Wed, 29 Apr 2026 06:05:04 GMT', '2026-04-29T06:05:04.000Z'],
    ['Fri, 01 May 2026 00:00:01 GMT', '2026-05-01T00:00:01.000Z'],
    ['Sat, 20 Jun 2026 18:00:00 GMT', '2026-06-20T18:00:00.000Z'],
    ['Sun, 26 Jul 2026 07:39:41 GMT', '2026-07-26T07:39:41.000Z'],
    ['Sat, 01 Aug 2026 00:00:00 GMT', '2026-08-01T00:00:00.000Z'],
    ['Tue, 15 Sep 2026 09:09:09 GMT', '2026-09-15T09:09:09.000Z'],
    ['Thu, 01 Oct 2026 00:00:00 GMT', '2026-10-01T00:00:00.000Z'],
    ['Sun, 01 Nov 2026 00:00:00 GMT', '2026-11-01T00:00:00.000Z'],
    ['Thu, 31 Dec 2026 23:59:59 GMT', '2026-12-31T23:59:59.000Z'],
    // Leap day — proves calendar handling isn't just string-format matching.
    ['Sat, 29 Feb 2028 12:00:00 GMT', '2028-02-29T12:00:00.000Z'],
  ])('parses %s independent of engine Date.parse support', (header, expectedIso) => {
    const response = new Response(null, { headers: { date: header } })
    expect(readServerDate(response)?.toISOString()).toBe(expectedIso)
  })

  it('returns null for a header with an unrecognised month abbreviation', () => {
    const response = new Response(null, { headers: { date: 'Sun, 26 Xyz 2026 07:39:41 GMT' } })
    expect(readServerDate(response)).toBeNull()
  })

  it('returns null for a header that is close to RFC 1123 but malformed', () => {
    const response = new Response(null, { headers: { date: '26 Jul 2026 07:39:41' } })
    expect(readServerDate(response)).toBeNull()
  })
})

describe('requireServerDate', () => {
  /**
   * The sanctioned non-null path (review finding: without this, a caller
   * needing a trusted Date for isResolvable() had nothing but `serverDate ??
   * new Date()` to reach for — silently falling back to the device clock in
   * exactly the scenario DESIGN §10 exists to prevent).
   */
  it('returns the parsed date when the header is present and valid', () => {
    const response = new Response(null, {
      headers: { date: 'Sun, 26 Jul 2026 07:39:41 GMT' },
    })
    expect(requireServerDate(response).toISOString()).toBe('2026-07-26T07:39:41.000Z')
  })

  it('throws rather than silently falling back to the device clock when the header is missing', () => {
    const response = new Response(null, { headers: {} })
    expect(() => requireServerDate(response)).toThrow(/date/i)
  })

  it('throws when the header is present but unparseable', () => {
    const response = new Response(null, { headers: { date: 'not a date' } })
    expect(() => requireServerDate(response)).toThrow(/date/i)
  })
})
