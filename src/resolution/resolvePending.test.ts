import { describe, expect, it, vi } from 'vitest'
import { pendingResolvable, resolvePending } from './resolvePending.js'
import type { CallHistoryEntry } from '../history/callHistory.js'
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

const committed = (date: string, extra: Partial<CallHistoryEntry> = {}): CallHistoryEntry => ({
  date,
  stationLabel: 'Valparaíso, Chile',
  questionType: 'precipitation',
  forecast: { kind: 'probability', probability: 0.8 },
  ...extra,
})

describe('pendingResolvable', () => {
  /**
   * DESIGN §9.2a, the hard invariant: "only resolve a Call whose target
   * date is strictly in the past in the station's own local timezone.
   * Never resolve against today." The archive returns a fully populated
   * response for today filled from FORECAST rather than analysis, so
   * resolving early would score players against a forecast dressed as truth.
   */
  it('does not resolve a Call whose target date is still today at the station', () => {
    // Call made 2026-07-27 targets 2026-07-28; at the station it IS the 28th.
    const now = new Date('2026-07-28T12:00:00Z')
    expect(pendingResolvable([committed('2026-07-27')], now, () => 0)).toEqual([])
  })

  it('resolves once the target date is strictly past at the station', () => {
    const now = new Date('2026-07-29T12:00:00Z')
    expect(pendingResolvable([committed('2026-07-27')], now, () => 0)).toHaveLength(1)
  })

  /**
   * The edge the invariant exists for: at UTC+14 the station is already on
   * the next calendar day, so a Call that looks resolvable in UTC is not
   * yet resolvable there — and vice versa at UTC−11.
   */
  it('respects the far-east edge, where station-local is a day ahead of UTC', () => {
    // 2026-07-28T23:00Z is 2026-07-29 13:00 at UTC+14 — target 07-28 is past.
    const now = new Date('2026-07-28T23:00:00Z')
    expect(pendingResolvable([committed('2026-07-27')], now, () => 14 * 3600)).toHaveLength(1)
    // The same instant at UTC-11 is still 2026-07-28 12:00 — NOT past.
    expect(pendingResolvable([committed('2026-07-27')], now, () => -11 * 3600)).toEqual([])
  })

  it('skips entries that are already scored', () => {
    const now = new Date('2026-07-29T12:00:00Z')
    expect(pendingResolvable([committed('2026-07-27', { skill: 0.4 })], now, () => 0)).toEqual([])
  })

  it('skips entries with no stated forecast, which cannot be scored', () => {
    const now = new Date('2026-07-29T12:00:00Z')
    const noForecast = { date: '2026-07-27', stationLabel: 'X, Y', questionType: 'precipitation' } as CallHistoryEntry
    expect(pendingResolvable([noForecast], now, () => 0)).toEqual([])
  })

  /**
   * The offset is resolved PER ENTRY, not once for the batch. Two Calls
   * committed on the same day at stations 25 hours apart become resolvable
   * at genuinely different instants, and a single shared offset would
   * resolve one of them a full day early — against forecast-filled archive
   * data, which is precisely what §9.2a forbids.
   */
  it('applies each Call’s own station offset, not one shared offset', () => {
    const now = new Date('2026-07-28T23:00:00Z')
    const farEast = committed('2026-07-27', { stationLabel: 'Kiritimati, Kiribati' })
    const farWest = committed('2026-07-27', { stationLabel: 'Pago Pago, American Samoa' })
    // Same date, same instant — only the station differs.
    const resolvable = pendingResolvable([farEast, farWest], now, (entry) =>
      entry.stationLabel.startsWith('Kiritimati') ? 14 * 3600 : -11 * 3600,
    )
    expect(resolvable.map((e) => e.stationLabel)).toEqual(['Kiritimati, Kiribati'])
  })

  it('returns several resolvable Calls at once, oldest first', () => {
    const now = new Date('2026-08-05T12:00:00Z')
    const result = pendingResolvable([committed('2026-07-29'), committed('2026-07-27')], now, () => 0)
    expect(result.map((e) => e.date)).toEqual(['2026-07-27', '2026-07-29'])
  })
})

describe('resolvePending', () => {
  const now = new Date('2026-07-29T12:00:00Z')

  it('writes the skill score back onto the entry', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([committed('2026-07-27')]),
    })
    await resolvePending(storage, now, async () => ({ kind: 'occurred', occurred: true }))

    const stored = JSON.parse((await storage.getItem('ensemble.history.calls'))!)
    expect(stored[0].skill).toBeGreaterThan(0) // 0.8 on a true outcome beats 0.5
  })

  /**
   * Null truth is a normal outcome — an archive gap, or a request that
   * failed. The Call must stay pending and be retried later rather than
   * being marked scored with an invented number.
   */
  it('leaves a Call pending when truth is unavailable', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([committed('2026-07-27')]),
    })
    await resolvePending(storage, now, async () => null)

    const stored = JSON.parse((await storage.getItem('ensemble.history.calls'))!)
    expect(stored[0].skill).toBeUndefined()
  })

  it('leaves a Call pending when fetching truth throws', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([committed('2026-07-27')]),
    })
    await resolvePending(storage, now, async () => {
      throw new Error('offline')
    })

    const stored = JSON.parse((await storage.getItem('ensemble.history.calls'))!)
    expect(stored[0].skill).toBeUndefined()
  })

  it('does not touch the committed forecast while scoring it', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([committed('2026-07-27')]),
    })
    await resolvePending(storage, now, async () => ({ kind: 'occurred', occurred: true }))

    const stored = JSON.parse((await storage.getItem('ensemble.history.calls'))!)
    expect(stored[0].forecast).toEqual({ kind: 'probability', probability: 0.8 })
  })

  it('spends no request when nothing is resolvable', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([committed('2026-07-28')]),
    })
    const fetchTruth = vi.fn(async () => ({ kind: 'occurred', occurred: true }) as const)
    await resolvePending(storage, new Date('2026-07-29T00:00:00Z'), fetchTruth)
    expect(fetchTruth).not.toHaveBeenCalled()
  })

  it('is a no-op on an empty history', async () => {
    const storage = createFakeStorage()
    await expect(resolvePending(storage, now, async () => null)).resolves.toBeUndefined()
  })
})
