import { assertLatLon, toRadians, type LatLon } from './coordinates.js'

/**
 * Orthographic projection — the view of Earth as a sphere seen from infinitely
 * far away, which is what the Chart (DESIGN §5) draws.
 *
 * Output is in unit-sphere coordinates: x right, y up, both within [-1, 1] and
 * always inside the unit disc. Scaling to pixels is the renderer's job.
 */

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
  /**
   * False when the point lies on the far hemisphere. Callers MUST cull on this
   * — an orthographic projection maps the back of the globe onto the same disc
   * as the front, so skipping the test silently folds the far side over the
   * near one.
   */
  readonly visible: boolean
}

export function orthographic(point: LatLon, center: LatLon): ProjectedPoint {
  assertLatLon(point, 'point')
  assertLatLon(center, 'center')

  const lat = toRadians(point.lat)
  const lon = toRadians(point.lon)
  const centerLat = toRadians(center.lat)
  const centerLon = toRadians(center.lon)

  const deltaLon = lon - centerLon
  const cosLat = Math.cos(lat)
  const sinLat = Math.sin(lat)
  const cosCenterLat = Math.cos(centerLat)
  const sinCenterLat = Math.sin(centerLat)

  // cos of the angular distance from the centre; negative means far side.
  const cosineOfAngularDistance =
    sinCenterLat * sinLat + cosCenterLat * cosLat * Math.cos(deltaLon)

  return {
    x: cosLat * Math.sin(deltaLon),
    y: cosCenterLat * sinLat - sinCenterLat * cosLat * Math.cos(deltaLon),
    visible: cosineOfAngularDistance >= 0,
  }
}
