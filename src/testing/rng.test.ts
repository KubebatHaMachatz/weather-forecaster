import { describe, expect, it } from 'vitest'
import { mean, normalSampler, sample, uniformSampler } from './rng.js'

describe('uniformSampler', () => {
  it('is deterministic for a given seed', () => {
    expect(sample(5, uniformSampler(42))).toEqual(sample(5, uniformSampler(42)))
  })

  it('differs between seeds', () => {
    expect(sample(5, uniformSampler(1))).not.toEqual(sample(5, uniformSampler(2)))
  })

  it('stays within [0, 1)', () => {
    for (const x of sample(1000, uniformSampler(7))) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('normalSampler', () => {
  it('is deterministic for a given seed', () => {
    expect(sample(5, normalSampler(42))).toEqual(sample(5, normalSampler(42)))
  })

  it('approximates the requested mean and sd', () => {
    const xs = sample(20_000, normalSampler(99, 3, 2))
    const m = mean(xs)
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
    expect(m).toBeCloseTo(3, 1)
    expect(sd).toBeCloseTo(2, 1)
  })
})
