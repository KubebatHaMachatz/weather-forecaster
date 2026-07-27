import { QUESTION_TYPES, type QuestionType } from '../puzzle/daily.js'
import type { KeyValueStorage } from '../settings/unitSystemStorage.js'
import type { StatedForecast } from './commitment.js'

/**
 * A Call the player has actually made, persisted locally. This is the
 * record History reads (DESIGN §7: streak, rank, past calls).
 *
 * `skill` is absent until the Call resolves — DESIGN §9.2a only permits
 * resolution once the target date is past in the STATION's local time, so
 * an unresolved entry is the normal state for the most recent day, not an
 * error.
 */
export interface CallHistoryEntry {
  /** The day the Call was issued, YYYY-MM-DD. */
  readonly date: string
  /** Pre-rendered "City, Country" — DESIGN §2.2 forbids showing a bare name. */
  readonly stationLabel: string
  readonly questionType: QuestionType
  /**
   * What the player stated. Absent only on a malformed or legacy record —
   * a real commitment always carries one, since without it there is
   * nothing to score.
   */
  readonly forecast?: StatedForecast
  /**
   * The TRUSTED instant of commitment (DESIGN §10: "written to SQLite with
   * the trusted timestamp *before* any resolution data is reachable"), as
   * epoch milliseconds.
   */
  readonly committedAt?: number
  /** Skill score once resolved; absent while the Call is still pending. */
  readonly skill?: number
}

const STORAGE_KEY = 'ensemble.history.calls'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A stated forecast must be structurally sound AND numerically usable: an
 * sd of 0 or a probability outside [0, 1] would make crpsGaussian/Brier
 * produce nonsense rather than throw, which is the worse failure.
 */
function isStatedForecast(value: unknown): value is StatedForecast {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StatedForecast> & { kind?: unknown }
  if (candidate.kind === 'distribution') {
    const { mean, sd } = candidate as { mean?: unknown; sd?: unknown }
    return typeof mean === 'number' && Number.isFinite(mean) && typeof sd === 'number' && sd > 0
  }
  if (candidate.kind === 'probability') {
    const { probability } = candidate as { probability?: unknown }
    return typeof probability === 'number' && probability >= 0 && probability <= 1
  }
  return false
}

function isCallHistoryEntry(value: unknown): value is CallHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<CallHistoryEntry>
  if (typeof candidate.date !== 'string' || !ISO_DATE.test(candidate.date)) return false
  if (typeof candidate.stationLabel !== 'string' || candidate.stationLabel.length === 0) return false
  if (!QUESTION_TYPES.includes(candidate.questionType as QuestionType)) return false
  if (candidate.forecast !== undefined && !isStatedForecast(candidate.forecast)) return false
  if (candidate.committedAt !== undefined && !Number.isFinite(candidate.committedAt)) return false
  if (candidate.skill !== undefined && !Number.isFinite(candidate.skill)) return false
  return true
}

/**
 * Every valid entry on disk, in the order written.
 *
 * Persisted data outlives the code that wrote it, so anything unreadable
 * degrades to "no history" and any single unreadable entry is dropped —
 * History showing fewer past Calls is recoverable; History crashing is not.
 */
export async function loadCallHistory(storage: KeyValueStorage): Promise<CallHistoryEntry[]> {
  const raw = await storage.getItem(STORAGE_KEY)
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isCallHistoryEntry)
}

/**
 * Appends a Call, ignoring a date that's already recorded.
 *
 * The idempotence matters: DESIGN §10 makes a committed answer immutable
 * and there is exactly one Call per day, so a repeated write is a duplicate
 * event, not an update. Letting it through would also double-count the day
 * in the streak.
 *
 * This is a read-modify-write, so two truly concurrent calls could have one
 * clobber the other. Not guarded, because the game commits at most one Call
 * per day from a single UI thread — there is no second writer. If a
 * background resolution path ever writes scores here, this needs a real
 * read-modify-write guard rather than an assumption.
 */
export async function recordCall(storage: KeyValueStorage, entry: CallHistoryEntry): Promise<void> {
  const history = await loadCallHistory(storage)
  if (history.some((existing) => existing.date === entry.date)) return
  await storage.setItem(STORAGE_KEY, JSON.stringify([...history, entry]))
}
