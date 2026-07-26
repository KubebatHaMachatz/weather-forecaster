import { describe, expect, it } from 'vitest'
import { reliabilityDiagram } from './reliability.js'

/**
 * The personal calibration curve (DESIGN §7.1): "when you say 70%, it
 * happens 52% of the time — you are overconfident in the 60–80% band." This
 * bins a player's history of (stated probability, did it happen) pairs from
 * Dial questions into equal-width probability bins and compares stated
 * confidence against observed frequency within each.
 */

describe('reliabilityDiagram', () => {
  it('assigns observations to the correct bin and computes frequency within it', () => {
    const result = reliabilityDiagram(
      [
        { probability: 0.75, occurred: true },
        { probability: 0.72, occurred: true },
        { probability: 0.78, occurred: false },
        { probability: 0.71, occurred: false },
      ],
      10,
    )
    // All four land in the 0.7-0.8 bin (index 7).
    const bin = result[7]!
    expect(bin.count).toBe(4)
    expect(bin.observedFrequency).toBeCloseTo(0.5, 12)
    expect(bin.meanStatedProbability).toBeCloseTo((0.75 + 0.72 + 0.78 + 0.71) / 4, 12)
  })

  it('reproduces the DESIGN §7.1 overconfidence example', () => {
    // 100 calls at ~70% stated confidence, only 52 occurred.
    const observations = [
      ...Array.from({ length: 52 }, () => ({ probability: 0.7, occurred: true })),
      ...Array.from({ length: 48 }, () => ({ probability: 0.7, occurred: false })),
    ]
    const result = reliabilityDiagram(observations, 10)
    const bin = result[7]! // [0.7, 0.8)
    expect(bin.meanStatedProbability).toBeCloseTo(0.7, 12)
    expect(bin.observedFrequency).toBeCloseTo(0.52, 12)
    // The gap between these two is exactly what the UI plots as overconfidence.
    expect(bin.meanStatedProbability! - bin.observedFrequency!).toBeCloseTo(0.18, 12)
  })

  it('reports null rather than NaN for a bin with no observations', () => {
    const result = reliabilityDiagram([{ probability: 0.05, occurred: true }], 10)
    expect(result[5]!.count).toBe(0)
    expect(result[5]!.meanStatedProbability).toBeNull()
    expect(result[5]!.observedFrequency).toBeNull()
  })

  it('returns binCount empty bins for an empty history', () => {
    const result = reliabilityDiagram([], 10)
    expect(result).toHaveLength(10)
    for (const bin of result) {
      expect(bin.count).toBe(0)
      expect(bin.meanStatedProbability).toBeNull()
      expect(bin.observedFrequency).toBeNull()
    }
  })

  it('places a probability of exactly 1.0 in the last bin, not off the end', () => {
    const result = reliabilityDiagram([{ probability: 1.0, occurred: true }], 10)
    expect(result[9]!.count).toBe(1)
    expect(result.slice(0, 9).every((b) => b.count === 0)).toBe(true)
  })

  it('places a probability of exactly 0.0 in the first bin', () => {
    const result = reliabilityDiagram([{ probability: 0.0, occurred: false }], 10)
    expect(result[0]!.count).toBe(1)
  })

  it('defaults to 10 bins', () => {
    expect(reliabilityDiagram([])).toHaveLength(10)
  })

  it('produces bins that exactly tile [0, 1] with no gaps or overlaps', () => {
    const result = reliabilityDiagram([], 20)
    expect(result[0]!.binStart).toBe(0)
    expect(result[result.length - 1]!.binEnd).toBe(1)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.binStart).toBeCloseTo(result[i - 1]!.binEnd, 12)
    }
  })

  it('conserves the total observation count across all bins', () => {
    const observations = Array.from({ length: 137 }, (_, i) => ({
      probability: (i % 101) / 100,
      occurred: i % 3 === 0,
    }))
    const result = reliabilityDiagram(observations, 10)
    const total = result.reduce((sum, bin) => sum + bin.count, 0)
    expect(total).toBe(observations.length)
  })

  it('rejects a probability outside [0, 1]', () => {
    expect(() => reliabilityDiagram([{ probability: 1.5, occurred: true }])).toThrow(/probability/i)
    expect(() => reliabilityDiagram([{ probability: -0.1, occurred: true }])).toThrow(/probability/i)
  })

  it('rejects a non-finite probability', () => {
    expect(() => reliabilityDiagram([{ probability: Number.NaN, occurred: true }])).toThrow()
  })

  it('rejects a non-positive or non-integer bin count', () => {
    expect(() => reliabilityDiagram([], 0)).toThrow(/bin/i)
    expect(() => reliabilityDiagram([], -1)).toThrow(/bin/i)
    expect(() => reliabilityDiagram([], 3.5)).toThrow(/bin/i)
  })
})
