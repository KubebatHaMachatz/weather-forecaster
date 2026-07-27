/**
 * DESIGN §13.1: device locale default, with a manual override in settings.
 * Scoring is always computed in metric internally — unit system is a
 * display concern only, never fed back into any scoring/puzzle logic.
 */
export const UNIT_SYSTEMS = ['device', 'metric', 'imperial'] as const

export type UnitSystem = (typeof UNIT_SYSTEMS)[number]

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'device'

export function isUnitSystem(value: unknown): value is UnitSystem {
  return typeof value === 'string' && (UNIT_SYSTEMS as readonly string[]).includes(value)
}
