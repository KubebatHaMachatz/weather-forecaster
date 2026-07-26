import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { OpenMeteoApiError, OpenMeteoParseError } from './errors.js'
import { fetchForecast } from './forecast.js'
import {
  forecastCurrentFixture,
  forecastMultiModelFixture,
  forecastSingleVariableFixture,
  futureDateErrorFixture,
  rateLimitErrorFixture,
} from './mocks/fixtures.js'
import { server } from './mocks/server.js'

const VALPARAISO = { latitude: -33.05, longitude: -71.62 }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('fetchForecast', () => {
  it('parses a single-variable response', async () => {
    const result = await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })
    expect(result.data.hourly?.temperature_2m).toEqual(
      forecastSingleVariableFixture.hourly.temperature_2m,
    )
    expect(result.data.elevation).toBe(56)
  })

  it('parses a multi-model response, including a null for a model with no regional coverage', async () => {
    const models = [
      'ecmwf_ifs025', 'icon_seamless', 'gfs_seamless', 'gem_seamless',
      'meteofrance_seamless', 'jma_seamless', 'ukmo_seamless', 'bom_access_global',
    ]
    const result = await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'], models })
    expect(result.data.hourly?.temperature_2m_ecmwf_ifs025?.[0]).toBe(12.0)
    expect(result.data.hourly?.temperature_2m_bom_access_global).toEqual(
      forecastMultiModelFixture.hourly.temperature_2m_bom_access_global,
    )
  })

  /**
   * Regression test for a review finding: `current` was a real, wired-up
   * parameter (below) with no schema field to receive it, so the requested
   * data was silently discarded end-to-end with nothing to catch it.
   */
  it('parses a current-conditions response end-to-end (the Persistence instrument, DESIGN §4)', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(forecastCurrentFixture),
      ),
    )

    const result = await fetchForecast({ ...VALPARAISO, current: ['temperature_2m'] })

    expect(result.data.current?.temperature_2m).toBe(forecastCurrentFixture.current.temperature_2m)
    expect(result.data.current?.time).toBe(forecastCurrentFixture.current.time)
  })

  it('sends latitude, longitude, hourly and timezone as query parameters', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(forecastSingleVariableFixture)
      }),
    )

    await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m', 'surface_pressure'] })

    expect(capturedUrl?.searchParams.get('latitude')).toBe('-33.05')
    expect(capturedUrl?.searchParams.get('longitude')).toBe('-71.62')
    expect(capturedUrl?.searchParams.get('hourly')).toBe('temperature_2m,surface_pressure')
    // DESIGN §9.2a's resolution invariant needs a real station-local offset,
    // which only comes back when the request resolves the local timezone.
    expect(capturedUrl?.searchParams.get('timezone')).toBe('auto')
  })

  it('joins multiple models into a single comma-separated parameter', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(forecastMultiModelFixture)
      }),
    )

    await fetchForecast({
      ...VALPARAISO,
      hourly: ['temperature_2m'],
      models: ['ecmwf_ifs025', 'icon_seamless'],
    })

    expect(capturedUrl?.searchParams.get('models')).toBe('ecmwf_ifs025,icon_seamless')
  })

  it('sends past_days and forecast_days when given', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(forecastSingleVariableFixture)
      }),
    )

    await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'], pastDays: 1, forecastDays: 2 })

    expect(capturedUrl?.searchParams.get('past_days')).toBe('1')
    expect(capturedUrl?.searchParams.get('forecast_days')).toBe('2')
  })

  it('extracts the trusted server date from the response headers', async () => {
    const result = await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })
    expect(result.serverDate?.toISOString()).toBe('2026-07-26T07:39:41.000Z')
  })

  it('throws OpenMeteoApiError with status and reason on a 429', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(rateLimitErrorFixture, { status: 429 }),
      ),
    )

    expect.assertions(3)
    try {
      await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(429)
      expect((err as OpenMeteoApiError).reason).toBe(rateLimitErrorFixture.reason)
    }
  })

  it('throws OpenMeteoApiError on an error status whose body does not match the error envelope', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ message: 'unexpected shape' }, { status: 500 }),
      ),
    )

    await expect(fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })).rejects.toBeInstanceOf(
      OpenMeteoApiError,
    )
  })

  /**
   * Regression test for a bug found in code review: a non-2xx response with
   * a non-JSON body (e.g. an HTML error page from a proxy sitting in front
   * of the API — plausible on a mobile network, the exact environment
   * DESIGN §9.6 already worries about) was being misclassified as
   * OpenMeteoParseError ("the shape is wrong") when response.status was
   * never even consulted. It must surface as OpenMeteoApiError instead —
   * this is an API/network failure, not evidence our code's assumptions
   * about a successful response are stale.
   */
  it('throws OpenMeteoApiError, not OpenMeteoParseError, for a non-2xx response with a non-JSON body', async () => {
    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () =>
          new HttpResponse('<html><head><title>502 Bad Gateway</title></head></html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )

    expect.assertions(3)
    try {
      await fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(502)
      // Regression: the SyntaxError from the failed JSON.parse used to be
      // silently discarded by a bare `catch {}` with nowhere to put it.
      expect((err as OpenMeteoApiError).cause).toBeInstanceOf(SyntaxError)
    }
  })

  it('throws OpenMeteoParseError when a 2xx body does not match the expected shape', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json({ hourly: { temperature_2m: 'not-an-array' } }),
      ),
    )

    await expect(fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })).rejects.toBeInstanceOf(
      OpenMeteoParseError,
    )
  })

  it('throws OpenMeteoParseError when a 2xx body is not valid JSON', async () => {
    server.use(
      http.get('https://api.open-meteo.com/v1/forecast', () => new HttpResponse('not json', { status: 200 })),
    )

    await expect(fetchForecast({ ...VALPARAISO, hourly: ['temperature_2m'] })).rejects.toBeInstanceOf(
      OpenMeteoParseError,
    )
  })

  it('rejects an out-of-range latitude before making a request', async () => {
    await expect(
      fetchForecast({ latitude: 200, longitude: 0, hourly: ['temperature_2m'] }),
    ).rejects.toThrow(/latitude/i)
  })

  it('rejects an out-of-range longitude before making a request', async () => {
    await expect(
      fetchForecast({ latitude: 0, longitude: 500, hourly: ['temperature_2m'] }),
    ).rejects.toThrow(/longitude/i)
  })
})
