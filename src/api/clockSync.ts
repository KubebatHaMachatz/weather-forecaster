import { fetchForecast } from './forecast.js'
import type { OpenMeteoResult } from './client.js'
import { puzzleDateFrom, type TrustedClock } from './trustedClock.js'

/**
 * Keeps the trusted clock (DESIGN §10) current, without spending requests
 * the call budget can't afford (DESIGN §9.6 calls that budget "a hard
 * architectural constraint, not an optimisation").
 *
 * Skips the request entirely when the stored trusted date still looks
 * current. The device clock is consulted ONLY to decide whether asking is
 * worthwhile — never to produce a date. Even a maliciously-set device clock
 * can therefore do no more than trigger an extra request, which then
 * returns the real date anyway.
 */
export async function syncTrustedClock(
  clock: TrustedClock,
  fetchResult: () => Promise<OpenMeteoResult>,
  deviceNow: Date = new Date(),
): Promise<void> {
  const known = await clock.now()
  if (known !== null && !mayHaveRolledOver(known, deviceNow)) return

  let result: OpenMeteoResult
  try {
    result = await fetchResult()
  } catch {
    // Offline is a normal state here (DESIGN §9.7): keep whatever trusted
    // date we already had, and stay null if we had none. Never substitute
    // the device clock.
    return
  }

  if (result.serverDate !== null) {
    await clock.observe(result.serverDate)
  }
}

/**
 * Whether the trusted date could plausibly be stale. Compares UTC calendar
 * days, matching how puzzleDateFrom derives the date in the first place.
 * An untrustworthy device clock can only make this over-eager, never
 * under-eager in a way that would hide a real rollover.
 */
function mayHaveRolledOver(known: Date, deviceNow: Date): boolean {
  if (Number.isNaN(deviceNow.getTime())) return true
  return puzzleDateFrom(known) !== puzzleDateFrom(deviceNow)
}

/**
 * The cheapest real Open-Meteo request that still returns a Date header.
 * Asks for a single current field at a single coordinate — the response
 * body is discarded; only the header matters.
 *
 * This is a stopgap: once the daily Call flow makes its own forecast call,
 * that response should feed clock.observe() directly and this dedicated
 * request should disappear rather than sit alongside it.
 */
export async function fetchClockReference(): Promise<OpenMeteoResult> {
  return fetchForecast({
    latitude: 0,
    longitude: 0,
    current: ['temperature_2m'],
    forecastDays: 1,
  })
}
