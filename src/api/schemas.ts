import { z } from 'zod'

/**
 * Zod schemas for Open-Meteo's response shapes. Modelled directly on the
 * live responses captured during the API spike (SPIKE.md), not on
 * documentation alone.
 *
 * The `hourly`/`daily` blocks are dynamically keyed: a plain variable name
 * ("temperature_2m"), or a per-model name from the multi-model instrument
 * call ("temperature_2m_ecmwf_ifs025", §9.3 of DESIGN.md). `catchall` lets
 * every such key through as a nullable-number series — null shows up for a
 * model with no coverage at a given station (confirmed live: SPIKE.md §2,
 * bom_access_global returned null at the test station).
 */

const timeSeriesSchema = z.array(z.number().nullable())

const hourlyBlockSchema = z
  .object({ time: z.array(z.string()) })
  .catchall(timeSeriesSchema)

const dailyBlockSchema = z
  .object({ time: z.array(z.string()) })
  .catchall(timeSeriesSchema)

/**
 * `hourly_units`/`daily_units` map each variable to a unit string, keyed the
 * same dynamic way. Not validated field-by-field — units are for display,
 * not correctness — so this only enforces that every value is a string.
 */
const unitsBlockSchema = z.record(z.string(), z.string())

export const openMeteoEnvelopeSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  generationtime_ms: z.number(),
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  timezone_abbreviation: z.string(),
  // Confirmed present on forecast responses (SPIKE.md §4); not confirmed on
  // archive responses, so left optional rather than assumed.
  elevation: z.number().optional(),
  hourly_units: unitsBlockSchema.optional(),
  hourly: hourlyBlockSchema.optional(),
  daily_units: unitsBlockSchema.optional(),
  daily: dailyBlockSchema.optional(),
})

export type OpenMeteoEnvelope = z.infer<typeof openMeteoEnvelopeSchema>

/**
 * The error body Open-Meteo returns on a non-2xx response. Captured
 * verbatim in the spike: the 429 from the (unused) ensemble endpoint and the
 * 400 from requesting a future date from the archive (SPIKE.md §2, §4).
 */
export const errorEnvelopeSchema = z.object({
  error: z.literal(true),
  reason: z.string(),
})

export type OpenMeteoErrorEnvelope = z.infer<typeof errorEnvelopeSchema>
