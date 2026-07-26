/**
 * Loosely Köppen-inspired, but organised around what makes a station
 * interesting to forecast (DESIGN §9.5: "a climate-regime tag used to bias
 * question selection toward interesting weather") rather than strict
 * climatology — e.g. 'arid' groups stations by "huge diurnal swings, almost
 * no precipitation signal" regardless of whether they're hot or cold deserts.
 */
export const CLIMATE_REGIMES = [
  'polar',
  'subarctic',
  'temperate-maritime',
  'temperate-continental',
  'mediterranean',
  'arid',
  'semi-arid',
  'tropical-monsoon',
  'tropical-rainforest',
  'tropical-savanna',
  'humid-subtropical',
  'highland',
  'oceanic-island',
] as const

export type ClimateRegime = (typeof CLIMATE_REGIMES)[number]

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
  /**
   * Optional here, not on the content schema: the real bundled station list
   * (assets/stations.json, validated separately) always sets this; making it
   * required on this interface would force every existing test fixture to
   * set an irrelevant field. Not yet consumed by puzzle generation — DESIGN
   * §9.5's "bias toward interesting weather" is deferred, this only carries
   * the data forward.
   */
  readonly climateRegime?: ClimateRegime
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
