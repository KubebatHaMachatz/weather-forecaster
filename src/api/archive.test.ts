import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fetchArchive } from './archive.js'
import { OpenMeteoApiError, OpenMeteoParseError } from './errors.js'
import { archiveFixture, futureDateErrorFixture } from './mocks/fixtures.js'
import { server } from './mocks/server.js'

const VALPARAISO = { latitude: -33.05, longitude: -71.62 }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('fetchArchive', () => {
  it('parses a full day of resolved history', async () => {
    const result = await fetchArchive({
      ...VALPARAISO,
      startDate: '2026-07-25',
      endDate: '2026-07-25',
      hourly: ['temperature_2m'],
    })
    expect(result.data.hourly?.temperature_2m).toHaveLength(24)
    expect(result.data.hourly?.temperature_2m?.every((v) => v !== null)).toBe(true)
  })

  it('exposes utc_offset_seconds, which the resolution-timing invariant depends on', async () => {
    const result = await fetchArchive({
      ...VALPARAISO,
      startDate: '2026-07-25',
      endDate: '2026-07-25',
      hourly: ['temperature_2m'],
    })
    expect(result.data.utc_offset_seconds).toBe(archiveFixture.utc_offset_seconds)
  })

  it('sends start_date, end_date, latitude and longitude as query parameters', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(archiveFixture)
      }),
    )

    await fetchArchive({
      ...VALPARAISO,
      startDate: '2026-07-25',
      endDate: '2026-07-25',
      hourly: ['temperature_2m'],
    })

    expect(capturedUrl?.searchParams.get('start_date')).toBe('2026-07-25')
    expect(capturedUrl?.searchParams.get('end_date')).toBe('2026-07-25')
    expect(capturedUrl?.searchParams.get('latitude')).toBe('-33.05')
    expect(capturedUrl?.searchParams.get('longitude')).toBe('-71.62')
  })

  it('sends daily variables when given', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(archiveFixture)
      }),
    )

    await fetchArchive({
      ...VALPARAISO,
      startDate: '1991-01-01',
      endDate: '2020-12-31',
      daily: ['temperature_2m_max', 'temperature_2m_min'],
    })

    expect(capturedUrl?.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min')
  })

  it('throws OpenMeteoApiError for a future date, matching the real API behaviour', async () => {
    // SPIKE.md §4: requesting tomorrow returns HTTP 400 with this exact reason.
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json(futureDateErrorFixture, { status: 400 }),
      ),
    )

    expect.assertions(2)
    try {
      await fetchArchive({
        ...VALPARAISO,
        startDate: '2026-07-27',
        endDate: '2026-07-27',
        hourly: ['temperature_2m'],
      })
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(400)
    }
  })

  it('throws OpenMeteoApiError, not OpenMeteoParseError, for a non-2xx response with a non-JSON body', async () => {
    server.use(
      http.get(
        'https://archive-api.open-meteo.com/v1/archive',
        () =>
          new HttpResponse('<html><head><title>504 Gateway Timeout</title></head></html>', {
            status: 504,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )

    expect.assertions(2)
    try {
      await fetchArchive({
        ...VALPARAISO,
        startDate: '2026-07-25',
        endDate: '2026-07-25',
        hourly: ['temperature_2m'],
      })
    } catch (err) {
      expect(err).toBeInstanceOf(OpenMeteoApiError)
      expect((err as OpenMeteoApiError).status).toBe(504)
    }
  })

  it('throws OpenMeteoParseError when the response does not match the expected shape', async () => {
    server.use(
      http.get('https://archive-api.open-meteo.com/v1/archive', () =>
        HttpResponse.json({ hourly: { temperature_2m: 'not-an-array' } }),
      ),
    )

    await expect(
      fetchArchive({
        ...VALPARAISO,
        startDate: '2026-07-25',
        endDate: '2026-07-25',
        hourly: ['temperature_2m'],
      }),
    ).rejects.toBeInstanceOf(OpenMeteoParseError)
  })

  it('rejects an out-of-range latitude before making a request', async () => {
    await expect(
      fetchArchive({
        latitude: -200,
        longitude: 0,
        startDate: '2026-07-25',
        endDate: '2026-07-25',
      }),
    ).rejects.toThrow(/latitude/i)
  })

  it('rejects an out-of-range longitude before making a request', async () => {
    await expect(
      fetchArchive({
        latitude: 0,
        longitude: 500,
        startDate: '2026-07-25',
        endDate: '2026-07-25',
      }),
    ).rejects.toThrow(/longitude/i)
  })
})
