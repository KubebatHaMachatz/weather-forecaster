import { DEFAULT_UNIT_SYSTEM, isUnitSystem, type UnitSystem } from './unitSystem.js'

/**
 * Just the two methods this module needs, not AsyncStorage's whole API —
 * injected rather than imported ambiently so this stays testable without a
 * native module, and swappable if the storage backend ever changes.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

const STORAGE_KEY = 'ensemble.settings.unitSystem'

export async function loadUnitSystem(storage: KeyValueStorage): Promise<UnitSystem> {
  const stored = await storage.getItem(STORAGE_KEY)
  return isUnitSystem(stored) ? stored : DEFAULT_UNIT_SYSTEM
}

export async function saveUnitSystem(storage: KeyValueStorage, unitSystem: UnitSystem): Promise<void> {
  await storage.setItem(STORAGE_KEY, unitSystem)
}
