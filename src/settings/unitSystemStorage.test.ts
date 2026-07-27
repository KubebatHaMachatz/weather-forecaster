import { describe, expect, it } from 'vitest'
import { loadUnitSystem, saveUnitSystem, type KeyValueStorage } from './unitSystemStorage.js'

/**
 * In-memory fake, not a mock of AsyncStorage's API surface: this module only
 * ever needs get/set, injected rather than imported ambiently, so tests never
 * touch the real native module (matching this project's "time is injected,
 * never ambient" testing discipline, applied here to storage).
 */
function createFakeStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const store = new Map(Object.entries(seed))
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value)
    },
  }
}

describe('loadUnitSystem', () => {
  it('defaults to "device" when nothing has been saved', async () => {
    const storage = createFakeStorage()
    expect(await loadUnitSystem(storage)).toBe('device')
  })

  it('returns a previously saved value', async () => {
    const storage = createFakeStorage({ 'ensemble.settings.unitSystem': 'imperial' })
    expect(await loadUnitSystem(storage)).toBe('imperial')
  })

  it('falls back to the default when the stored value is corrupt or stale', async () => {
    const storage = createFakeStorage({ 'ensemble.settings.unitSystem': 'furlongs' })
    expect(await loadUnitSystem(storage)).toBe('device')
  })
})

describe('saveUnitSystem', () => {
  it('round-trips through loadUnitSystem', async () => {
    const storage = createFakeStorage()
    await saveUnitSystem(storage, 'metric')
    expect(await loadUnitSystem(storage)).toBe('metric')
  })

  it('overwrites a previous value rather than merging', async () => {
    const storage = createFakeStorage({ 'ensemble.settings.unitSystem': 'imperial' })
    await saveUnitSystem(storage, 'metric')
    expect(await loadUnitSystem(storage)).toBe('metric')
  })
})
