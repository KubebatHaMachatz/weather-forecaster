import { assertLatLon } from '../geo/coordinates.js'
import { fetchOpenMeteo, type OpenMeteoResult } from './client.js'

/**
 * The forecast endpoint (DESIGN §9.1) serves every live instrument: Barometer
 * and Sounding via `hourly` + `pastDays`, One/Another Model and The
 * Consensus via `models` (§9.3 — a single call returns all seven named
 * models, no ensemble-endpoint dependency), and Neighbour by simply calling
 * this with a different station's coordinates.
 */
export interface ForecastParams {
  readonly latitude: number
  readonly longitude: number
  readonly hourly?: readonly string[]
  readonly current?: readonly string[]
  /** National model ids, e.g. 'ecmwf_ifs025' — see DESIGN §9.3. */
  readonly models?: readonly string[]
  readonly pastDays?: number
  readonly forecastDays?: number
  /**
   * Defaults to 'auto' rather than UTC: the resolution-timing invariant
   * (DESIGN §9.2a) needs the station's real utc_offset_seconds, which only
   * comes back when Open-Meteo resolves the local timezone for these
   * coordinates.
   */
  readonly timezone?: string
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export async function fetchForecast(params: ForecastParams): Promise<OpenMeteoResult> {
  assertLatLon({ lat: params.latitude, lon: params.longitude })

  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(params.latitude))
  url.searchParams.set('longitude', String(params.longitude))
  if (params.hourly && params.hourly.length > 0) {
    url.searchParams.set('hourly', params.hourly.join(','))
  }
  if (params.current && params.current.length > 0) {
    url.searchParams.set('current', params.current.join(','))
  }
  if (params.models && params.models.length > 0) {
    url.searchParams.set('models', params.models.join(','))
  }
  if (params.pastDays !== undefined) {
    url.searchParams.set('past_days', String(params.pastDays))
  }
  if (params.forecastDays !== undefined) {
    url.searchParams.set('forecast_days', String(params.forecastDays))
  }
  url.searchParams.set('timezone', params.timezone ?? 'auto')

  return fetchOpenMeteo(url)
}
