import { assertQueryableLatLon, type LatLon } from '../geo/coordinates.js'
import { OpenMeteoApiError, OpenMeteoParseError } from './errors.js'
import { errorEnvelopeSchema, openMeteoEnvelopeSchema, type OpenMeteoEnvelope } from './schemas.js'
import { readServerDate } from './serverTime.js'

export interface OpenMeteoResult {
  readonly data: OpenMeteoEnvelope
  /** From the HTTP Date header — the trusted clock, DESIGN §10. Null if absent (e.g. a test double that omits it). */
  readonly serverDate: Date | null
}

/**
 * Shared query-building helpers used by both forecast.ts and archive.ts —
 * previously each duplicated this logic independently, with nothing keeping
 * the two in sync (a review finding).
 */

/**
 * String(n) switches to exponential notation below 1e-6 magnitude (e.g.
 * String(5e-7) === "5e-7"), and it's unverified whether Open-Meteo's query
 * parser accepts that (a review finding). toFixed always produces plain
 * decimal notation, so it's used only where String() would otherwise emit
 * exponential form — everywhere else this is byte-identical to String(n).
 */
export function serializeCoordinate(n: number): string {
  return n !== 0 && Math.abs(n) < 1e-6 ? n.toFixed(6) : String(n)
}

export function setLatLonParams(url: URL, point: LatLon, label = 'point'): void {
  assertQueryableLatLon(point, label)
  url.searchParams.set('latitude', serializeCoordinate(point.lat))
  url.searchParams.set('longitude', serializeCoordinate(point.lon))
}

/** Sets `key` to a comma-joined value, but only if `values` is non-empty. */
export function setJoinedIfPresent(
  url: URL,
  key: string,
  values: readonly string[] | undefined,
): void {
  if (values && values.length > 0) {
    url.searchParams.set(key, values.join(','))
  }
}

/**
 * Defaults to 'auto' rather than UTC: the resolution-timing invariant
 * (DESIGN §9.2a) needs the station's real utc_offset_seconds, which only
 * comes back when Open-Meteo resolves the local timezone for these
 * coordinates.
 */
export function setTimezone(url: URL, timezone: string | undefined): void {
  url.searchParams.set('timezone', timezone ?? 'auto')
}

/**
 * Shared fetch-and-parse core for both Open-Meteo endpoints (forecast,
 * archive — DESIGN §9.1). Distinguishes two failure modes deliberately:
 *
 *  - no response, or non-2xx status  -> OpenMeteoApiError, always. Covers
 *    fetch() itself failing (offline, DNS failure — status 0, the documented
 *    convention for "no response received"), a body-read failure mid-stream,
 *    and whatever the API (or an intermediary) sent back on a non-2xx
 *    status, JSON or not. DESIGN §9.6 flags mobile carrier-grade NAT as a
 *    real risk area for this app, and the same networks commonly produce all
 *    three (connection resets, non-JSON proxy error pages) — every one of
 *    them is an API/network failure, never a schema bug, so every one of
 *    them ends up as this single type. The original error is preserved as
 *    `.cause` wherever there is one.
 *  - 2xx but shape is wrong (including non-JSON) -> OpenMeteoParseError —
 *    the request succeeded but our assumptions about the response are
 *    stale. A bug to fix, never a transient failure to retry.
 *
 * response.ok is checked BEFORE attempting to parse the body as JSON, so a
 * non-2xx status can never be misclassified as a parse error just because an
 * intermediary's error page happened not to be JSON.
 */
export async function fetchOpenMeteo(url: URL): Promise<OpenMeteoResult> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    // fetch() itself rejected: offline, DNS failure, connection refused —
    // no HTTP response was ever received. Status 0 is the convention for
    // exactly that, distinct from any real status the server could send.
    throw new OpenMeteoApiError(0, 'no response received (network failure)', cause)
  }

  const serverDate = readServerDate(response)

  if (!response.ok) {
    // Read as text once and parse manually, rather than response.json():
    // Response bodies are single-use streams, so if a second read were ever
    // needed after a failed .json() call (e.g. to recover the raw text for
    // the error message), a subsequent .clone() throws synchronously
    // ("Body has already been consumed") — reading as text up front and
    // parsing that in memory sidesteps the whole failure mode.
    let text: string
    try {
      text = await response.text()
    } catch (cause) {
      // The body stream itself broke mid-read (connection reset, proxy
      // timeout) — still an API/network failure, not a parse bug.
      throw new OpenMeteoApiError(response.status, response.statusText, cause)
    }

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch (cause) {
      // Non-JSON error body (e.g. an intermediary's HTML error page) — still
      // an API/network failure, so still OpenMeteoApiError, just without a
      // structured reason from Open-Meteo itself. The SyntaxError is kept as
      // cause rather than discarded, for anyone debugging a malformed body.
      throw new OpenMeteoApiError(
        response.status,
        text.length > 0 ? text.slice(0, 300) : response.statusText,
        cause,
      )
    }

    const asError = errorEnvelopeSchema.safeParse(body)
    if (asError.success) {
      throw new OpenMeteoApiError(response.status, asError.data.reason)
    }
    // Valid JSON, but didn't match the documented error envelope either;
    // surface the raw text already in hand rather than re-serializing body
    // (which can reorder keys/reformat and diverge from what was sent).
    throw new OpenMeteoApiError(response.status, text.slice(0, 300))
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
