import { http, HttpResponse } from 'msw'
import {
  FIXED_SERVER_DATE_HEADER,
  archiveFixture,
  forecastMultiModelFixture,
  forecastSingleVariableFixture,
} from './fixtures.js'

/**
 * Default happy-path handlers. Tests that need an error or malformed
 * response override per-test with `server.use(...)` — see forecast.test.ts
 * and archive.test.ts.
 */
export const handlers = [
  http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
    const hasModels = new URL(request.url).searchParams.has('models')
    return HttpResponse.json(hasModels ? forecastMultiModelFixture : forecastSingleVariableFixture, {
      headers: { date: FIXED_SERVER_DATE_HEADER },
    })
  }),

  http.get('https://archive-api.open-meteo.com/v1/archive', () =>
    HttpResponse.json(archiveFixture, { headers: { date: FIXED_SERVER_DATE_HEADER } }),
  ),
]
