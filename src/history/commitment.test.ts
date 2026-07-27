import { describe, expect, it } from 'vitest'
import {
  answerFormFor,
  commitmentFor,
  describeForecast,
  isCommitted,
  type StatedForecast,
} from './commitment.js'
import type { CallHistoryEntry } from './callHistory.js'

const DISTRIBUTION: StatedForecast = { kind: 'distribution', mean: 12.5, sd: 2 }
const PROBABILITY: StatedForecast = { kind: 'probability', probability: 0.35 }

const entry = (date: string, forecast: StatedForecast): CallHistoryEntry => ({
  date,
  stationLabel: 'Valparaíso, Chile',
  questionType: forecast.kind === 'distribution' ? 'point-temperature' : 'precipitation',
  forecast,
})

describe('answerFormFor', () => {
  /**
   * DESIGN §2.1: types 1-2 take a Distribution (the Bell), types 3-4 take
   * a Probability (the Dial). Getting this mapping wrong would show the
   * wrong input control for the question being asked.
   */
  it('maps the two distribution question types to the Bell', () => {
    expect(answerFormFor('point-temperature')).toBe('distribution')
    expect(answerFormFor('daily-extreme')).toBe('distribution')
  })

  it('maps the two probability question types to the Dial', () => {
    expect(answerFormFor('precipitation')).toBe('probability')
    expect(answerFormFor('gust-exceedance')).toBe('probability')
  })
})

describe('commitmentFor', () => {
  const history = [entry('2026-07-26', DISTRIBUTION), entry('2026-07-27', PROBABILITY)]

  it('finds the entry committed on a given date', () => {
    expect(commitmentFor(history, '2026-07-27')?.forecast).toEqual(PROBABILITY)
  })

  it('returns null for a date with no commitment', () => {
    expect(commitmentFor(history, '2026-07-25')).toBeNull()
  })

  it('returns null for an empty history', () => {
    expect(commitmentFor([], '2026-07-27')).toBeNull()
  })
})

describe('isCommitted', () => {
  /**
   * DESIGN §10: a committed answer "cannot be edited". The UI must be able
   * to ask this cheaply so it never offers a second commit for the same day.
   */
  it('is true once the date has a commitment', () => {
    expect(isCommitted([entry('2026-07-27', DISTRIBUTION)], '2026-07-27')).toBe(true)
  })

  it('is false for a day not yet called', () => {
    expect(isCommitted([entry('2026-07-26', DISTRIBUTION)], '2026-07-27')).toBe(false)
  })

  /**
   * An entry recorded WITHOUT a forecast isn't a commitment — it can't be,
   * since there's no stated answer to score. Treating it as one would let a
   * malformed record block the player from ever calling that day.
   */
  it('is false for an entry that carries no forecast', () => {
    const withoutForecast = { date: '2026-07-27', stationLabel: 'X, Y', questionType: 'precipitation' } as CallHistoryEntry
    expect(isCommitted([withoutForecast], '2026-07-27')).toBe(false)
  })
})

describe('describeForecast', () => {
  it('renders a distribution as its centre and 80% interval', () => {
    expect(describeForecast(DISTRIBUTION, '°C')).toBe('12.5 °C, 80% within 9.9–15.1')
  })

  it('renders a probability as a whole percentage', () => {
    expect(describeForecast(PROBABILITY, '')).toBe('35% chance')
  })

  it('rounds a probability to the nearest percent rather than showing float noise', () => {
    expect(describeForecast({ kind: 'probability', probability: 0.333333 }, '')).toBe('33% chance')
  })

  it('handles the honest-ignorance midpoint DESIGN §3.2 makes always allowed', () => {
    expect(describeForecast({ kind: 'probability', probability: 0.5 }, '')).toBe('50% chance')
  })

  it('handles the certainty endpoints without producing "100.0%"', () => {
    expect(describeForecast({ kind: 'probability', probability: 0 }, '')).toBe('0% chance')
    expect(describeForecast({ kind: 'probability', probability: 1 }, '')).toBe('100% chance')
  })
})
