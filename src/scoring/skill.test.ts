import { describe, expect, it } from 'vitest'
import { skillScore } from './skill.js'

describe('skillScore', () => {
  it('is 1 for a perfect forecast', () => {
    expect(skillScore(0, 0.5)).toBe(1)
  })

  it('is 0 when the forecast merely ties the baseline', () => {
    expect(skillScore(0.4, 0.4)).toBe(0)
  })

  it('is positive when the forecast beats the baseline', () => {
    expect(skillScore(0.25, 0.5)).toBeCloseTo(0.5, 12)
  })

  it('is negative when the baseline wins', () => {
    // Losing to climatology should feel bad and read as bad.
    expect(skillScore(1, 0.5)).toBeCloseTo(-1, 12)
  })

  it('is unbounded below but capped at 1', () => {
    expect(skillScore(10, 0.5)).toBeLessThan(-10)
    expect(skillScore(0, 100)).toBe(1)
  })

  describe('when the baseline is already perfect', () => {
    it('ties at 0 if the forecast is also perfect', () => {
      expect(skillScore(0, 0)).toBe(0)
    })

    it('is -Infinity if the forecast is not', () => {
      // An unbeatable baseline that we still lost to. Rare, but it must not
      // be NaN — NaN would silently poison the rolling 30-day average.
      expect(skillScore(0.3, 0)).toBe(Number.NEGATIVE_INFINITY)
    })
  })

  it('rejects negative scores', () => {
    expect(() => skillScore(-1, 0.5)).toThrow(/negative/i)
    expect(() => skillScore(0.5, -1)).toThrow(/negative/i)
  })

  it('rejects non-finite input', () => {
    expect(() => skillScore(Number.NaN, 0.5)).toThrow()
  })
})
