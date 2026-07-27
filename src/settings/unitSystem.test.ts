import { describe, expect, it } from 'vitest'
import { DEFAULT_UNIT_SYSTEM, isUnitSystem, UNIT_SYSTEMS } from './unitSystem.js'

describe('UNIT_SYSTEMS', () => {
  it('contains device, metric, and imperial', () => {
    expect(UNIT_SYSTEMS).toEqual(['device', 'metric', 'imperial'])
  })
})

describe('DEFAULT_UNIT_SYSTEM', () => {
  it('is "device" (DESIGN §13.1: device locale default)', () => {
    expect(DEFAULT_UNIT_SYSTEM).toBe('device')
  })

  it('is itself a valid unit system', () => {
    expect(isUnitSystem(DEFAULT_UNIT_SYSTEM)).toBe(true)
  })
})

describe('isUnitSystem', () => {
  it.each(UNIT_SYSTEMS)('accepts "%s"', (value) => {
    expect(isUnitSystem(value)).toBe(true)
  })

  it('rejects an unrecognised string', () => {
    expect(isUnitSystem('metric ')).toBe(false)
    expect(isUnitSystem('Metric')).toBe(false)
    expect(isUnitSystem('celsius')).toBe(false)
  })

  it('rejects non-string values without throwing', () => {
    expect(isUnitSystem(null)).toBe(false)
    expect(isUnitSystem(undefined)).toBe(false)
    expect(isUnitSystem(42)).toBe(false)
    expect(isUnitSystem({})).toBe(false)
  })
})
