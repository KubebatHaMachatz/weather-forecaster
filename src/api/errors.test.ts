import { describe, expect, it } from 'vitest'
import { OpenMeteoApiError, OpenMeteoParseError } from './errors.js'

describe('OpenMeteoApiError', () => {
  it('carries the HTTP status and the API reason separately', () => {
    const err = new OpenMeteoApiError(429, 'Daily API request limit exceeded.')
    expect(err.status).toBe(429)
    expect(err.reason).toBe('Daily API request limit exceeded.')
  })

  it('is a real Error with a readable message', () => {
    const err = new OpenMeteoApiError(400, "Parameter 'start_date' is out of allowed range")
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('OpenMeteoApiError')
    expect(err.message).toContain('400')
    expect(err.message).toContain("Parameter 'start_date' is out of allowed range")
  })

  /**
   * Regression test for a review finding: the class had no way to carry a
   * cause, so a genuine diagnostic (e.g. the SyntaxError from a failed
   * JSON.parse on a malformed error body) had nowhere to go and was
   * silently discarded at the call site.
   */
  it('optionally preserves an underlying cause, like OpenMeteoParseError does', () => {
    const networkFailure = new TypeError('Network request failed')
    const err = new OpenMeteoApiError(0, 'no response received', networkFailure)
    expect(err.cause).toBe(networkFailure)
  })

  it('has no cause when none is given', () => {
    const err = new OpenMeteoApiError(429, 'rate limited')
    expect(err.cause).toBeUndefined()
  })

  /**
   * Regression test: fetch() itself failing (offline, DNS failure, a proxy
   * connection reset — the mobile-carrier scenario DESIGN §9.6 flags as
   * real) used to escape both typed error classes entirely. Status 0 is the
   * documented convention for "no HTTP response was ever received."
   */
  it('documents status 0 as the convention for no response received', () => {
    const err = new OpenMeteoApiError(0, 'offline')
    expect(err.status).toBe(0)
    expect(err.message).toContain('0')
  })
})

describe('OpenMeteoParseError', () => {
  it('preserves the underlying validation failure as .cause', () => {
    const zodLikeFailure = new Error('invalid_type at hourly.time')
    const err = new OpenMeteoParseError('response did not match the expected shape', zodLikeFailure)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('OpenMeteoParseError')
    expect(err.cause).toBe(zodLikeFailure)
  })
})
