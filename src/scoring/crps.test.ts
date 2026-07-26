import { describe, expect, it } from 'vitest'
import { crpsEmpirical, crpsFair, crpsGaussian } from './crps.js'
import { mean, normalSampler, sample } from '../testing/rng.js'

describe('crpsGaussian', () => {
  it('matches the closed-form value at the distribution mean', () => {
    // CRPS(N(0,1), 0) = 2φ(0) − 1/√π
    const expected = 2 * (1 / Math.sqrt(2 * Math.PI)) - 1 / Math.sqrt(Math.PI)
    expect(crpsGaussian(0, 1, 0)).toBeCloseTo(expected, 12)
    expect(crpsGaussian(0, 1, 0)).toBeCloseTo(0.2336949, 6)
  })

  it('scales linearly with sd when the error scales too', () => {
    // CRPS is in the units of the variable, so doubling both sd and error
    // must double the score.
    expect(crpsGaussian(0, 2, 2)).toBeCloseTo(2 * crpsGaussian(0, 1, 1), 9)
  })

  it('is symmetric about the mean', () => {
    expect(crpsGaussian(10, 3, 14)).toBeCloseTo(crpsGaussian(10, 3, 6), 12)
  })

  it('grows monotonically as the observation moves away from the mean', () => {
    const scores = [0, 1, 2, 4, 8].map((err) => crpsGaussian(0, 1, err))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!)
    }
  })

  it('approaches absolute error as the forecast becomes certain', () => {
    // A vanishingly narrow forecast is a point forecast, and CRPS degenerates
    // to |error| — which is exactly why CRPS generalises MAE.
    expect(crpsGaussian(5, 1e-9, 8)).toBeCloseTo(3, 6)
  })

  it('treats sd = 0 as a point forecast', () => {
    expect(crpsGaussian(5, 0, 8)).toBeCloseTo(3, 12)
    expect(crpsGaussian(5, 0, 5)).toBeCloseTo(0, 12)
  })

  it('rejects a negative sd', () => {
    expect(() => crpsGaussian(0, -1, 0)).toThrow(/sd/i)
  })

  it('rejects non-finite input', () => {
    expect(() => crpsGaussian(Number.NaN, 1, 0)).toThrow()
    expect(() => crpsGaussian(0, 1, Number.POSITIVE_INFINITY)).toThrow()
  })

  // ── The property that matters most ────────────────────────────────────
  // CRPS is a *proper* scoring rule: stating your true belief must minimise
  // your expected score. If this ever fails, the game rewards lying, which is
  // the single worst bug this app could have.
  describe('propriety', () => {
    const TRUTH = { mean: 12, sd: 3 }
    const observations = sample(30_000, normalSampler(2024, TRUTH.mean, TRUTH.sd))
    const expectedScore = (m: number, s: number) =>
      mean(observations.map((y) => crpsGaussian(m, s, y)))

    const honest = expectedScore(TRUTH.mean, TRUTH.sd)

    const liars: Array<[string, number, number]> = [
      ['overconfident (sd too small)', TRUTH.mean, TRUTH.sd / 2],
      ['underconfident (sd too large)', TRUTH.mean, TRUTH.sd * 2],
      ['biased high', TRUTH.mean + 2, TRUTH.sd],
      ['biased low', TRUTH.mean - 2, TRUTH.sd],
      ['confidently wrong', TRUTH.mean + 4, TRUTH.sd / 3],
    ]

    it.each(liars)('beats a %s forecast', (_label, m, s) => {
      expect(honest).toBeLessThan(expectedScore(m, s))
    })
  })
})

describe('crpsEmpirical', () => {
  it('reduces to absolute error for a single sample', () => {
    expect(crpsEmpirical([7], 10)).toBeCloseTo(3, 12)
    expect(crpsEmpirical([7], 7)).toBeCloseTo(0, 12)
  })

  it('is zero when every sample sits exactly on the observation', () => {
    expect(crpsEmpirical([4, 4, 4, 4], 4)).toBeCloseTo(0, 12)
  })

  it('penalises a spread-out forecast more than a tight correct one', () => {
    expect(crpsEmpirical([9, 10, 11], 10)).toBeLessThan(crpsEmpirical([0, 10, 20], 10))
  })

  it('is order-independent', () => {
    expect(crpsEmpirical([3, 1, 2], 2.5)).toBeCloseTo(crpsEmpirical([1, 2, 3], 2.5), 12)
  })

  it('converges to the Gaussian closed form for a large normal sample', () => {
    // Converges as ~1/√n, so this needs a genuinely large sample to be a
    // stable assertion rather than a seed lottery.
    const draws = sample(50_000, normalSampler(7, 12, 3))
    expect(crpsEmpirical(draws, 14)).toBeCloseTo(crpsGaussian(12, 3, 14), 1)
  })

  it('rejects an empty sample set', () => {
    expect(() => crpsEmpirical([], 0)).toThrow(/empty/i)
  })

  // The multi-model instrument yields nulls for models with no regional
  // coverage; callers filter first, but a stray null must not score as 0.
  it('rejects non-finite samples', () => {
    expect(() => crpsEmpirical([1, Number.NaN, 3], 2)).toThrow()
  })
})

/**
 * Numerical robustness. Added after a code review raised (unproven) concerns
 * about overflow in the pairwise accumulation and precision loss at extreme z.
 * Both turned out to be unfounded — JS has no integer overflow at these
 * magnitudes, and the closed form is exact against its analytic asymptote —
 * but "we checked once" is worth less than an assertion that keeps checking.
 */
describe('numerical robustness', () => {
  const INV_SQRT_PI = 1 / Math.sqrt(Math.PI)

  it('matches the analytic asymptote at extreme z', () => {
    // As |z| → ∞, CRPS(N(μ,σ), y) → |y − μ| − σ/√π. Note it does NOT tend to
    // |y − μ|; the σ/√π offset is real and stays.
    for (const observation of [1e3, 1e6, 1e12]) {
      expect(crpsGaussian(0, 1, observation)).toBe(observation - INV_SQRT_PI)
    }
  })

  it('stays exactly symmetric at extreme z', () => {
    expect(crpsGaussian(0, 1, 1e6)).toBe(crpsGaussian(0, 1, -1e6))
  })

  it('never produces NaN or Infinity for finite input', () => {
    for (const observation of [0, 1e6, -1e6, 1e150, -1e150]) {
      expect(Number.isFinite(crpsGaussian(0, 1, observation))).toBe(true)
    }
  })

  it('is shift-invariant at large magnitudes', () => {
    // CRPS(x + c, y + c) = CRPS(x, y). This is the real test of whether the
    // pairwise accumulation loses precision: if it did, a 1e6 offset would
    // visibly change the answer. It does not.
    const spread = sample(20_000, normalSampler(3, 0, 1e3))
    const shifted = spread.map((x) => x + 1e6)
    expect(crpsEmpirical(shifted, 1e6 + 500)).toBeCloseTo(crpsEmpirical(spread, 500), 6)
  })
})

/**
 * The standard empirical estimator is badly biased for small ensembles — and
 * "small" means exactly our case: seven named models. Measured at n=7 it runs
 * ~21% high, which would make the model consensus look worse than it is and
 * hand the player skill they did not earn. crpsFair (Ferro 2014) corrects the
 * pairwise term for finite ensemble size.
 */
describe('crpsFair', () => {
  it('rejects a sample set with fewer than two members', () => {
    expect(() => crpsFair([5], 5)).toThrow(/two/i)
    expect(() => crpsFair([], 5)).toThrow(/two/i)
  })

  it('is order-independent', () => {
    expect(crpsFair([3, 1, 2], 2.5)).toBeCloseTo(crpsFair([1, 2, 3], 2.5), 12)
  })

  it('converges to the standard estimator for large samples', () => {
    // The two estimators differ only in the spread divisor, n² vs n(n−1), so
    // they diverge by a factor of n/(n−1) — about 1/n. At n = 20 000 that is
    // 5e-5, comfortably inside the 3-decimal tolerance below, while at our
    // real ensemble size of 7 it would be ~17% and this test would fail.
    const draws = sample(20_000, normalSampler(11, 12, 3))
    expect(crpsFair(draws, 14)).toBeCloseTo(crpsEmpirical(draws, 14), 3)
  })

  describe('with a seven-model ensemble — the case that matters', () => {
    const TRUE_SCORE = crpsGaussian(12, 3, 14)
    const REPLICATES = 2000

    const expectedScore = (scorer: (xs: readonly number[], y: number) => number) =>
      mean(
        Array.from({ length: REPLICATES }, (_, r) =>
          scorer(sample(7, normalSampler(r + 1, 12, 3)), 14),
        ),
      )

    it('is effectively unbiased', () => {
      expect(expectedScore(crpsFair)).toBeCloseTo(TRUE_SCORE, 1)
    })

    it('removes the large upward bias of the standard estimator', () => {
      const standardBias = expectedScore(crpsEmpirical) - TRUE_SCORE
      const fairBias = expectedScore(crpsFair) - TRUE_SCORE

      // Standard runs high by ~20% of the true score at this ensemble size.
      expect(standardBias).toBeGreaterThan(0.2)
      // Fair cuts that by more than an order of magnitude.
      expect(Math.abs(fairBias)).toBeLessThan(standardBias / 10)
    })
  })
})
