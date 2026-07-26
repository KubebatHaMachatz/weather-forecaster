import { describe, expect, it } from 'vitest'
import { formatStation } from './station.js'
import type { Station } from './station.js'

/**
 * DESIGN §2.2 makes this a hard rule: a station is NEVER displayed without its
 * country. This module is the single enforcement point — the raw `name` field
 * must never be rendered directly anywhere in the app.
 */

const VALPARAISO: Station = {
  name: 'Valparaíso',
  country: 'Chile',
  lat: -33.05,
  lon: -71.62,
  timezone: 'America/Santiago',
  utcOffsetSeconds: -4 * 3600,
  descriptor: 'Pacific coast, 120 km west of Santiago',
}

describe('formatStation', () => {
  it('always includes the country', () => {
    expect(formatStation(VALPARAISO)).toBe('Valparaíso, Chile')
  })

  it('adds a sub-national qualifier when one is given', () => {
    // "Córdoba" alone is ambiguous between Argentina and Spain.
    const cordoba: Station = {
      ...VALPARAISO,
      name: 'Córdoba',
      admin1: 'Andalusia',
      country: 'Spain',
    }
    expect(formatStation(cordoba)).toBe('Córdoba, Andalusia, Spain')
  })

  it('trims incidental whitespace', () => {
    expect(formatStation({ ...VALPARAISO, name: '  Valparaíso  ' })).toBe('Valparaíso, Chile')
  })

  it('refuses to render a station with no country', () => {
    expect(() => formatStation({ ...VALPARAISO, country: '' })).toThrow(/country/i)
    expect(() => formatStation({ ...VALPARAISO, country: '   ' })).toThrow(/country/i)
  })

  it('refuses to render a station with no name', () => {
    expect(() => formatStation({ ...VALPARAISO, name: '' })).toThrow(/name/i)
  })

  it('ignores an empty sub-national qualifier rather than emitting a stray comma', () => {
    expect(formatStation({ ...VALPARAISO, admin1: '  ' })).toBe('Valparaíso, Chile')
  })
})
