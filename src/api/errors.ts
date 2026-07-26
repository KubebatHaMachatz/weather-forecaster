/**
 * Thrown when Open-Meteo responds with a non-2xx status, OR when no response
 * was ever received at all (fetch() itself failed, or the body stream broke
 * mid-read) — DESIGN §9.6 flags mobile carrier-grade NAT as a real risk area
 * for this app, and both are the same kind of failure from a caller's
 * perspective: an API/network problem, never evidence our code is stale.
 *
 * Status 0 is the documented convention for "no HTTP response was received."
 * Carries the HTTP status and the API's own `reason` string separately, so
 * callers can branch on status (e.g. 429 = quota, per DESIGN §9.6's per-IP
 * rate-limit constraint; 0 = offline/network failure) without parsing the
 * message. `cause` optionally preserves the underlying error (a native fetch
 * rejection, a body-stream failure, a JSON.parse SyntaxError) for debugging,
 * the same way OpenMeteoParseError already does.
 */
export class OpenMeteoApiError extends Error {
  readonly status: number
  readonly reason: string

  constructor(status: number, reason: string, cause?: unknown) {
    super(`Open-Meteo API error (HTTP ${status}): ${reason}`, cause === undefined ? {} : { cause })
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
