import { describe, expect, it } from 'vitest'
import { erf, standardNormalCdf, standardNormalPdf } from './gaussian.js'

/**
 * gaussian.ts underpins every distribution score in the game, so it is worth
 * testing directly rather than only through CRPS. In particular these tests
 * pin down that the iteration caps in the series and continued-fraction
 * branches are actually sufficient across the whole input range — a silently
 * unconverged erf would make CRPS quietly wrong with no other symptom.
 */

describe('erf', () => {
  it('is exactly zero at zero', () => {
    // Not "close to" — exactly. The Abramowitz & Stegun approximation is not,
    // which is why this implementation uses the incomplete gamma function.
    expect(erf(0)).toBe(0)
  })

  it.each([
    [0.1, 0.1124629160182849],
    [0.5, 0.5204998778130465],
    [1, 0.8427007929497149],
    [1.5, 0.9661051464753107],
    [2, 0.9953222650189527],
    [3, 0.9999779095030014],
    [4, 0.9999999845827421],
  ])('matches the known value at x = %s', (x, expected) => {
    expect(erf(x)).toBeCloseTo(expected, 12)
  })

  it('is an odd function', () => {
    for (const x of [0.25, 1, 2.5, 7]) {
      expect(erf(-x)).toBeCloseTo(-erf(x), 15)
    }
  })

  it('stays within [-1, 1] and saturates for large |x|', () => {
    for (const x of [-1e6, -30, -10, 0, 10, 30, 1e6]) {
      expect(erf(x)).toBeGreaterThanOrEqual(-1)
      expect(erf(x)).toBeLessThanOrEqual(1)
    }
    expect(erf(30)).toBe(1)
    expect(erf(-30)).toBe(-1)
  })

  it('increases monotonically across the branch boundary', () => {
    // The implementation switches between the series and the continued
    // fraction at x² = 1.5; a discontinuity there would be invisible in the
    // spot checks above but fatal to CRPS.
    let previous = erf(0.5)
    for (let x = 0.55; x <= 2.5; x += 0.01) {
      const current = erf(x)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })

  it('is continuous at the branch boundary', () => {
    const boundary = Math.sqrt(1.5)
    const below = erf(boundary - 1e-9)
    const above = erf(boundary + 1e-9)
    expect(above - below).toBeLessThan(1e-8)
  })
})

describe('standardNormalCdf', () => {
  it.each([
    [0, 0.5],
    [1, 0.8413447460685429],
    [-1, 0.15865525393145707],
    [1.96, 0.9750021048517795],
    [-1.96, 0.024997895148220435],
    [3, 0.9986501019683699],
  ])('matches the known value at z = %s', (z, expected) => {
    expect(standardNormalCdf(z)).toBeCloseTo(expected, 12)
  })

  it('is exactly 0.5 at the mean', () => {
    expect(standardNormalCdf(0)).toBe(0.5)
  })

  it('is symmetric: Φ(−z) = 1 − Φ(z)', () => {
    for (const z of [0.5, 1, 2, 4]) {
      expect(standardNormalCdf(-z)).toBeCloseTo(1 - standardNormalCdf(z), 14)
    }
  })

  it('stays within [0, 1] at the extremes', () => {
    expect(standardNormalCdf(-1e6)).toBe(0)
    expect(standardNormalCdf(1e6)).toBe(1)
  })
})

describe('standardNormalPdf', () => {
  it('peaks at 1/√(2π)', () => {
    expect(standardNormalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15)
  })

  it.each([
    [1, 0.24197072451914337],
    [2, 0.05399096651318806],
    [3, 0.0044318484119380075],
  ])('matches the known value at z = %s', (z, expected) => {
    expect(standardNormalPdf(z)).toBeCloseTo(expected, 12)
  })

  it('is symmetric', () => {
    expect(standardNormalPdf(-1.7)).toBe(standardNormalPdf(1.7))
  })

  it('underflows to zero rather than producing NaN', () => {
    expect(standardNormalPdf(1e6)).toBe(0)
  })
})
