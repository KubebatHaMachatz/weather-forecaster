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
