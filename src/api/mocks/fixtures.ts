/**
 * Fixture data for MSW. Field names, nesting, and the exact values below are
 * taken from the live Open-Meteo responses captured during the API spike
 * (SPIKE.md), not invented — so a schema that parses these is a schema that
 * parsed the real API.
 */

export const FIXED_SERVER_DATE_HEADER = 'Sun, 26 Jul 2026 07:39:41 GMT'

// SPIKE.md §4/§5: forecast-api call against Valparaíso.
export const forecastSingleVariableFixture = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 0.34,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  elevation: 56,
  hourly_units: { time: 'iso8601', temperature_2m: '°C', surface_pressure: 'hPa' },
  hourly: {
    time: ['2026-07-26T00:00', '2026-07-26T01:00', '2026-07-26T02:00', '2026-07-26T03:00'],
    temperature_2m: [15.3, 14.8, 14.7, 13.4],
    surface_pressure: [1013.2, 1013.5, 1013.1, 1012.9],
  },
}

// SPIKE.md §2: seven named models in one call, verbatim including the
// bom_access_global null (no regional coverage at this station).
export const forecastMultiModelFixture = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 0.34,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  elevation: 56,
  hourly_units: { time: 'iso8601' },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-07-26T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m_ecmwf_ifs025: Array.from({ length: 48 }, () => 12.0),
    temperature_2m_icon_seamless: Array.from({ length: 48 }, () => 13.3),
    temperature_2m_gfs_seamless: Array.from({ length: 48 }, () => 13.8),
    temperature_2m_gem_seamless: Array.from({ length: 48 }, () => 12.6),
    temperature_2m_meteofrance_seamless: Array.from({ length: 48 }, () => 13.7),
    temperature_2m_jma_seamless: Array.from({ length: 48 }, () => 14.1),
    temperature_2m_ukmo_seamless: Array.from({ length: 48 }, () => 13.8),
    temperature_2m_bom_access_global: Array.from({ length: 48 }, () => null),
  },
}

// SPIKE.md §3: yesterday resolves fully (24/24 non-null hours).
export const archiveFixture = {
  latitude: -33.05,
  longitude: -71.62,
  generationtime_ms: 1.02,
  utc_offset_seconds: -14400,
  timezone: 'America/Santiago',
  timezone_abbreviation: 'GMT-4',
  hourly_units: { time: 'iso8601', temperature_2m: '°C' },
  hourly: {
    time: Array.from({ length: 24 }, (_, h) => `2026-07-25T${String(h).padStart(2, '0')}:00`),
    temperature_2m: [
      13.4, 13.5, 13.3, 13.7, 13.1, 12.8, 12.5, 12.9, 13.6, 14.5, 15.2, 15.9,
      16.4, 16.6, 16.5, 16.3, 15.8, 15.1, 14.6, 14.2, 13.9, 13.7, 13.5, 13.3,
    ],
  },
}

// SPIKE.md §2 — verbatim from the (unused) ensemble endpoint's 429.
export const rateLimitErrorFixture = {
  error: true,
  reason: 'Daily API request limit exceeded. Please try again tomorrow.',
}

// SPIKE.md §4 — verbatim from requesting a future date from the archive.
export const futureDateErrorFixture = {
  error: true,
  reason: "Parameter 'start_date' is out of allowed range from 1940-01-01 to 2026-07-26",
}
