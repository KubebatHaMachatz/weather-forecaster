/**
 * The deterministic random source behind the daily Call.
 *
 * This is a STABILITY CONTRACT, not an implementation detail. Every player's
 * puzzle is derived from it, so changing the algorithm — or the seed
 * derivation — silently changes what everybody gets on every past and future
 * date, and breaks comparability of shared results. prng.test.ts pins the
 * exact output with golden values so that can never happen by accident.
 *
 * Deliberately separate from src/testing/rng.ts: that one is test scaffolding
 * and free to change, this one is frozen.
 */

/** FNV-1a, 32-bit. Chosen for being tiny, well-specified and easy to re-implement. */
export function seedFromDate(isoDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError(`seed date must be formatted YYYY-MM-DD, received "${isoDate}"`)
  }

  let hash = 0x811c9dc5
  for (let i = 0; i < isoDate.length; i++) {
    hash ^= isoDate.charCodeAt(i)
    // hash *= 16777619, via shifts to stay in 32-bit integer space
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export interface Random {
  /** Next float in [0, 1). */
  next(): number
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** Uniform choice from a non-empty list. */
  pick<T>(items: readonly T[]): T
}

/** mulberry32 — a small, well-specified generator with good distribution. */
export function createRandom(seed: number): Random {
  if (!Number.isFinite(seed)) {
    throw new TypeError(`seed must be a finite number, received ${seed}`)
  }

  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`bound must be a positive integer, received ${maxExclusive}`)
    }
    return Math.floor(next() * maxExclusive)
  }

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('cannot pick from an empty list')
      }
      // Non-null assertion avoided: int() is always a valid index here, but
      // noUncheckedIndexedAccess cannot know that, so check explicitly.
      const chosen = items[int(items.length)]
      if (chosen === undefined) {
        throw new Error('unreachable: index derived from list length')
      }
      return chosen
    },
  }
}
