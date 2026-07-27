import type { KeyValueStorage } from '../settings/unitSystemStorage.js'

/**
 * The trusted clock (DESIGN §10): "read the `Date` response header from any
 * Open-Meteo call. Device-clock tampering does nothing."
 *
 * Every response already carries this — OpenMeteoResult.serverDate — so it
 * costs no extra request. The last observed instant is persisted, so a
 * launch that can't reach the network still has a trusted date to work
 * from rather than reaching for the device clock.
 *
 * Deliberately has NO device-clock fallback anywhere. When nothing has ever
 * been observed, every accessor returns null and callers must handle that
 * explicitly — the one thing DESIGN §10 exists to prevent is a date that
 * silently came from a clock the player controls.
 */

const STORAGE_KEY = 'ensemble.clock.lastServerTime'

/**
 * A date outside this window is not a clock reading, it's a broken header —
 * from a misconfigured proxy, a CDN with a wild skew, or a corrupted value.
 *
 * Bounding it matters more than usual here because observations are
 * MONOTONIC: a bad one can never be corrected by a later, saner one, so a
 * single absurd header would brick the clock permanently. A year-275760
 * date (Date's maximum) would also produce a six-digit year, which the
 * YYYY-MM-DD contracts in daily.ts, streak.ts and rank.ts all reject.
 *
 * The window is deliberately loose — it only has to exclude the absurd, not
 * police plausible drift.
 */
const EARLIEST_PLAUSIBLE = Date.UTC(2025, 0, 1)
const LATEST_PLAUSIBLE = Date.UTC(2100, 0, 1)

/**
 * The puzzle date for an instant, in UTC.
 *
 * UTC, not local time, because DESIGN §10 requires the same puzzle for
 * everyone: deriving this locally would hand Auckland and Honolulu
 * different Calls at the same moment.
 */
export function puzzleDateFrom(instant: Date): string {
  const time = instant.getTime()
  if (Number.isNaN(time)) {
    throw new TypeError('cannot derive a puzzle date from an invalid Date')
  }
  const year = String(instant.getUTCFullYear()).padStart(4, '0')
  const month = String(instant.getUTCMonth() + 1).padStart(2, '0')
  const day = String(instant.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface TrustedClock {
  /** Records a server date seen on a response. Ignores invalid or older values. */
  observe(serverDate: Date): Promise<void>
  /** The last trusted instant, or null if none has ever been observed. */
  now(): Promise<Date | null>
  /** Today's puzzle date (UTC), or null if no trusted instant is known. */
  puzzleDate(): Promise<string | null>
}

export function createTrustedClock(storage: KeyValueStorage): TrustedClock {
  async function readStored(): Promise<number | null> {
    const raw = await storage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const time = Number(raw)
    // Corrupt or hand-edited storage degrades to "unknown", never to a
    // guess — same reasoning as the missing-observation case. The
    // plausibility bound is re-applied on READ as well as write: a value
    // written by an older build (or edited on a rooted device) never went
    // through the write-side check.
    if (!Number.isFinite(time)) return null
    if (time < EARLIEST_PLAUSIBLE || time >= LATEST_PLAUSIBLE) return null
    return time
  }

  const now = async (): Promise<Date | null> => {
    const time = await readStored()
    return time === null ? null : new Date(time)
  }

  return {
    async observe(serverDate: Date): Promise<void> {
      const time = serverDate.getTime()
      if (Number.isNaN(time)) return
      if (time < EARLIEST_PLAUSIBLE || time >= LATEST_PLAUSIBLE) return

      // Monotonic: a response can be served from a cache with an older
      // Date header, and time going backwards would let a past puzzle
      // reappear. Only ever move forward.
      const stored = await readStored()
      if (stored !== null && time <= stored) return

      await storage.setItem(STORAGE_KEY, String(time))
    },
    now,
    async puzzleDate(): Promise<string | null> {
      const instant = await now()
      return instant === null ? null : puzzleDateFrom(instant)
    },
  }
}
