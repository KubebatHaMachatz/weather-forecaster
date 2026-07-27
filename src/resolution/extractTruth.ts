import type { Call, QuestionType } from '../puzzle/daily.js'
import type { Truth } from './scoreCall.js'

/**
 * Reading truth out of an Archive response (DESIGN §9.2: "The Archive API
 * is the single canonical oracle... truth *always* comes from the archive.
 * Never mix.").
 */

/** The thresholds are part of the QUESTION (DESIGN §2.1), not tuning knobs. */
const PRECIPITATION_THRESHOLD_MM = 0.2
const GUST_THRESHOLD_KMH = 40

export interface ArchiveQuery {
  readonly latitude: number
  readonly longitude: number
  readonly startDate: string
  readonly endDate: string
  readonly timezone: string
  readonly hourly?: readonly string[]
  readonly daily?: readonly string[]
}

const DAILY_FIELDS: Partial<Record<QuestionType, string>> = {
  'daily-extreme': 'temperature_2m_max',
  precipitation: 'precipitation_sum',
  'gust-exceedance': 'wind_gusts_10m_max',
}

/**
 * The archive request for a Call's truth.
 *
 * Scoped to exactly the target date — a wider window risks reading the
 * wrong day — and asked in the STATION's timezone, because the target hour
 * is a local hour and a UTC series would index a different moment.
 */
export function archiveQueryFor(call: Call): ArchiveQuery {
  const base = {
    latitude: call.station.lat,
    longitude: call.station.lon,
    startDate: call.targetDate,
    endDate: call.targetDate,
    timezone: call.station.timezone,
  }

  if (call.questionType === 'point-temperature') {
    return { ...base, hourly: ['temperature_2m'] }
  }
  const field = DAILY_FIELDS[call.questionType]
  return { ...base, daily: field === undefined ? [] : [field] }
}

/** Minimal shape of the archive payload this module reads. */
interface ArchiveSeries {
  readonly hourly?: { readonly time?: readonly string[]; readonly [field: string]: unknown }
  readonly daily?: { readonly time?: readonly string[]; readonly [field: string]: unknown }
}

function numberAt(series: Record<string, unknown> | undefined, field: string, index: number): number | null {
  const values = series?.[field]
  if (!Array.isArray(values)) return null
  const value = values[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The truth for a Call, or null when the archive can't answer it — a gap in
 * the series, a missing field, a date that isn't there.
 *
 * Null is a real outcome, not an error: the caller must leave the Call
 * unresolved and try again later rather than invent a score.
 *
 * Values are located by TIMESTAMP, never by array index. An archive
 * response that omits, pads or shifts entries would otherwise silently
 * score a different moment than the one the player was asked about.
 */
export function extractTruth(call: Call, response: ArchiveSeries): Truth | null {
  if (call.questionType === 'point-temperature') {
    const times = response.hourly?.time
    if (!Array.isArray(times) || call.targetHourLocal === undefined) return null

    const wanted = `${call.targetDate}T${String(call.targetHourLocal).padStart(2, '0')}:00`
    const index = times.indexOf(wanted)
    if (index === -1) return null

    const value = numberAt(response.hourly as Record<string, unknown>, 'temperature_2m', index)
    return value === null ? null : { kind: 'value', value }
  }

  const field = DAILY_FIELDS[call.questionType]
  const times = response.daily?.time
  if (field === undefined || !Array.isArray(times)) return null

  const index = times.indexOf(call.targetDate)
  if (index === -1) return null

  const value = numberAt(response.daily as Record<string, unknown>, field, index)
  if (value === null) return null

  switch (call.questionType) {
    case 'daily-extreme':
      return { kind: 'value', value }
    case 'precipitation':
      // "≥0.2 mm" — the threshold is inclusive, per the question's wording.
      return { kind: 'occurred', occurred: value >= PRECIPITATION_THRESHOLD_MM }
    case 'gust-exceedance':
      // "gusts OVER 40 km/h" — strictly greater, per the question's wording.
      return { kind: 'occurred', occurred: value > GUST_THRESHOLD_KMH }
    default:
      return null
  }
}
