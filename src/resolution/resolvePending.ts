import { isResolvable } from '../scoring/resolution.js'
import { loadCallHistory, type CallHistoryEntry } from '../history/callHistory.js'
import { nextDate } from '../puzzle/daily.js'
import type { KeyValueStorage } from '../settings/unitSystemStorage.js'
import { scoreAgainstTruth, type Truth } from './scoreCall.js'

/**
 * Turning committed Calls into scores (DESIGN §9.2), gated by §9.2a's hard
 * invariant: a Call may only resolve once its target date is strictly past
 * in the STATION's local time. The archive returns a fully populated
 * response for "today" filled from forecast rather than analysis, so
 * resolving early would score players against a forecast dressed up as
 * truth — silently, and only in some timezones.
 */

const STORAGE_KEY = 'ensemble.history.calls'

/**
 * Climatology stand-in for distribution questions.
 *
 * DESIGN §9.4 specifies a real per-station climatology built at build time;
 * that asset doesn't exist yet, so this is a deliberately wide, neutral
 * placeholder. It is honest about being one: a wide baseline is easy to
 * beat, so early skill scores flatter the player slightly. Replacing this
 * with the real climatology is required before rank means anything.
 */
const PLACEHOLDER_CLIMATOLOGY = { mean: 15, sd: 8 }

/**
 * How many Calls a single run will resolve.
 *
 * A player returning after a fortnight has a fortnight of pending Calls,
 * and DESIGN §9.6 makes the daily call budget "a hard architectural
 * constraint, not an optimisation" — firing fourteen archive requests in
 * one burst would blow it. The remainder carries over to later runs, which
 * is exactly the catch-up §9.7 describes ("resolution happens on next
 * launch... nothing is ever lost"). Oldest-first, so the backlog drains in
 * order.
 */
export const MAX_RESOLUTIONS_PER_RUN = 3

/**
 * The run currently in flight. History resolves on focus, so a quick
 * blur/focus can start a second run while the first is still fetching —
 * doubling requests against the same budget.
 */
let inFlight: Promise<void> | null = null

/**
 * The committed, unscored Calls whose target date is now strictly past at
 * the station — oldest first, so a backlog resolves in the order it was
 * created.
 */
export function pendingResolvable(
  history: readonly CallHistoryEntry[],
  now: Date,
  // Per ENTRY, not one global offset: §9.2a's invariant is about the
  // STATION's local time, and each Call has a different station. A single
  // shared offset would resolve a UTC+14 Call and a UTC−11 Call at the same
  // instant, when they are a full day apart locally.
  offsetFor: (entry: CallHistoryEntry) => number,
): CallHistoryEntry[] {
  return history
    .filter((entry) => entry.forecast !== undefined && entry.skill === undefined)
    .filter((entry) => isResolvable(nextDate(entry.date), offsetFor(entry), now))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Resolves everything that can be resolved, writing skill scores back.
 *
 * A Call whose truth is unavailable — an archive gap, an offline device —
 * stays PENDING and is retried on a later run. Marking it scored with an
 * invented number would quietly corrupt the player's rank, which is the
 * one thing worth being slow about.
 */
export async function resolvePending(
  storage: KeyValueStorage,
  now: Date,
  fetchTruth: (entry: CallHistoryEntry) => Promise<Truth | null>,
  offsetFor: (entry: CallHistoryEntry) => number = () => 0,
): Promise<void> {
  if (inFlight !== null) return inFlight
  inFlight = runResolution(storage, now, fetchTruth, offsetFor)
  try {
    await inFlight
  } finally {
    inFlight = null
  }
}

async function runResolution(
  storage: KeyValueStorage,
  now: Date,
  fetchTruth: (entry: CallHistoryEntry) => Promise<Truth | null>,
  offsetFor: (entry: CallHistoryEntry) => number,
): Promise<void> {
  const history = await loadCallHistory(storage)
  const resolvable = pendingResolvable(history, now, offsetFor).slice(0, MAX_RESOLUTIONS_PER_RUN)
  if (resolvable.length === 0) return

  const scores = new Map<string, number>()
  for (const entry of resolvable) {
    try {
      const truth = await fetchTruth(entry)
      if (truth === null) continue
      const { skill } = scoreAgainstTruth(entry.forecast!, truth, PLACEHOLDER_CLIMATOLOGY)
      scores.set(entry.date, skill)
    } catch {
      // Leave it pending; a later run tries again.
    }
  }

  if (scores.size === 0) return

  // Re-read rather than reusing the snapshot above: the fetches took real
  // time, and a Call committed meanwhile must not be dropped by writing a
  // stale array back over it.
  const latest = await loadCallHistory(storage)
  const merged = latest.map((entry) => {
    const skill = scores.get(entry.date)
    return skill === undefined || entry.skill !== undefined ? entry : { ...entry, skill }
  })
  await storage.setItem(STORAGE_KEY, JSON.stringify(merged))
}
