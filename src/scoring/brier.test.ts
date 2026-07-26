import { describe, expect, it } from 'vitest'
import { brier } from './brier.js'
import { mean, sample, uniformSampler } from '../testing/rng.js'

describe('brier', () => {
  it('is zero for a confident correct call', () => {
    expect(brier(1, true)).toBe(0)
    expect(brier(0, false)).toBe(0)
  })

  it('is one for a confident wrong call', () => {
    expect(brier(0, true)).toBe(1)
    expect(brier(1, false)).toBe(1)
  })

  it('costs 0.25 to say "no idea", whatever happens', () => {
    // Honest ignorance has a fixed, symmetric price. This is what makes 50%
    // a safe default and keeps the Dial from punishing humility.
    expect(brier(0.5, true)).toBeCloseTo(0.25, 12)
    expect(brier(0.5, false)).toBeCloseTo(0.25, 12)
  })

  it('punishes confident errors superlinearly', () => {
    const wrongAt = (p: number) => brier(p, false)
    expect(wrongAt(0.9) - wrongAt(0.8)).toBeGreaterThan(wrongAt(0.6) - wrongAt(0.5))
  })

  it('rejects probabilities outside [0, 1]', () => {
    expect(() => brier(-0.01, true)).toThrow(/probability/i)
    expect(() => brier(1.01, true)).toThrow(/probability/i)
    expect(() => brier(Number.NaN, true)).toThrow(/probability/i)
  })

  // Same invariant as CRPS: truth must be the optimal strategy.
  describe('propriety', () => {
    const TRUE_P = 0.7
    const draws = sample(40_000, uniformSampler(1234)).map((u) => u < TRUE_P)
    const expectedScore = (p: number) => mean(draws.map((occurred) => brier(p, occurred)))

    const honest = expectedScore(TRUE_P)

    it.each([0, 0.3, 0.5, 0.6, 0.8, 0.9, 1])(
      'beats a forecast of %s',
      (p) => {
        expect(honest).toBeLessThan(expectedScore(p))
      },
    )
  })
})
