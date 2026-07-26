import { describe, expect, it } from 'vitest'
import { assertLatLon, assertQueryableLatLon, normaliseLongitude } from './coordinates.js'

describe('assertLatLon', () => {
  it('accepts a valid coordinate', () => {
    expect(() => assertLatLon({ lat: -33.05, lon: -71.62 })).not.toThrow()
  })

  it('accepts the poles and the antimeridian boundaries', () => {
    expect(() => assertLatLon({ lat: 90, lon: 180 })).not.toThrow()
    expect(() => assertLatLon({ lat: -90, lon: -180 })).not.toThrow()
  })

  it('rejects a latitude outside [-90, 90]', () => {
    expect(() => assertLatLon({ lat: 91, lon: 0 })).toThrow(/latitude/i)
    expect(() => assertLatLon({ lat: -91, lon: 0 })).toThrow(/latitude/i)
  })

  /**
   * Deliberately permissive: longitude is cyclic in this module's geometric
   * domain (orthographic()/bearing() callers legitimately pass values
   * outside [-180, 180] meaning "wrap around the sphere" — see
   * projection.test.ts's "unaffected by longitude wrapping"). Strict range
   * checking belongs at the network boundary — see assertQueryableLatLon.
   */
  it('accepts a longitude outside [-180, 180], unlike latitude', () => {
    expect(() => assertLatLon({ lat: 0, lon: 500 })).not.toThrow()
    expect(() => assertLatLon({ lat: 0, lon: -500 })).not.toThrow()
  })

  it('rejects non-finite coordinates', () => {
    expect(() => assertLatLon({ lat: Number.NaN, lon: 0 })).toThrow()
    expect(() => assertLatLon({ lat: 0, lon: Number.POSITIVE_INFINITY })).toThrow()
  })

  it('includes the given label in the error message', () => {
    expect(() => assertLatLon({ lat: 999, lon: 0 }, 'station')).toThrow(/station/)
  })
})

describe('assertQueryableLatLon', () => {
  it('accepts a valid coordinate', () => {
    expect(() => assertQueryableLatLon({ lat: -33.05, lon: -71.62 })).not.toThrow()
  })

  it('accepts the poles and the antimeridian boundaries', () => {
    expect(() => assertQueryableLatLon({ lat: 90, lon: 180 })).not.toThrow()
    expect(() => assertQueryableLatLon({ lat: -90, lon: -180 })).not.toThrow()
  })

  it('rejects a latitude outside [-90, 90], same as assertLatLon', () => {
    expect(() => assertQueryableLatLon({ lat: 91, lon: 0 })).toThrow(/latitude/i)
  })

  /**
   * Regression test for a review finding: forecast.ts/archive.ts relied on
   * assertLatLon as their sole coordinate guard, which never range-checked
   * longitude, so an out-of-range value reached Open-Meteo's query string
   * unmodified instead of failing fast locally the way latitude already did.
   */
  it('rejects a longitude outside [-180, 180], unlike plain assertLatLon', () => {
    expect(() => assertQueryableLatLon({ lat: 0, lon: 181 })).toThrow(/longitude/i)
    expect(() => assertQueryableLatLon({ lat: 0, lon: -181 })).toThrow(/longitude/i)
    expect(() => assertQueryableLatLon({ lat: 0, lon: 500 })).toThrow(/longitude/i)
  })

  it('rejects non-finite coordinates', () => {
    expect(() => assertQueryableLatLon({ lat: Number.NaN, lon: 0 })).toThrow()
  })
})

describe('normaliseLongitude', () => {
  it('leaves an in-range longitude unchanged', () => {
    expect(normaliseLongitude(-71.62)).toBeCloseTo(-71.62, 9)
  })

  it('wraps a longitude past 180 back into range', () => {
    expect(normaliseLongitude(190)).toBeCloseTo(-170, 9)
  })

  it('wraps a longitude past -180 back into range', () => {
    expect(normaliseLongitude(-190)).toBeCloseTo(170, 9)
  })

  it('maps exactly -180 to 180', () => {
    expect(normaliseLongitude(-180)).toBe(180)
  })

  it('leaves exactly 180 unchanged', () => {
    expect(normaliseLongitude(180)).toBe(180)
  })
})
