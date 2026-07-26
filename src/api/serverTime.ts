/**
 * The trusted clock (DESIGN §10 "Fairness without a server"): the HTTP Date
 * header on any Open-Meteo response, never the device clock, since a device
 * clock can be set to anything by the player. Verified live in the spike —
 * SPIKE.md §1 found 1 second of skew against the device clock.
 */
export function readServerDate(response: Response): Date | null {
  const header = response.headers.get('date')
  if (header === null) return null

  const parsed = new Date(header)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
