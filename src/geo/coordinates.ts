/** Shared coordinate primitives for the geo layer. Pure, no dependencies. */

export interface LatLon {
  readonly lat: number
  readonly lon: number
}

export const EARTH_RADIUS_KM = 6371.0088 // IUGG mean radius

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI

export function assertLatLon(point: LatLon, label = 'point'): void {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new TypeError(`${label} must have finite coordinates, received ${JSON.stringify(point)}`)
  }
  if (point.lat < -90 || point.lat > 90) {
    throw new RangeError(`${label} latitude must be within [-90, 90], received ${point.lat}`)
  }
  // Deliberately no longitude range check here: longitude is cyclic in the
  // geometric domain this function serves (orthographic() and bearing()'s
  // callers legitimately pass values outside [-180, 180] meaning "wrap
  // around the sphere" — see projection.test.ts's "unaffected by longitude
  // wrapping"). A strict range check belongs at the network boundary, where
  // Open-Meteo's query string is not cyclic — see assertQueryableLatLon.
}

/**
 * Stricter than assertLatLon: also rejects a longitude outside [-180, 180].
 * For the network boundary only (forecast.ts, archive.ts) — an out-of-range
 * longitude sent to Open-Meteo's query string isn't "wrap around the globe,"
 * it's a bug, and should fail fast locally rather than reach the network.
 */
export function assertQueryableLatLon(point: LatLon, label = 'point'): void {
  assertLatLon(point, label)
  if (point.lon < -180 || point.lon > 180) {
    throw new RangeError(`${label} longitude must be within [-180, 180], received ${point.lon}`)
  }
}

/** Wrap a longitude into (-180, 180]. */
export function normaliseLongitude(lon: number): number {
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180
  // The modulo above maps exactly 180 to -180; keep the positive convention.
  return wrapped === -180 ? 180 : wrapped
}
