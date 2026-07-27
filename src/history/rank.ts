/**
 * DESIGN §7: rank is driven by the rolling 30-day mean skill score, "so it
 * can go down" — the window is the whole point, not an optimisation.
 *
 * Skill is the existing src/scoring/skill.ts quantity: 1 is perfect, 0 ties
 * the baseline, negative means the baseline won. Thresholds are therefore
 * expressed in that same unit, and beating the baseline at all (>0) is what
 * earns the first promotion.
 */

export interface Rank {
  readonly title: string
  /** Inclusive lower bound on rolling mean skill. */
  readonly minMeanSkill: number
}

export const RANKS: readonly Rank[] = [
  { title: 'Amateur Observer', minMeanSkill: Number.NEGATIVE_INFINITY },
  { title: 'Station Keeper', minMeanSkill: 0.05 },
  { title: 'Analyst', minMeanSkill: 0.15 },
  { title: 'Forecaster', minMeanSkill: 0.3 },
  { title: 'Chief Forecaster', minMeanSkill: 0.5 },
]

const WINDOW_DAYS = 30

export function rankFor(meanSkill: number): Rank {
  if (!Number.isFinite(meanSkill)) {
    throw new TypeError(`mean skill must be a finite number, received ${meanSkill}`)
  }
  // Walk down from the top so the highest satisfied threshold wins.
  for (let i = RANKS.length - 1; i >= 0; i--) {
    const rank = RANKS[i]
    if (rank !== undefined && meanSkill >= rank.minMeanSkill) return rank
  }
  // Unreachable: the first rank's threshold is -Infinity.
  throw new Error(`no rank matched mean skill ${meanSkill}`)
}

export interface ScoredCall {
  readonly date: string
  readonly skill: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function toDayNumber(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`date must be formatted YYYY-MM-DD, received "${date}"`)
  }
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/**
 * Mean skill over the trailing 30 days, or null when nothing in the window
 * has been scored — null rather than 0, because "no data" and "exactly ties
 * the baseline" are very different claims and 0 would silently assert the
 * latter.
 *
 * Future-dated scores are ignored, matching currentStreak: a wrong device
 * clock shouldn't be able to inflate a rank.
 */
export function rollingMeanSkill(scored: readonly ScoredCall[], today: string): number | null {
  const todayNumber = toDayNumber(today)
  const oldest = todayNumber - (WINDOW_DAYS - 1)

  const inWindow = scored.filter((call) => {
    const day = toDayNumber(call.date)
    return day >= oldest && day <= todayNumber
  })

  if (inWindow.length === 0) return null
  return inWindow.reduce((sum, call) => sum + call.skill, 0) / inWindow.length
}
