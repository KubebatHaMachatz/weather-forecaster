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
 * archive — DESIGN §9.1). Distinguishes three failure modes deliberately:
 *
 *  - non-2xx status            -> OpenMeteoApiError (status + API's reason)
 *  - 2xx but body isn't JSON   -> OpenMeteoParseError
 *  - 2xx but shape is wrong    -> OpenMeteoParseError
 *
 * The last two collapse to the same error type because both mean "the
 * request succeeded but our assumptions about the response are stale" — a
 * bug to fix, never a transient failure to retry.
 */
export async function fetchOpenMeteo(url: URL): Promise<OpenMeteoResult> {
  const response = await fetch(url)
  const serverDate = readServerDate(response)

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new OpenMeteoParseError(
      `response from ${url.pathname} was not valid JSON`,
      cause,
    )
  }

  if (!response.ok) {
    const asError = errorEnvelopeSchema.safeParse(body)
    if (asError.success) {
      throw new OpenMeteoApiError(response.status, asError.data.reason)
    }
    // Body didn't match the documented error envelope either; surface
    // whatever came back rather than swallowing it.
    throw new OpenMeteoApiError(response.status, JSON.stringify(body).slice(0, 300))
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
