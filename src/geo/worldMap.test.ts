import { describe, expect, it } from 'vitest'
import { landRingsFromGeoJson, type MultiPolygonFeature } from './worldMap.js'

const SQUARE: MultiPolygonFeature = {
  type: 'Feature',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ],
  },
}

const TWO_POLYGONS: MultiPolygonFeature = {
  type: 'Feature',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 5],
        ],
      ],
    ],
  },
}

describe('landRingsFromGeoJson', () => {
  it('converts GeoJSON [lon, lat] pairs to {lat, lon} points', () => {
    const [ring] = landRingsFromGeoJson(SQUARE)
    // GeoJSON order is [lon, lat]; the ring's second point is [10, 0] —
    // lon=10, lat=0 — so it must NOT come out as {lat: 10, lon: 0}.
    expect(ring?.[1]).toEqual({ lat: 0, lon: 10 })
  })

  it('preserves point order and ring closure', () => {
    const [ring] = landRingsFromGeoJson(SQUARE)
    expect(ring).toEqual([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 10, lon: 10 },
      { lat: 10, lon: 0 },
      { lat: 0, lon: 0 },
    ])
  })

  it('flattens rings across multiple polygons into one array', () => {
    const rings = landRingsFromGeoJson(TWO_POLYGONS)
    expect(rings).toHaveLength(2)
  })

  it('returns an empty array for a feature with no polygons', () => {
    const empty: MultiPolygonFeature = {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [] },
    }
    expect(landRingsFromGeoJson(empty)).toEqual([])
  })
})
