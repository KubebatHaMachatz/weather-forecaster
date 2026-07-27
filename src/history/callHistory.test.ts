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

  it('round-trips a stated distribution and its commit timestamp', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, {
      ...ENTRY,
      forecast: { kind: 'distribution', mean: 12.5, sd: 2 },
      committedAt: 1_785_000_000_000,
    })
    const loaded = (await loadCallHistory(storage))[0]!
    expect(loaded.forecast).toEqual({ kind: 'distribution', mean: 12.5, sd: 2 })
    expect(loaded.committedAt).toBe(1_785_000_000_000)
  })

  it('round-trips a stated probability', async () => {
    const storage = createFakeStorage()
    await recordCall(storage, {
      ...ENTRY,
      questionType: 'precipitation',
      forecast: { kind: 'probability', probability: 0.35 },
    })
    expect((await loadCallHistory(storage))[0]!.forecast).toEqual({
      kind: 'probability',
      probability: 0.35,
    })
  })
})

/**
 * These are the shapes that make scoring produce nonsense rather than
 * throw — a zero-width distribution, or a probability outside [0, 1]. They
 * must be rejected at the storage boundary, since by the time crpsGaussian
 * or a Brier score sees them there's nothing left to catch the error.
 */
describe('forecast validation on load', () => {
  const withForecast = (forecast: unknown) =>
    createFakeStorage({
      'ensemble.history.calls': JSON.stringify([{ ...ENTRY, forecast }]),
    })

  it('drops an entry whose distribution has a zero or negative width', async () => {
    expect(await loadCallHistory(withForecast({ kind: 'distribution', mean: 1, sd: 0 }))).toEqual([])
    expect(await loadCallHistory(withForecast({ kind: 'distribution', mean: 1, sd: -2 }))).toEqual([])
  })

  it('drops an entry whose distribution is not numeric', async () => {
    expect(await loadCallHistory(withForecast({ kind: 'distribution', mean: '12', sd: 2 }))).toEqual([])
    expect(await loadCallHistory(withForecast({ kind: 'distribution', mean: Number.NaN, sd: 2 }))).toEqual([])
  })

  it('drops an entry whose probability falls outside [0, 1]', async () => {
    expect(await loadCallHistory(withForecast({ kind: 'probability', probability: 1.5 }))).toEqual([])
    expect(await loadCallHistory(withForecast({ kind: 'probability', probability: -0.1 }))).toEqual([])
  })

  it('drops an entry whose forecast kind is unrecognised', async () => {
    expect(await loadCallHistory(withForecast({ kind: 'vibes', value: 7 }))).toEqual([])
  })

  it('keeps the certainty endpoints, which are legitimate answers', async () => {
    expect(await loadCallHistory(withForecast({ kind: 'probability', probability: 0 }))).toHaveLength(1)
    expect(await loadCallHistory(withForecast({ kind: 'probability', probability: 1 }))).toHaveLength(1)
  })
})
