import {
  fetchOpenMeteo,
  setJoinedIfPresent,
  setLatLonParams,
  setTimezone,
  type OpenMeteoResult,
} from './client.js'

/**
 * The archive endpoint (DESIGN §9.1) is the single canonical oracle: it
 * serves both Call resolution (truth, DESIGN §9.2 — gated by the station-local
 * timing invariant in §9.2a) and the build-time climatology script (§9.4).
 *
 * Date-format and future-date validation is deliberately NOT duplicated
 * here: the API's own 400 response already carries a clear reason (verified
 * live — SPIKE.md §4) and fetchOpenMeteo surfaces it as OpenMeteoApiError.
 */
export interface ArchiveParams {
  readonly latitude: number
  readonly longitude: number
  /** YYYY-MM-DD */
  readonly startDate: string
  /** YYYY-MM-DD */
  readonly endDate: string
  readonly hourly?: readonly string[]
  readonly daily?: readonly string[]
  readonly timezone?: string
}

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

export async function fetchArchive(params: ArchiveParams): Promise<OpenMeteoResult> {
  const url = new URL(ARCHIVE_URL)
  setLatLonParams(url, { lat: params.latitude, lon: params.longitude })
  url.searchParams.set('start_date', params.startDate)
  url.searchParams.set('end_date', params.endDate)
  setJoinedIfPresent(url, 'hourly', params.hourly)
  setJoinedIfPresent(url, 'daily', params.daily)
  setTimezone(url, params.timezone)

  return fetchOpenMeteo(url)
}
