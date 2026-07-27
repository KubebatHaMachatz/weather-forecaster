import { describe, expect, it } from 'vitest'
import { CLIMATOLOGY_PROBABILITY, scoreAgainstTruth } from './scoreCall.js'
import type { StatedForecast } from '../history/commitment.js'

const distribution = (mean: number, sd: number): StatedForecast => ({ kind: 'distribution', mean, sd })
const probability = (p: number): StatedForecast => ({ kind: 'probability', probability: p })

const CLIMATOLOGY = { mean: 12, sd: 5 }

describe('scoreAgainstTruth — distributions', () => {
  it('scores a forecast centred on the truth better than one far away', () => {
    const good = scoreAgainstTruth(distribution(12, 2), { kind: 'value', value: 12 }, CLIMATOLOGY)
    const bad = scoreAgainstTruth(distribution(25, 2), { kind: 'value', value: 12 }, CLIMATOLOGY)
    expect(good.score).toBeLessThan(bad.score)
  })

  it('gives positive skill for beating climatology', () => {
    const result = scoreAgainstTruth(distribution(12, 1.5), { kind: 'value', value: 12 }, CLIMATOLOGY)
    expect(result.skill).toBeGreaterThan(0)
  })

  it('gives zero skill for exactly restating climatology', () => {
    const result = scoreAgainstTruth(
      distribution(CLIMATOLOGY.mean, CLIMATOLOGY.sd),
      { kind: 'value', value: 12 },
      CLIMATOLOGY,
    )
    expect(Math.abs(result.skill)).toBeLessThan(1e-9)
  })

  /**
   * DESIGN §3.1's whole trade-off: narrow is high payout AND high risk.
   * If overconfidence weren't punished harder, the Bell's width control
   * would be decorative.
   */
  it('punishes a confidently wrong forecast more than a hedged wrong one', () => {
    const confident = scoreAgainstTruth(distribution(25, 1), { kind: 'value', value: 12 }, CLIMATOLOGY)
    const hedged = scoreAgainstTruth(distribution(25, 6), { kind: 'value', value: 12 }, CLIMATOLOGY)
    expect(confident.score).toBeGreaterThan(hedged.score)
  })
})

describe('scoreAgainstTruth — probabilities', () => {
  it('rewards confidence in the outcome that happened', () => {
    const right = scoreAgainstTruth(probability(0.9), { kind: 'occurred', occurred: true }, CLIMATOLOGY)
    const wrong = scoreAgainstTruth(probability(0.1), { kind: 'occurred', occurred: true }, CLIMATOLOGY)
    expect(right.score).toBeLessThan(wrong.score)
  })

  /**
   * DESIGN §3.2: "Committing at 50% is always allowed and always scores
   * zero net — honest ignorance is free, which is exactly right."
   */
  it('scores 50% at exactly zero skill, whichever way it resolves', () => {
    for (const occurred of [true, false]) {
      const result = scoreAgainstTruth(
        probability(CLIMATOLOGY_PROBABILITY),
        { kind: 'occurred', occurred },
        CLIMATOLOGY,
      )
      expect(Math.abs(result.skill)).toBeLessThan(1e-9)
    }
  })

  it('gives positive skill for beating the 50% baseline', () => {
    const result = scoreAgainstTruth(probability(0.85), { kind: 'occurred', occurred: true }, CLIMATOLOGY)
    expect(result.skill).toBeGreaterThan(0)
  })

  it('gives negative skill for losing to the 50% baseline', () => {
    const result = scoreAgainstTruth(probability(0.85), { kind: 'occurred', occurred: false }, CLIMATOLOGY)
    expect(result.skill).toBeLessThan(0)
  })

  it('handles total certainty at both ends without producing a non-finite score', () => {
    for (const p of [0, 1]) {
      for (const occurred of [true, false]) {
        const result = scoreAgainstTruth(probability(p), { kind: 'occurred', occurred }, CLIMATOLOGY)
        expect(Number.isFinite(result.score)).toBe(true)
        expect(Number.isFinite(result.skill)).toBe(true)
      }
    }
  })
})

describe('scoreAgainstTruth — mismatched truth', () => {
  /**
   * A distribution scored against a boolean (or vice versa) means the
   * question type and the stored answer have diverged. That's a bug, and
   * inventing a score for it would bury the bug inside the player's rank.
   */
  it('refuses to score a distribution against a boolean outcome', () => {
    expect(() =>
      scoreAgainstTruth(distribution(12, 2), { kind: 'occurred', occurred: true }, CLIMATOLOGY),
    ).toThrow(TypeError)
  })

  it('refuses to score a probability against a numeric value', () => {
    expect(() =>
      scoreAgainstTruth(probability(0.5), { kind: 'value', value: 12 }, CLIMATOLOGY),
    ).toThrow(TypeError)
  })
})
