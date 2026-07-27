import type { QuestionType } from '../puzzle/daily.js'
import { confidenceInterval80 } from '../tutorial/tutorialCall.js'
import type { CallHistoryEntry } from './callHistory.js'

/**
 * What the player actually stated (DESIGN §3): a distribution via the Bell,
 * or a probability via the Dial. Nothing else is a valid answer.
 */
export type StatedForecast =
  | { readonly kind: 'distribution'; readonly mean: number; readonly sd: number }
  | { readonly kind: 'probability'; readonly probability: number }

export type AnswerForm = StatedForecast['kind']

/**
 * DESIGN §2.1's answer-form column: types 1-2 take a Distribution, types
 * 3-4 take a Probability. v1 ships only these four (DESIGN §12), so this is
 * total over QuestionType rather than needing a fallback.
 */
const ANSWER_FORMS: Record<QuestionType, AnswerForm> = {
  'point-temperature': 'distribution',
  'daily-extreme': 'distribution',
  precipitation: 'probability',
  'gust-exceedance': 'probability',
}

export function answerFormFor(questionType: QuestionType): AnswerForm {
  return ANSWER_FORMS[questionType]
}

/** The Call committed on `date`, or null if that day hasn't been called. */
export function commitmentFor(
  history: readonly CallHistoryEntry[],
  date: string,
): CallHistoryEntry | null {
  return history.find((entry) => entry.date === date) ?? null
}

/**
 * Whether `date` has a real, scoreable commitment.
 *
 * Requires an actual forecast, not merely a record: an entry with no stated
 * answer can't be scored, and treating it as committed would permanently
 * lock the player out of calling that day (DESIGN §10 makes commitments
 * immutable, so there'd be no way back).
 */
export function isCommitted(history: readonly CallHistoryEntry[], date: string): boolean {
  return commitmentFor(history, date)?.forecast !== undefined
}

/** One-line human summary of a stated forecast, for History and confirmations. */
export function describeForecast(forecast: StatedForecast, unit: string): string {
  if (forecast.kind === 'probability') {
    return `${Math.round(forecast.probability * 100)}% chance`
  }
  const { low, high } = confidenceInterval80(forecast.mean, forecast.sd)
  const suffix = unit === '' ? '' : ` ${unit}`
  return `${forecast.mean.toFixed(1)}${suffix}, 80% within ${low.toFixed(1)}–${high.toFixed(1)}`
}
