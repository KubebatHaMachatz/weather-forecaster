import {
  assertLatLon,
  EARTH_RADIUS_KM,
  normaliseLongitude,
  toDegrees,
  toRadians,
  type LatLon,
} from './coordinates.js'

/**
 * Great-circle geometry on a spherical Earth. Used by the Neighbour instrument
 * (DESIGN §4) to find a station ~200 km upwind, and by the Chart to draw the
 * bearing between two stations.
 *
 * A sphere is accurate to ~0.5% against the WGS84 ellipsoid, which is far
 * finer than anything the game does with these numbers.
 */

/** Haversine — chosen over the spherical law of cosines because it stays accurate at short distances. */
export function greatCircleDistanceKm(from: LatLon, to: LatLon): number {
  assertLatLon(from, 'from')
  assertLatLon(to, 'to')

  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)
  const deltaLat = toLat - fromLat
  const deltaLon = toRadians(to.lon - from.lon)

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing along the great circle, in degrees clockwise from true north, within [0, 360). */
export function initialBearingDeg(from: LatLon, to: LatLon): number {
  assertLatLon(from, 'from')
  assertLatLon(to, 'to')

  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)
  const deltaLon = toRadians(to.lon - from.lon)

  const y = Math.sin(deltaLon) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

/** The point reached by travelling `distanceKm` from `from` along `bearingDeg`. */
export function destinationPoint(from: LatLon, bearingDeg: number, distanceKm: number): LatLon {
  assertLatLon(from, 'from')
  if (!Number.isFinite(bearingDeg)) {
    throw new TypeError(`bearing must be finite, received ${bearingDeg}`)
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError(`distance must be finite and non-negative, received ${distanceKm}`)
  }

  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const bearing = toRadians(bearingDeg)
  const fromLat = toRadians(from.lat)
  const fromLon = toRadians(from.lon)

  const sinLat =
    Math.sin(fromLat) * Math.cos(angularDistance) +
    Math.cos(fromLat) * Math.sin(angularDistance) * Math.cos(bearing)
  const lat = Math.asin(Math.min(1, Math.max(-1, sinLat)))

  const lon =
    fromLon +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(fromLat),
      Math.cos(angularDistance) - Math.sin(fromLat) * sinLat,
    )

  return { lat: toDegrees(lat), lon: normaliseLongitude(toDegrees(lon)) }
}
