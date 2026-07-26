import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenMeteo, serializeCoordinate, setJoinedIfPresent, setTimezone } from './client.js'
import { OpenMeteoApiError } from './errors.js'

/**
 * Regression tests for a review finding: String(coordinate) switches to
 * exponential notation below 1e-6 magnitude (String(5e-7) === "5e-7"), and
 * it's unverified whether Open-Meteo's query parser accepts that — verified
 * live below (no engine assumptions), not guessed.
 */
describe('serializeCoordinate', () => {
  it('leaves a normal-magnitude coordinate exactly as String() would', () => {
    expect(serializeCoordinate(-33.05)).toBe('-33.05')
    expect(serializeCoordinate(71.62)).toBe('71.62')
  })

  it('leaves zero as a plain "0"', () => {
    expect(serializeCoordinate(0)).toBe('0')
  })

  it('never emits exponential notation, even at the exact edge below 1e-6', () => {
    expect(serializeCoordinate(9e-7)).not.toMatch(/e/i)
    expect(serializeCoordinate(-9e-7)).not.toMatch(/e/i)
  })

  it('leaves values at or above the 1e-6 threshold in plain notation as-is', () => {
    // String() itself is already plain decimal at exactly 1e-6 — confirm the
    // helper doesn't second-guess a value String() already renders safely.
    expect(serializeCoordinate(1e-6)).toBe('0.000001')
  })
})

/**
 * These two failure modes sit below the HTTP layer MSW simulates (a rejected
 * fetch() call, a body stream that fails mid-read) so they're stubbed
 * directly against global fetch rather than through an MSW handler.
 *
 * Regression tests for a review finding: fetchOpenMeteo's own docstring
 * claims it "distinguishes two failure modes deliberately" into
 * OpenMeteoApiError/OpenMeteoParseError, but neither the initial fetch()
 * call nor, on the !response.ok path, response.text() were wrapped in
 * try/catch — so either could throw a third, unclassified kind of error
 * that escaped both typed classes. Both matter on exactly the mobile
 * carrier-grade NAT / flaky-network conditions DESIGN §9.6 flags as real.
 */

const SOME_URL = new URL('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0')
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/**
 * Regression tests for a review finding: forecast.ts and archive.ts
 * independently duplicated identical URL-building logic (the "only set if
 * non-empty, joined with a comma" guard, and the timezone default) with
 * nothing keeping the two in sync. Factored out here and shared by both.
 */
describe('setJoinedIfPresent', () => {
  it('sets a comma-joined param when values are given', () => {
    const url = new URL('https://example.test/')
    setJoinedIfPresent(url, 'hourly', ['temperature_2m', 'surface_pressure'])
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,surface_pressure')
  })

  it('does not set the param for an empty array', () => {
    const url = new URL('https://example.test/')
    setJoinedIfPresent(url, 'hourly', [])
    expect(url.searchParams.has('hourly')).toBe(false)
  })

  it('does not set the param when undefined', () => {
    const url = new URL('https://example.test/')
    setJoinedIfPresent(url, 'hourly', undefined)
    expect(url.searchParams.has('hourly')).toBe(false)
  })
})

describe('setTimezone', () => {
  it('defaults to "auto" when no timezone is given', () => {
    const url = new URL('https://example.test/')
    setTimezone(url, undefined)
    expect(url.searchParams.get('timezone')).toBe('auto')
  })

  it('uses the given timezone when provided', () => {
    const url = new URL('https://example.test/')
    setTimezone(url, 'America/Santiago')
    expect(url.searchParams.get('timezone')).toBe('America/Santiago')
  })
})

describe('fetchOpenMeteo — failures below the HTTP layer', () => {
  it('wraps a fetch()-level network failure as OpenMeteoApiError, status 0, with the original error as cause', async () => {
    const networkFailure = new TypeError('Network request failed')
    globalThis.fetch = vi.fn().mockRejectedValue(networkFailure)

    expect.assertions(3)
    try {
      await fetchOpenMeteo(SOME_URL)
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(0)
      expect((err as OpenMeteoApiError).cause).toBe(networkFailure)
    }
  })

  it('wraps a body-read failure on a non-2xx response as OpenMeteoApiError rather than an unclassified error', async () => {
    const streamFailure = new Error('terminated')
    const brokenResponse = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Headers(),
      text: vi.fn().mockRejectedValue(streamFailure),
    } as unknown as Response
    globalThis.fetch = vi.fn().mockResolvedValue(brokenResponse)

    expect.assertions(3)
    try {
      await fetchOpenMeteo(SOME_URL)
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(502)
      expect((err as OpenMeteoApiError).cause).toBe(streamFailure)
    }
  })

  it('wraps a body-read failure on a 2xx response as OpenMeteoParseError rather than an unclassified error', async () => {
    const streamFailure = new Error('terminated')
    const brokenResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(streamFailure),
    } as unknown as Response
    globalThis.fetch = vi.fn().mockResolvedValue(brokenResponse)

    await expect(fetchOpenMeteo(SOME_URL)).rejects.toMatchObject({ name: 'OpenMeteoParseError' })
  })
})
