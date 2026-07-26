/**
 * Deterministic RNG for tests. Property tests must be reproducible — a flaky
 * propriety test is worse than no propriety test, because it trains you to
 * ignore it.
 */

/** mulberry32 — small, fast, good enough for statistical test fixtures. */
export function uniformSampler(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box–Muller over a seeded uniform stream. */
export function normalSampler(seed: number, mean = 0, sd = 1): () => number {
  const u = uniformSampler(seed)
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const v = spare
      spare = null
      return mean + sd * v
    }
    // guard against u1 === 0, which would make log() diverge
    const u1 = Math.max(u(), Number.EPSILON)
    const u2 = u()
    const r = Math.sqrt(-2 * Math.log(u1))
    const theta = 2 * Math.PI * u2
    spare = r * Math.sin(theta)
    return mean + sd * r * Math.cos(theta)
  }
}

export function sample(n: number, next: () => number): number[] {
  return Array.from({ length: n }, next)
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error('mean of empty array')
  let total = 0
  for (const x of xs) total += x
  return total / xs.length
}
