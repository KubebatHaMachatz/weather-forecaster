/**
 * A forecast station, and the single place its name is turned into display
 * text.
 *
 * DESIGN §2.2 is a hard rule: a station is NEVER shown without its country.
 * The country is not decoration — it tells the player the hemisphere, the
 * season and roughly the climate, all of which are forecasting information.
 * Render through formatStation(); never reach for `station.name` directly.
 */
export interface Station {
  readonly name: string
  /** Required, never empty. The rule above depends on it. */
  readonly country: string
  /** Sub-national qualifier, for names that are ambiguous across countries. */
  readonly admin1?: string
  readonly lat: number
  readonly lon: number
  /** IANA zone name, for display only. */
  readonly timezone: string
  /** From Open-Meteo's `utc_offset_seconds`; drives resolution timing (§9.2a). */
  readonly utcOffsetSeconds: number
  /** One line orienting the player, e.g. "Pacific coast, 120 km west of Santiago". */
  readonly descriptor: string
}

export function formatStation(station: Station): string {
  const name = station.name.trim()
  const country = station.country.trim()
  const admin1 = station.admin1?.trim() ?? ''

  if (name.length === 0) {
    throw new RangeError('station name must not be empty')
  }
  if (country.length === 0) {
    throw new RangeError(`station "${name}" has no country, which DESIGN §2.2 forbids displaying`)
  }

  return admin1.length > 0 ? `${name}, ${admin1}, ${country}` : `${name}, ${country}`
}
