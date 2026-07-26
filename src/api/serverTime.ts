/**
 * The trusted clock (DESIGN §10 "Fairness without a server"): the HTTP Date
 * header on any Open-Meteo response, never the device clock, since a device
 * clock can be set to anything by the player. Verified live in the spike —
 * SPIKE.md §1 found 1 second of skew against the device clock.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

// RFC 7231 §7.1.1.1 IMF-fixdate, e.g. "Sun, 26 Jul 2026 07:39:41 GMT" — the
// format HTTP's Date header actually uses. Matched and decomposed by hand
// via Date.UTC(...) with explicit numeric fields, rather than handed to
// `new Date(header)`: ECMA-262 only mandates parsing the ISO 8601 subset it
// defines, and leaves any other string format — RFC 1123 included —
// entirely implementation-defined. This app ships to Hermes (React Native)
// while the test suite runs under Node/V8; a header that happens to parse
// under V8 is not proof it parses the same way, or at all, under Hermes.
// Parsing it ourselves removes that engine dependency rather than hoping
// it doesn't matter.
const IMF_FIXDATE = /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/

export function readServerDate(response: Response): Date | null {
  const header = response.headers.get('date')
  if (header === null) return null
  return parseHttpDate(header)
}

/** Exported for direct testing of the parser independent of a Response object. */
export function parseHttpDate(header: string): Date | null {
  const match = IMF_FIXDATE.exec(header)
  if (match === null) return null

  const [, day, monthName, year, hour, minute, second] = match as unknown as [
    string, string, string, string, string, string, string,
  ]
  const month = MONTHS.indexOf(monthName as (typeof MONTHS)[number])
  if (month === -1) return null

  const timestamp = Date.UTC(
    Number(year),
    month,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )

  // Date.UTC silently rolls over an out-of-range field (e.g. day 32 becomes
  // the 1st/2nd of the next month) instead of rejecting it, which would
  // otherwise mask a corrupted header as a plausible-looking, silently wrong
  // date. Reconstructing and comparing catches exactly that.
  const reconstructed = new Date(timestamp)
  const rolledOver =
    reconstructed.getUTCFullYear() !== Number(year) ||
    reconstructed.getUTCMonth() !== month ||
    reconstructed.getUTCDate() !== Number(day)
  if (rolledOver) return null

  return reconstructed
}

/**
 * Like readServerDate, but throws instead of returning null. For callers
 * that need a non-nullable trusted "now" — e.g. gating whether archive data
 * is safe to score against (src/scoring/resolution.ts's isResolvable) — and
 * must never be tempted to silently fall back to the device clock with
 * `serverDate ?? new Date()`, which is exactly the failure DESIGN §10 exists
 * to prevent. Forcing an explicit throw here makes that fallback impossible
 * to reach for by accident.
 */
export function requireServerDate(response: Response): Date {
  const date = readServerDate(response)
  if (date === null) {
    throw new Error(
      'no trusted server date available (missing or unparseable Date header) — ' +
        'never fall back to the device clock here, see DESIGN §10',
    )
  }
  return date
}
