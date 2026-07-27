/**
 * Lookup for the bundled banner photos (assets/station-images.json,
 * produced by scripts/build-station-images.mjs).
 *
 * Only the URL is bundled, not the image bytes — the photo itself loads
 * from Wikimedia at display time. Every entry carries the licence facts CC
 * attribution requires, and the build script drops any image whose licence
 * it couldn't read, so an entry that exists is always creditable.
 */

export interface StationImage {
  /** Wikimedia thumbnail URL, pre-sized for a full-width banner. */
  readonly url: string
  /** The Wikipedia article the photo was taken from. */
  readonly sourcePage: string
  /** e.g. "CC BY-SA 3.0". Always present — an image without one is never bundled. */
  readonly licence: string
  /** Absent for a few files whose Commons metadata names no author. */
  readonly artist?: string
  readonly licenceUrl?: string
}

/** Just the fields the key needs, so callers can pass a full Station or a literal. */
interface StationIdentity {
  readonly name: string
  readonly country: string
}

/**
 * Keyed on (name, country) — the same identity validateStationList
 * guarantees unique and daily.ts hashes on, so this can never collide two
 * real stations.
 */
export function stationImageKey(station: StationIdentity): string {
  return `${station.name}|${station.country}`
}

function isStationImage(value: unknown): value is StationImage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StationImage>
  return (
    typeof candidate.url === 'string' &&
    typeof candidate.sourcePage === 'string' &&
    typeof candidate.licence === 'string'
  )
}

/**
 * The station's banner photo, or null when it has none — not every station
 * has a verified, licensed image, and callers must render a fallback rather
 * than a broken image.
 *
 * Uses a own-property check rather than a bare index: a station named
 * "constructor" or "toString" would otherwise pick up an inherited
 * prototype member instead of missing cleanly.
 */
export function stationImageFor(
  manifest: Record<string, StationImage>,
  station: StationIdentity,
): StationImage | null {
  const key = stationImageKey(station)
  if (!Object.prototype.hasOwnProperty.call(manifest, key)) return null
  const entry = manifest[key]
  return isStationImage(entry) ? entry : null
}
