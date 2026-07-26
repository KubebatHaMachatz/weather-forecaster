import { describe, expect, it } from 'vitest'
import { destinationPoint, greatCircleDistanceKm, initialBearingDeg } from './bearing.js'

/**
 * Needed by the Neighbour instrument (DESIGN §4), which reads the same
 * variable at a station roughly 200 km upwind, and by the Chart, which draws
 * the bearing between the two.
 */

const ORIGIN = { lat: 0, lon: 0 }
const EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * 6371.0088

describe('greatCircleDistanceKm', () => {
  it('is zero for a point and itself', () => {
    expect(greatCircleDistanceKm(ORIGIN, ORIGIN)).toBeCloseTo(0, 9)
  })

  it('measures a quarter of the way round the equator', () => {
    expect(greatCircleDistanceKm(ORIGIN, { lat: 0, lon: 90 })).toBeCloseTo(
      EARTH_CIRCUMFERENCE_KM / 4,
      6,
    )
  })

  it('measures pole to pole as half a circumference', () => {
    expect(greatCircleDistanceKm({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(
      EARTH_CIRCUMFERENCE_KM / 2,
      6,
    )
  })

  it('is symmetric', () => {
    const a = { lat: 51.5074, lon: -0.1278 }
    const b = { lat: 48.8566, lon: 2.3522 }
    expect(greatCircleDistanceKm(a, b)).toBeCloseTo(greatCircleDistanceKm(b, a), 9)
  })

  it('matches the known London–Paris distance', () => {
    const london = { lat: 51.5074, lon: -0.1278 }
    const paris = { lat: 48.8566, lon: 2.3522 }
    expect(greatCircleDistanceKm(london, paris)).toBeGreaterThan(340)
    expect(greatCircleDistanceKm(london, paris)).toBeLessThan(346)
  })

  it('handles the antimeridian without going the long way round', () => {
    const west = { lat: 0, lon: 179 }
    const east = { lat: 0, lon: -179 }
    // Two degrees apart, not 358.
    expect(greatCircleDistanceKm(west, east)).toBeCloseTo((EARTH_CIRCUMFERENCE_KM * 2) / 360, 6)
  })

  it('stays accurate for very short distances', () => {
    // The haversine formula exists precisely so this does not lose precision.
    const a = { lat: 45, lon: 10 }
    const b = { lat: 45.001, lon: 10 }
    expect(greatCircleDistanceKm(a, b)).toBeGreaterThan(0.1)
    expect(greatCircleDistanceKm(a, b)).toBeLessThan(0.12)
  })
})

describe('initialBearingDeg', () => {
  it.each([
    ['north', { lat: 10, lon: 0 }, 0],
    ['east', { lat: 0, lon: 10 }, 90],
    ['south', { lat: -10, lon: 0 }, 180],
    ['west', { lat: 0, lon: -10 }, 270],
  ])('reads %s correctly', (_label, target, expected) => {
    expect(initialBearingDeg(ORIGIN, target)).toBeCloseTo(expected, 6)
  })

  it('always returns a value in [0, 360)', () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lon = -180; lon < 180; lon += 20) {
        const b = initialBearingDeg(ORIGIN, { lat: lat || 1, lon: lon || 1 })
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(360)
      }
    }
  })
})

describe('destinationPoint', () => {
  it('lands the requested distance away', () => {
    const start = { lat: 45, lon: 10 }
    const end = destinationPoint(start, 37, 200)
    expect(greatCircleDistanceKm(start, end)).toBeCloseTo(200, 6)
  })

  it('lands on the requested bearing', () => {
    const start = { lat: -33.05, lon: -71.62 }
    const end = destinationPoint(start, 260, 200)
    expect(initialBearingDeg(start, end)).toBeCloseTo(260, 6)
  })

  it('moves due north as expected', () => {
    const end = destinationPoint(ORIGIN, 0, EARTH_CIRCUMFERENCE_KM / 4)
    expect(end.lat).toBeCloseTo(90, 6)
  })

  it('returns the start point for zero distance', () => {
    const start = { lat: 12, lon: 34 }
    const end = destinationPoint(start, 90, 0)
    expect(end.lat).toBeCloseTo(start.lat, 9)
    expect(end.lon).toBeCloseTo(start.lon, 9)
  })

  it('normalises longitude across the antimeridian', () => {
    // Heading west from just east of the line must wrap, not run off to -190.
    const end = destinationPoint({ lat: 0, lon: -179 }, 270, 400)
    expect(end.lon).toBeGreaterThan(0)
    expect(end.lon).toBeLessThanOrEqual(180)
  })

  it('rejects a negative distance', () => {
    expect(() => destinationPoint(ORIGIN, 0, -1)).toThrow(/distance/i)
  })
})
