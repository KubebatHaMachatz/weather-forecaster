import { describe, expect, it } from 'vitest'
import { topologyToLandGeoJson } from './build-worldmap.mjs'

/** A minimal synthetic topology: one square "continent", not real data. */
const FIXTURE_TOPOLOGY = {
  type: 'Topology',
  arcs: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ],
  ],
  objects: {
    land: {
      type: 'GeometryCollection',
      geometries: [{ type: 'MultiPolygon', arcs: [[[0]]] }],
    },
  },
  transform: {
    scale: [1, 1],
    translate: [0, 0],
  },
}

describe('topologyToLandGeoJson', () => {
  it('converts a topology into a MultiPolygon GeoJSON feature', () => {
    const geojson = topologyToLandGeoJson(FIXTURE_TOPOLOGY)
    expect(geojson.type).toBe('Feature')
    expect(geojson.geometry.type).toBe('MultiPolygon')
  })

  it('decodes the fixture arc into a closed square ring', () => {
    const geojson = topologyToLandGeoJson(FIXTURE_TOPOLOGY)
    const [[ring]] = geojson.geometry.coordinates
    expect(ring).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ])
  })

  it('rounds coordinates to the given precision', () => {
    const highPrecision = {
      ...FIXTURE_TOPOLOGY,
      arcs: [
        [
          [0, 0],
          [10.123456, 0],
          [0, 10],
          [-10, 0],
          [0, -10],
        ],
      ],
    }
    const geojson = topologyToLandGeoJson(highPrecision, 2)
    const [[ring]] = geojson.geometry.coordinates
    expect(ring[1]).toEqual([10.12, 0])
  })
})
