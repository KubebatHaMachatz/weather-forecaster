/**
 * DESIGN §7: the streak counts days *called*, not days correct — showing up
 * is the habit being reinforced. DESIGN §13.4: a missed day breaks it, and
 * that's the only punishment (the rolling skill score is unaffected).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function assertDate(date: string): void {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`date must be formatted YYYY-MM-DD, received "${date}"`)
  }
}

/** Days since the epoch, for gap arithmetic that's immune to month/leap/year edges. */
function toDayNumber(date: string): number {
  assertDate(date)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/**
 * The run of consecutive called days that reaches the present.
 *
 * "Reaches the present" means ending on `today` OR on yesterday: the streak
 * isn't broken until a day passes uncalled, so it must not appear to reset
 * every morning before that day's Call is made.
 *
 * Dates after `today` are ignored rather than counted — a tampered device
 * clock or a stale record shouldn't be able to manufacture streak days that
 * haven't happened.
 */
export function currentStreak(calledDates: readonly string[], today: string): number {
  const todayNumber = toDayNumber(today)

  const days = [...new Set(calledDates.map(toDayNumber))]
    .filter((day) => day <= todayNumber)
    .sort((a, b) => b - a)

  const mostRecent = days[0]
  if (mostRecent === undefined) return 0
  // More than one day stale: the streak has already lapsed.
  if (todayNumber - mostRecent > 1) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const previous = days[i - 1]
    const current = days[i]
    if (previous === undefined || current === undefined) break
    if (previous - current !== 1) break
    streak++
  }
  return streak
}
