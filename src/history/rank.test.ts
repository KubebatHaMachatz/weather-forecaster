import { describe, expect, it } from 'vitest'
import { RANKS, rankFor, rollingMeanSkill } from './rank.js'

/**
 * DESIGN §7: "Rank — Amateur Observer → Station Keeper → Analyst →
 * Forecaster → Chief Forecaster. Driven by rolling 30-day mean skill score,
 * so it can go down."
 */
describe('RANKS', () => {
  it('lists DESIGN §7\'s five ranks in order', () => {
    expect(RANKS.map((r) => r.title)).toEqual([
      'Amateur Observer',
      'Station Keeper',
      'Analyst',
      'Forecaster',
      'Chief Forecaster',
    ])
  })

  it('has strictly increasing thresholds, so exactly one rank can apply', () => {
    const thresholds = RANKS.map((r) => r.minMeanSkill)
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]!).toBeGreaterThan(thresholds[i - 1]!)
    }
  })

  it('starts at the bottom rank with no skill at all', () => {
    expect(RANKS[0]!.minMeanSkill).toBeLessThanOrEqual(0)
  })
})

describe('rankFor', () => {
  it('gives the lowest rank to a forecaster who loses to the baseline', () => {
    // Negative skill means the baseline beat them.
    expect(rankFor(-0.5).title).toBe('Amateur Observer')
  })

  it('gives the lowest rank at exactly zero skill (tying the baseline)', () => {
    expect(rankFor(0).title).toBe('Amateur Observer')
  })

  it('gives the top rank for a very high skill score', () => {
    expect(rankFor(0.95).title).toBe('Chief Forecaster')
  })

  it('is monotonic — more skill never means a lower rank', () => {
    let previousIndex = -1
    for (let skill = -1; skill <= 1.0001; skill += 0.01) {
      const index = RANKS.indexOf(rankFor(skill))
      expect(index).toBeGreaterThanOrEqual(previousIndex)
      previousIndex = index
    }
  })

  it('promotes exactly at a threshold, not just above it', () => {
    const second = RANKS[1]!
    expect(rankFor(second.minMeanSkill).title).toBe(second.title)
  })

  it('rejects a non-finite skill rather than silently ranking it', () => {
    expect(() => rankFor(Number.NaN)).toThrow(TypeError)
    expect(() => rankFor(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })
})

describe('rollingMeanSkill', () => {
  const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}`

  it('is null with no scored calls, so callers show "unranked" not a fake zero', () => {
    expect(rollingMeanSkill([], '2026-07-27')).toBeNull()
  })

  it('averages the scores inside the window', () => {
    const scored = [
      { date: day(26), skill: 0.4 },
      { date: day(27), skill: 0.6 },
    ]
    expect(rollingMeanSkill(scored, '2026-07-27')).toBeCloseTo(0.5, 10)
  })

  /**
   * DESIGN §7 specifies a ROLLING 30-day mean — the point is that rank "can
   * go down", which only works if old glories age out of the window.
   */
  it('excludes calls older than the 30-day window', () => {
    const scored = [
      { date: '2026-06-01', skill: 1.0 }, // far outside the window
      { date: day(27), skill: 0.2 },
    ]
    expect(rollingMeanSkill(scored, '2026-07-27')).toBeCloseTo(0.2, 10)
  })

  it('includes a call exactly at the window edge', () => {
    // 29 days back is the 30th day counting today — still inside.
    const scored = [
      { date: '2026-06-28', skill: 1.0 },
      { date: day(27), skill: 0.0 },
    ]
    expect(rollingMeanSkill(scored, '2026-07-27')).toBeCloseTo(0.5, 10)
  })

  it('is null when every scored call has aged out', () => {
    expect(rollingMeanSkill([{ date: '2026-01-01', skill: 0.9 }], '2026-07-27')).toBeNull()
  })

  it('ignores future-dated scores rather than letting them inflate the mean', () => {
    const scored = [
      { date: day(27), skill: 0.2 },
      { date: '2026-08-15', skill: 1.0 },
    ]
    expect(rollingMeanSkill(scored, '2026-07-27')).toBeCloseTo(0.2, 10)
  })
})
