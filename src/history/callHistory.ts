import { QUESTION_TYPES, type QuestionType } from '../puzzle/daily.js'
import type { KeyValueStorage } from '../settings/unitSystemStorage.js'

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
  /** Skill score once resolved; absent while the Call is still pending. */
  readonly skill?: number
}

const STORAGE_KEY = 'ensemble.history.calls'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isCallHistoryEntry(value: unknown): value is CallHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<CallHistoryEntry>
  if (typeof candidate.date !== 'string' || !ISO_DATE.test(candidate.date)) return false
  if (typeof candidate.stationLabel !== 'string' || candidate.stationLabel.length === 0) return false
  if (!QUESTION_TYPES.includes(candidate.questionType as QuestionType)) return false
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
 */
export async function recordCall(storage: KeyValueStorage, entry: CallHistoryEntry): Promise<void> {
  const history = await loadCallHistory(storage)
  if (history.some((existing) => existing.date === entry.date)) return
  await storage.setItem(STORAGE_KEY, JSON.stringify([...history, entry]))
}
