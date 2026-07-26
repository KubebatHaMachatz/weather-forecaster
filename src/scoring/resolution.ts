/**
 * When is a Call safe to resolve?
 *
 * The spike (SPIKE.md §4) found the Archive API returns a full 24 hours for
 * *today*, including hours that have not happened yet, filled from forecast
 * rather than analysis. Scoring against that would grade players on a forecast
 * dressed up as truth — silently, and only for some timezones.
 *
 * Hence: a Call resolves only once its target date is strictly in the past in
 * the STATION's local time. Not UTC, and never the device clock.
 *
 * Offsets come from Open-Meteo's `utc_offset_seconds`, which is why this module
 * needs no timezone database and no Intl — plain arithmetic, fully portable to
 * Hermes, and trivially testable.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Real offsets span UTC−12 to UTC+14; a little slack, but 20 hours is a bug. */
const MAX_OFFSET_SECONDS = 15 * 3600

function assertValidClock(now: Date): void {
  if (Number.isNaN(now.getTime())) {
    throw new TypeError('clock is an invalid Date')
  }
}

function assertValidOffset(utcOffsetSeconds: number): void {
  if (!Number.isFinite(utcOffsetSeconds) || Math.abs(utcOffsetSeconds) > MAX_OFFSET_SECONDS) {
    throw new RangeError(
      `utc offset out of range: ${utcOffsetSeconds}s (max ±${MAX_OFFSET_SECONDS}s)`,
    )
  }
}

function assertValidDate(date: string): void {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`date must be formatted YYYY-MM-DD, received "${date}"`)
  }
  // Reject impossible calendar dates too — "2026-02-31" matches the shape but
  // can never be a target, and would otherwise compare as a plausible string.
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const asDate = new Date(Date.UTC(year, month - 1, day))
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    throw new RangeError(`date is not a real calendar date: "${date}"`)
  }
}

/** The calendar date at the station right now, as YYYY-MM-DD. */
export function stationLocalDate(now: Date, utcOffsetSeconds: number): string {
  assertValidClock(now)
  assertValidOffset(utcOffsetSeconds)

  const shifted = new Date(now.getTime() + utcOffsetSeconds * 1000)
  const year = String(shifted.getUTCFullYear()).padStart(4, '0')
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * True only when `targetDate` is strictly before today at the station.
 * ISO dates are lexicographically ordered, so a string compare is the
 * comparison — no parsing, no drift.
 */
export function isResolvable(
  targetDate: string,
  utcOffsetSeconds: number,
  now: Date,
): boolean {
  assertValidDate(targetDate)
  return targetDate < stationLocalDate(now, utcOffsetSeconds)
}
