import { describe, expect, it } from 'vitest'
import { orthographic } from './projection.js'

/**
 * The Chart (DESIGN §5) draws Earth as a sphere rather than a flat rectangle,
 * so every point needs projecting to a unit disc — and, crucially, the half of
 * the world facing away from the viewer must be culled rather than folded onto
 * the visible face.
 */

const CENTER = { lat: 0, lon: 0 }

describe('orthographic', () => {
  it('places the centre of projection at the origin', () => {
    const p = orthographic({ lat: 0, lon: 0 }, CENTER)
    expect(p.x).toBeCloseTo(0, 12)
    expect(p.y).toBeCloseTo(0, 12)
    expect(p.visible).toBe(true)
  })

  it('places the north pole at the top when centred on the equator', () => {
    const p = orthographic({ lat: 90, lon: 0 }, CENTER)
    expect(p.x).toBeCloseTo(0, 12)
    expect(p.y).toBeCloseTo(1, 12)
    expect(p.visible).toBe(true)
  })

  it('places the south pole at the bottom', () => {
    const p = orthographic({ lat: -90, lon: 0 }, CENTER)
    expect(p.y).toBeCloseTo(-1, 12)
  })

  it('places east to the right and west to the left', () => {
    expect(orthographic({ lat: 0, lon: 45 }, CENTER).x).toBeGreaterThan(0)
    expect(orthographic({ lat: 0, lon: -45 }, CENTER).x).toBeLessThan(0)
  })

  it('hides the far side of the globe', () => {
    // The antipode of the centre is directly behind the sphere.
    expect(orthographic({ lat: 0, lon: 180 }, CENTER).visible).toBe(false)
    expect(orthographic({ lat: 0, lon: 120 }, CENTER).visible).toBe(false)
    expect(orthographic({ lat: 0, lon: -120 }, CENTER).visible).toBe(false)
  })

  it('treats the exact limb as visible', () => {
    const p = orthographic({ lat: 0, lon: 90 }, CENTER)
    expect(p.visible).toBe(true)
    expect(p.x).toBeCloseTo(1, 12)
    expect(p.y).toBeCloseTo(0, 12)
  })

  it('keeps every point inside the unit disc, visible or not', () => {
    for (let lat = -90; lat <= 90; lat += 15) {
      for (let lon = -180; lon <= 180; lon += 15) {
        const p = orthographic({ lat, lon }, CENTER)
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  })

  it('follows the centre when the globe rotates', () => {
    const station = { lat: -33.05, lon: -71.62 }
    // Centring on the station itself must put it at the origin, whatever it is.
    const p = orthographic(station, station)
    expect(p.x).toBeCloseTo(0, 12)
    expect(p.y).toBeCloseTo(0, 12)
    expect(p.visible).toBe(true)
  })

  it('is unaffected by longitude wrapping', () => {
    const a = orthographic({ lat: 10, lon: 190 }, CENTER)
    const b = orthographic({ lat: 10, lon: -170 }, CENTER)
    expect(a.x).toBeCloseTo(b.x, 12)
    expect(a.y).toBeCloseTo(b.y, 12)
    expect(a.visible).toBe(b.visible)
  })

  it('rejects an out-of-range latitude', () => {
    expect(() => orthographic({ lat: 91, lon: 0 }, CENTER)).toThrow(/latitude/i)
    expect(() => orthographic({ lat: 0, lon: 0 }, { lat: -91, lon: 0 })).toThrow(/latitude/i)
  })

  it('rejects non-finite coordinates', () => {
    expect(() => orthographic({ lat: Number.NaN, lon: 0 }, CENTER)).toThrow()
  })
})
