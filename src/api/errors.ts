/**
 * Thrown when Open-Meteo responds with a non-2xx status. Carries the HTTP
 * status and the API's own `reason` string separately, so callers can branch
 * on status (e.g. 429 = quota, worth surfacing distinctly per DESIGN §9.6's
 * per-IP rate-limit constraint) without parsing the message.
 */
export class OpenMeteoApiError extends Error {
  readonly status: number
  readonly reason: string

  constructor(status: number, reason: string) {
    super(`Open-Meteo API error (HTTP ${status}): ${reason}`)
    this.name = 'OpenMeteoApiError'
    this.status = status
    this.reason = reason
  }
}

/**
 * Thrown when a 2xx response's body does not match the shape schemas.ts
 * expects. Distinct from OpenMeteoApiError: this means the API considered
 * the request successful but our code's assumptions about the response are
 * stale — a bug to fix, not a transient failure to retry.
 */
export class OpenMeteoParseError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause })
    this.name = 'OpenMeteoParseError'
  }
}
