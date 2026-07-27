import { describe, expect, it } from 'vitest'
import {
  SD_BOUNDS,
  TUTORIAL_CALL,
  bellCurvePoints,
  confidenceInterval80,
  scoreTutorialForecast,
} from './tutorialCall.js'

describe('TUTORIAL_CALL', () => {
  /**
   * DESIGN §12 ships a "tutorial Call" — a fixed walkthrough, not today's
   * puzzle, so it can be replayed and always scores the same way.
   */
  it('is fully specified, with a real station label (DESIGN §2.2)', () => {
    expect(TUTORIAL_CALL.stationLabel).toMatch(/, /)
    expect(Number.isFinite(TUTORIAL_CALL.truth)).toBe(true)
    expect(Number.isFinite(TUTORIAL_CALL.climatology.mean)).toBe(true)
    expect(TUTORIAL_CALL.climatology.sd).toBeGreaterThan(0)
  })

  it('starts the player somewhere sensible rather than on the answer', () => {
    expect(TUTORIAL_CALL.initialMean).not.toBe(TUTORIAL_CALL.truth)
    expect(TUTORIAL_CALL.initialSd).toBeGreaterThanOrEqual(SD_BOUNDS.min)
    expect(TUTORIAL_CALL.initialSd).toBeLessThanOrEqual(SD_BOUNDS.max)
  })
})

describe('scoreTutorialForecast', () => {
  const { truth, climatology } = TUTORIAL_CALL

  it('scores a forecast centred on the truth better than one far away', () => {
    const good = scoreTutorialForecast(truth, 2, truth, climatology)
    const bad = scoreTutorialForecast(truth + 10, 2, truth, climatology)
    expect(good.crps).toBeLessThan(bad.crps)
  })

  /**
   * The whole game rests on CRPS being a PROPER scoring rule: an honest
   * forecast must not be beatable by a dishonest one. src/scoring already
   * property-tests that; this pins the tutorial's own wiring to it.
   */
  it('gives positive skill to a forecast that beats climatology', () => {
    const confident = scoreTutorialForecast(truth, 1.5, truth, climatology)
    expect(confident.skill).toBeGreaterThan(0)
  })

  it('gives negative skill to a forecast that loses to climatology', () => {
    const wrong = scoreTutorialForecast(climatology.mean + 15, 1, truth, climatology)
    expect(wrong.skill).toBeLessThan(0)
  })

  it('gives near-zero skill for simply restating climatology', () => {
    const copied = scoreTutorialForecast(climatology.mean, climatology.sd, truth, climatology)
    expect(Math.abs(copied.skill)).toBeLessThan(1e-9)
  })

  /**
   * DESIGN §3.1: "Narrow = high payout, high risk of missing entirely."
   * Overconfidence must actually be punished, or the Bell's central
   * trade-off is cosmetic.
   */
  it('punishes a narrow forecast centred on the wrong value', () => {
    const narrowWrong = scoreTutorialForecast(truth + 6, 0.5, truth, climatology)
    const wideWrong = scoreTutorialForecast(truth + 6, 5, truth, climatology)
    expect(narrowWrong.crps).toBeGreaterThan(wideWrong.crps)
  })

  it('rewards a narrow forecast centred on the right value', () => {
    const narrowRight = scoreTutorialForecast(truth, 0.5, truth, climatology)
    const wideRight = scoreTutorialForecast(truth, 5, truth, climatology)
    expect(narrowRight.crps).toBeLessThan(wideRight.crps)
  })

  it('rejects a non-positive width rather than returning a bogus score', () => {
    expect(() => scoreTutorialForecast(truth, 0, truth, climatology)).toThrow(RangeError)
    expect(() => scoreTutorialForecast(truth, -1, truth, climatology)).toThrow(RangeError)
  })
})

describe('confidenceInterval80', () => {
  it('brackets the mean symmetrically', () => {
    const { low, high } = confidenceInterval80(20, 2)
    expect(20 - low).toBeCloseTo(high - 20, 10)
  })

  it('uses the standard 1.2816 sigma for 80%, not a guessed multiplier', () => {
    const { low, high } = confidenceInterval80(0, 1)
    expect(high).toBeCloseTo(1.2816, 3)
    expect(low).toBeCloseTo(-1.2816, 3)
  })

  it('widens as the forecast gets less confident', () => {
    const narrow = confidenceInterval80(20, 1)
    const wide = confidenceInterval80(20, 4)
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low)
  })
})

describe('bellCurvePoints', () => {
  it('returns the requested number of points', () => {
    expect(bellCurvePoints(20, 3, 10, 30, 41)).toHaveLength(41)
  })

  it('peaks at the mean', () => {
    const points = bellCurvePoints(20, 3, 10, 30, 101)
    const peak = points.reduce((best, p) => (p.density > best.density ? p : best))
    expect(peak.value).toBeCloseTo(20, 1)
  })

  it('spans exactly the requested axis range', () => {
    const points = bellCurvePoints(20, 3, 10, 30, 21)
    expect(points[0]!.value).toBeCloseTo(10, 10)
    expect(points.at(-1)!.value).toBeCloseTo(30, 10)
  })

  it('is symmetric about the mean', () => {
    const points = bellCurvePoints(0, 1, -4, 4, 9)
    expect(points[0]!.density).toBeCloseTo(points.at(-1)!.density, 10)
  })

  it('a narrower forecast has a taller peak (density integrates to 1)', () => {
    const narrow = bellCurvePoints(20, 1, 10, 30, 101)
    const wide = bellCurvePoints(20, 4, 10, 30, 101)
    const peakOf = (ps: readonly { density: number }[]) => Math.max(...ps.map((p) => p.density))
    expect(peakOf(narrow)).toBeGreaterThan(peakOf(wide))
  })
})
