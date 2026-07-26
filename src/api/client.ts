import { OpenMeteoApiError, OpenMeteoParseError } from './errors.js'
import { errorEnvelopeSchema, openMeteoEnvelopeSchema, type OpenMeteoEnvelope } from './schemas.js'
import { readServerDate } from './serverTime.js'

export interface OpenMeteoResult {
  readonly data: OpenMeteoEnvelope
  /** From the HTTP Date header — the trusted clock, DESIGN §10. Null if absent (e.g. a test double that omits it). */
  readonly serverDate: Date | null
}

/**
 * Shared fetch-and-parse core for both Open-Meteo endpoints (forecast,
 * archive — DESIGN §9.1). Distinguishes two failure modes deliberately:
 *
 *  - non-2xx status  -> OpenMeteoApiError, always — whatever the API (or an
 *    intermediary in front of it) sent back, JSON or not. DESIGN §9.6 flags
 *    mobile carrier-grade NAT as a real risk area for this app, and the same
 *    networks commonly inject non-JSON error pages (a proxy's HTML 502/504)
 *    on failure — this is an API/network failure, never a schema bug.
 *  - 2xx but shape is wrong (including non-JSON) -> OpenMeteoParseError —
 *    the request succeeded but our assumptions about the response are
 *    stale. A bug to fix, never a transient failure to retry.
 *
 * response.ok is checked BEFORE attempting to parse the body as JSON, so a
 * non-2xx status can never be misclassified as a parse error just because an
 * intermediary's error page happened not to be JSON.
 */
export async function fetchOpenMeteo(url: URL): Promise<OpenMeteoResult> {
  const response = await fetch(url)
  const serverDate = readServerDate(response)

  if (!response.ok) {
    // Read as text once and parse manually, rather than response.json():
    // Response bodies are single-use streams, so if a second read were ever
    // needed after a failed .json() call (e.g. to recover the raw text for
    // the error message), a subsequent .clone() throws synchronously
    // ("Body has already been consumed") — reading as text up front and
    // parsing that in memory sidesteps the whole failure mode.
    const text = await response.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      // Non-JSON error body (e.g. an intermediary's HTML error page) — still
      // an API/network failure, so still OpenMeteoApiError, just without a
      // structured reason from Open-Meteo itself.
      throw new OpenMeteoApiError(
        response.status,
        text.length > 0 ? text.slice(0, 300) : response.statusText,
      )
    }

    const asError = errorEnvelopeSchema.safeParse(body)
    if (asError.success) {
      throw new OpenMeteoApiError(response.status, asError.data.reason)
    }
    // Valid JSON, but didn't match the documented error envelope either;
    // surface whatever came back rather than swallowing it.
    throw new OpenMeteoApiError(response.status, JSON.stringify(body).slice(0, 300))
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new OpenMeteoParseError(
      `response from ${url.pathname} was not valid JSON`,
      cause,
    )
  }

  const parsed = openMeteoEnvelopeSchema.safeParse(body)
  if (!parsed.success) {
    throw new OpenMeteoParseError(
      `response from ${url.pathname} did not match the expected shape`,
      parsed.error,
    )
  }

  return { data: parsed.data, serverDate }
}
