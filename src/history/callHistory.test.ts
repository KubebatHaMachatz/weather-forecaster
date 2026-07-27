import { describe, expect, it } from 'vitest'
import { loadCallHistory, recordCall, type CallHistoryEntry } from './callHistory.js'
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

const ENTRY: CallHistoryEntry = {
  date: '2026-07-27',
  stationLabel: 'Bujumbura, Burundi',
  questionType: 'point-temperature',
}

describe('loadCallHistory', () => {
  it('is empty when nothing has been recorded', async () => {
    expect(await loadCallHistory(createFakeStorage())).toEqual([])
  })

  it('returns previously recorded entries', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, ENTRY)
    expect(await loadCallHistory(storage)).toEqual([ENTRY])
  })

  /**
   * Persisted data outlives the code that wrote it. Corrupt or
   * partially-written JSON must degrade to "no history" rather than
   * crashing the screen that reads it.
   */
  it('degrades to empty on malformed JSON rather than throwing', async () => {
    const storage = createFakeStorage({ 'ensemble.history.calls': '{not json' })
    expect(await loadCallHistory(storage)).toEqual([])
  })

  it('degrades to empty when the stored value is not an array', async () => {
    const storage = createFakeStorage({ 'ensemble.history.calls': '{"date":"2026-07-27"}' })
    expect(await loadCallHistory(storage)).toEqual([])
  })

  it('drops individual malformed entries but keeps the valid ones', async () => {
    const storage = createFakeStorage({
      'ensemble.history.calls': JSON.stringify([ENTRY, { date: 42 }, null, { ...ENTRY, date: '2026-07-26' }]),
    })
    const loaded = await loadCallHistory(storage)
    expect(loaded.map((e) => e.date)).toEqual(['2026-07-27', '2026-07-26'])
  })
})

describe('recordCall', () => {
  it('appends without losing earlier entries', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, { ...ENTRY, date: '2026-07-26' })
    await recordCall(storage, ENTRY)
    expect((await loadCallHistory(storage)).map((e) => e.date)).toEqual(['2026-07-26', '2026-07-27'])
  })

  /**
   * DESIGN §10: "the answer ... cannot be edited". One Call per day is the
   * whole premise, so re-recording the same date must not create a second
   * entry (which would also double-count the streak).
   */
  it('is idempotent for a date already recorded', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, ENTRY)
    await recordCall(storage, { ...ENTRY, stationLabel: 'Somewhere Else, Nowhere' })
    const loaded = await loadCallHistory(storage)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.stationLabel).toBe('Bujumbura, Burundi')
  })

  it('round-trips an entry that carries a resolved skill score', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, { ...ENTRY, skill: 0.42 })
    expect((await loadCallHistory(storage))[0]!.skill).toBeCloseTo(0.42, 10)
  })
})
