import { describe, expect, it } from 'vitest'
import { createRandom, hashString, seedFromDate } from './prng.js'

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('Chile')).toBe(hashString('Chile'))
  })

  it('differs for different strings', () => {
    expect(hashString('Chile')).not.toBe(hashString('China'))
  })

  it('is sensitive to non-ASCII input', () => {
    // These previously fed a locale-aware comparator (ICU collation, which
    // treats diacritics specially and can even be absent on-device under
    // Hermes). hashString instead reads raw UTF-16 code units via
    // charCodeAt, so it is unaffected by locale, collation, or ICU presence.
    expect(hashString('Åre')).not.toBe(hashString('Are'))
    expect(hashString('Åre')).not.toBe(hashString('Zre'))
  })

  it('produces an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'Reykjavík', 'Ürümqi']) {
      const h = hashString(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

})

describe('seedFromDate', () => {
  it('is deterministic', () => {
    expect(seedFromDate('2026-07-27')).toBe(seedFromDate('2026-07-27'))
  })

  it('differs for adjacent dates', () => {
    expect(seedFromDate('2026-07-27')).not.toBe(seedFromDate('2026-07-28'))
  })

  it('produces an unsigned 32-bit integer', () => {
    for (const date of ['1970-01-01', '2026-07-27', '2099-12-31']) {
      const seed = seedFromDate(date)
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('rejects a malformed date', () => {
    expect(() => seedFromDate('27-07-2026')).toThrow(/date/i)
    expect(() => seedFromDate('')).toThrow(/date/i)
  })
})

describe('createRandom', () => {
  it('is reproducible from the same seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it('diverges for different seeds', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next())
  })

  it('stays within [0, 1)', () => {
    const r = createRandom(7)
    for (let i = 0; i < 10_000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const r = createRandom(seedFromDate('2026-07-27'))
    const buckets = new Array(10).fill(0) as number[]
    const draws = 100_000
    for (let i = 0; i < draws; i++) {
      buckets[Math.floor(r.next() * 10)]! += 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - 500)
      expect(count).toBeLessThan(draws / 10 + 500)
    }
  })

  describe('int', () => {
    it('stays within bounds', () => {
      const r = createRandom(3)
      for (let i = 0; i < 5_000; i++) {
        const v = r.int(7)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(7)
      }
    })

    it('eventually reaches every value in range', () => {
      const r = createRandom(9)
      const seen = new Set<number>()
      for (let i = 0; i < 1_000; i++) seen.add(r.int(5))
      expect(seen.size).toBe(5)
    })

    it('rejects a non-positive or non-integer bound', () => {
      const r = createRandom(1)
      expect(() => r.int(0)).toThrow(/positive/i)
      expect(() => r.int(-3)).toThrow(/positive/i)
      expect(() => r.int(2.5)).toThrow(/integer/i)
    })
  })

  describe('pick', () => {
    it('always returns a member of the list', () => {
      const r = createRandom(11)
      const items = ['a', 'b', 'c'] as const
      for (let i = 0; i < 500; i++) {
        expect(items).toContain(r.pick(items))
      }
    })

    it('rejects an empty list', () => {
      expect(() => createRandom(1).pick([])).toThrow(/empty/i)
    })
  })
})

/**
 * The stability contract.
 *
 * Every player's daily puzzle derives from this generator, so changing the
 * algorithm or the seed derivation would silently rewrite what everyone gets
 * on every date, past and future, and break comparability of shared results.
 *
 * If these fail, the change is a BREAKING one — not a refactor. Do not update
 * the numbers to make the test pass unless that is genuinely intended.
 */
describe('stability contract (golden values)', () => {
  it.each([
    ['2026-07-27', 1150819893],
    ['2026-01-01', 2049302883],
    ['2000-02-29', 4125131930],
  ])('derives a frozen seed for %s', (date, expected) => {
    expect(seedFromDate(date)).toBe(expected)
  })

  it.each([
    ['2026-07-27', [0.514504313701764, 0.800163148436695, 0.628524385625497]],
    ['2026-01-01', [0.638679139316082, 0.651086451020092, 0.273895818972960]],
    ['2000-02-29', [0.037794176023453, 0.444613269530237, 0.649448233423755]],
  ])('produces a frozen draw sequence for %s', (date, expected) => {
    const r = createRandom(seedFromDate(date))
    const actual = [r.next(), r.next(), r.next()]
    for (const [i, value] of expected.entries()) {
      expect(actual[i]).toBeCloseTo(value, 15)
    }
  })
})
