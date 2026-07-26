import { describe, expect, it } from 'vitest'
import { readServerDate } from './serverTime.js'

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
})
