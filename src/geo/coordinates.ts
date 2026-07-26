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
}

/** Wrap a longitude into (-180, 180]. */
export function normaliseLongitude(lon: number): number {
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180
  // The modulo above maps exactly 180 to -180; keep the positive convention.
  return wrapped === -180 ? 180 : wrapped
}
