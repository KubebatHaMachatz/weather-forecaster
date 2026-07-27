import { describe, expect, it } from 'vitest'
import { createTrustedClock, puzzleDateFrom } from './trustedClock.js'
import type { KeyValueStorage } from '../settings/unitSystemStorage.js'

function createFakeStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const store = new Map(Object.entries(seed))
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value)
    },
  }
}

const NOON_UTC = new Date('2026-07-27T12:00:00Z')

describe('puzzleDateFrom', () => {
  /**
   * DESIGN §10: "Same puzzle for everyone: hash(date)". Everyone on Earth
   * must get the same Call on the same instant, so the date is taken in UTC
   * — deriving it in local time would hand Auckland and Honolulu different
   * puzzles at the same moment.
   */
  it('derives the date in UTC, not local time', () => {
    expect(puzzleDateFrom(new Date('2026-07-27T00:30:00Z'))).toBe('2026-07-27')
    expect(puzzleDateFrom(new Date('2026-07-27T23:30:00Z'))).toBe('2026-07-27')
  })

  it('rolls over at the UTC day boundary', () => {
    expect(puzzleDateFrom(new Date('2026-07-27T23:59:59Z'))).toBe('2026-07-27')
    expect(puzzleDateFrom(new Date('2026-07-28T00:00:00Z'))).toBe('2026-07-28')
  })

  it('pads single-digit months and days', () => {
    expect(puzzleDateFrom(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })

  it('rejects an invalid Date rather than emitting "NaN-NaN-NaN"', () => {
    expect(() => puzzleDateFrom(new Date('nonsense'))).toThrow(TypeError)
  })
})

describe('createTrustedClock', () => {
  it('reports the server date when one has been observed', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(NOON_UTC)
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  it('persists the observation, so a later launch still has a trusted date', async () => {
    const storage = createFakeStorage()
    await createTrustedClock(storage).observe(NOON_UTC)
    // A fresh instance, as after an app restart.
    expect(await createTrustedClock(storage).puzzleDate()).toBe('2026-07-27')
  })

  /**
   * The whole point of DESIGN §10: a device-clock date must never be
   * presented as if it were trusted. With no observation ever made (first
   * launch, offline) the clock says so rather than guessing.
   */
  it('returns null before any server date has ever been seen', async () => {
    expect(await createTrustedClock(createFakeStorage()).puzzleDate()).toBeNull()
  })

  it('never regresses to an earlier server date', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(new Date('2026-07-27T12:00:00Z'))
    await clock.observe(new Date('2026-07-20T12:00:00Z'))
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  it('advances when a later server date arrives', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(new Date('2026-07-27T12:00:00Z'))
    await clock.observe(new Date('2026-07-28T09:00:00Z'))
    expect(await clock.puzzleDate()).toBe('2026-07-28')
  })

  it('ignores an invalid Date rather than poisoning the stored value', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(NOON_UTC)
    await clock.observe(new Date('nonsense'))
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  /**
   * Monotonicity means a bad observation is UNRECOVERABLE — the clock will
   * never accept an earlier date to correct it. So an implausible one must
   * be refused on the way in. A header claiming year 275760 (Date's maximum)
   * would otherwise stick forever AND produce a 6-digit year that the
   * YYYY-MM-DD contracts in daily.ts, streak.ts and rank.ts all reject.
   */
  it('refuses an absurdly far-future date rather than being bricked by it', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(NOON_UTC)
    await clock.observe(new Date(8.64e15)) // the maximum representable Date
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  it('refuses a date from before this app could possibly have run', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(new Date(0)) // 1970
    expect(await clock.puzzleDate()).toBeNull()
  })

  it('always yields a four-digit year, as every date contract here requires', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(NOON_UTC)
    expect(await clock.puzzleDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('degrades to null when the persisted value is corrupt', async () => {
    const storage = createFakeStorage({ 'ensemble.clock.lastServerTime': 'not-a-number' })
    expect(await createTrustedClock(storage).puzzleDate()).toBeNull()
  })

  it('exposes the observed instant, for callers needing station-local timing', async () => {
    const storage = createFakeStorage()
    const clock = createTrustedClock(storage)
    await clock.observe(NOON_UTC)
    const now = await clock.now()
    expect(now?.getTime()).toBe(NOON_UTC.getTime())
  })
})
