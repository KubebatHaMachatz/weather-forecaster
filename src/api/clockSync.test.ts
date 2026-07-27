import { describe, expect, it, vi } from 'vitest'
import { syncTrustedClock } from './clockSync.js'
import { createTrustedClock } from './trustedClock.js'
import type { KeyValueStorage } from '../settings/unitSystemStorage.js'
import type { OpenMeteoResult } from './client.js'

function createFakeStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const store = new Map(Object.entries(seed))
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value)
    },
  }
}

const result = (serverDate: Date | null): OpenMeteoResult =>
  ({ data: {}, serverDate }) as unknown as OpenMeteoResult

describe('syncTrustedClock', () => {
  it('records the server date from the response', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await syncTrustedClock(clock, async () => result(new Date('2026-07-27T12:00:00Z')))
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  /**
   * DESIGN §9.6 makes the daily call budget "a hard architectural
   * constraint, not an optimisation". Syncing again when today's date is
   * already known would spend a request to learn what we already know.
   */
  it('does not spend a request when the date is already known and current', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await syncTrustedClock(clock, async () => result(new Date('2026-07-27T12:00:00Z')))

    const fetcher = vi.fn(async () => result(new Date('2026-07-27T18:00:00Z')))
    await syncTrustedClock(clock, fetcher, new Date('2026-07-27T18:05:00Z'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  /**
   * ...but the stored date going stale is exactly when a fresh one is
   * needed, or a player who opened the app yesterday would keep replaying
   * yesterday's Call forever.
   */
  it('does spend a request when the stored date may have rolled over', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await syncTrustedClock(clock, async () => result(new Date('2026-07-27T12:00:00Z')))

    const fetcher = vi.fn(async () => result(new Date('2026-07-28T09:00:00Z')))
    // Device clock says a day has passed. It isn't TRUSTED for the date
    // itself — it only decides whether asking the server is worthwhile.
    await syncTrustedClock(clock, fetcher, new Date('2026-07-28T09:00:00Z'))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await clock.puzzleDate()).toBe('2026-07-28')
  })

  it('always syncs when nothing has ever been observed', async () => {
    const fetcher = vi.fn(async () => result(new Date('2026-07-27T12:00:00Z')))
    await syncTrustedClock(createTrustedClock(createFakeStorage()), fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  /**
   * Offline is the normal case this must survive: DESIGN §9.7 expects the
   * app to work offline and catch up later.
   */
  it('leaves the previously known date intact when the request fails', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await syncTrustedClock(clock, async () => result(new Date('2026-07-27T12:00:00Z')))

    await syncTrustedClock(
      clock,
      async () => {
        throw new Error('offline')
      },
      new Date('2026-07-28T09:00:00Z'),
    )
    expect(await clock.puzzleDate()).toBe('2026-07-27')
  })

  it('stays null — never guessing — when the very first sync fails', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await syncTrustedClock(clock, async () => {
      throw new Error('offline')
    })
    expect(await clock.puzzleDate()).toBeNull()
  })

  it('does not throw when the response carries no Date header', async () => {
    const clock = createTrustedClock(createFakeStorage())
    await expect(syncTrustedClock(clock, async () => result(null))).resolves.toBeUndefined()
    expect(await clock.puzzleDate()).toBeNull()
  })
})
