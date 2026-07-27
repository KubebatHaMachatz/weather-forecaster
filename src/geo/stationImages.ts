/**
 * Lookup for the bundled banner photos (assets/station-images.json and
 * assets/photos/, produced by scripts/download-station-photos.mjs).
 *
 * The image BYTES are bundled, not just a URL: Wikimedia Commons' reuse
 * guidance says directly embedding their URLs ("hotlinking") "is not
 * recommended", and bundling also makes banners work offline.
 *
 * Every entry is creditable by construction — the pipeline drops any image
 * whose licence it can't read, and any CC BY/BY-SA image whose author
 * Commons doesn't record, since those licences require naming the author.
 */

export interface StationImage {
  /** File name within assets/photos/, resolved via STATION_PHOTO_ASSETS. */
  readonly file: string
  /** The Wikipedia article the photo was taken from — part of the credit. */
  readonly sourcePage: string
  /** e.g. "CC BY-SA 3.0". Always present — an image without one is never bundled. */
  readonly licence: string
  /** Present for every licence that requires attribution; absent only for CC0/public domain. */
  readonly artist?: string
  /** Link to the licence text, which CC attribution requires. */
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
    typeof candidate.file === 'string' &&
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
