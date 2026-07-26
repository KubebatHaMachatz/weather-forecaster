import { assertLatLon } from '../geo/coordinates.js'
import { fetchOpenMeteo, type OpenMeteoResult } from './client.js'

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
  assertLatLon({ lat: params.latitude, lon: params.longitude })

  const url = new URL(ARCHIVE_URL)
  url.searchParams.set('latitude', String(params.latitude))
  url.searchParams.set('longitude', String(params.longitude))
  url.searchParams.set('start_date', params.startDate)
  url.searchParams.set('end_date', params.endDate)
  if (params.hourly && params.hourly.length > 0) {
    url.searchParams.set('hourly', params.hourly.join(','))
  }
  if (params.daily && params.daily.length > 0) {
    url.searchParams.set('daily', params.daily.join(','))
  }
  url.searchParams.set('timezone', params.timezone ?? 'auto')

  return fetchOpenMeteo(url)
}
