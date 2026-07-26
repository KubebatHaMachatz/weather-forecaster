/**
 * Combines the live-geocoded station data (build-stations.mjs output) with
 * hand-authored content (station-enrichment.mjs) into the final bundled
 * assets/stations.json (DESIGN §9.5).
 *
 * Run via tsx, not plain node: it imports src/geo/stationData.ts directly
 * (bundler-style '.js' specifiers resolved to their '.ts' files) to
 * self-validate its own output before writing — a review finding was that
 * this script used to write assets/stations.json with no validation at all,
 * so a bad record was only ever caught later by vitest, after it was
 * already committed.
 *
 * Usage: node scripts/build-stations.mjs > /tmp/geocoded-stations.json
 *        npx tsx scripts/assemble-stations.mjs /tmp/geocoded-stations.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ENRICHMENT } from './station-enrichment.mjs'

// Deliberately NOT a static top-level import: this is a cross-boundary
// TS-to-.mjs import (bundler-style '.js' specifier resolved to its '.ts'
// file) that only tsx's runtime resolves correctly. A static import here
// would also break under plain node AND under Vitest's own module graph
// (which resolves this file's imports differently from how tsx resolves
// them at actual runtime) — breaking every test in this file just for
// importing the module, not only the ones that need this function. Dynamic
// + confined to main() means it's only ever evaluated when this script
// actually runs as the entrypoint via tsx.
async function loadValidateStationList() {
  const mod = await import('../src/geo/stationData.js')
  return mod.validateStationList
}

/**
 * A live UTC offset for the station's IANA timezone, computed at build
 * time — NOT a permanent value. Real offsets shift with DST for roughly
 * 70% of this list's stations, so this is a best-effort seed only, good
 * enough for e.g. an initial Chart render before any live call has
 * happened. There is currently no code anywhere in src/ that overwrites
 * this with a live forecast/archive call's utc_offset_seconds when a
 * station is actually used in a Call — that wiring doesn't exist yet architecturally
 * (no orchestration layer exists in src/ at all yet), so this value WILL be
 * wrong for roughly half the year for most of these stations until that
 * wiring is built. Tracked as a known gap, not silently assumed solved.
 */
export function utcOffsetSeconds(timeZone, at = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
  const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
  const match = part ? /GMT([+-])(\d{2}):(\d{2})/.exec(part) : null
  if (!match) {
    throw new Error(`could not compute UTC offset for timezone "${timeZone}"`)
  }
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60)
}

/**
 * Two entries where Open-Meteo's own timezone data (geocoding AND, for
 * Alert, its forecast-api timezone lookup too) is verifiably wrong or
 * inconsistent for the exact coordinates in this list — found by review,
 * confirmed by directly querying a SECOND, independent Open-Meteo lookup
 * for the same coordinates (not guessed, not "corrected" from memory):
 *
 *  - Alert, Canada: geocoding says "America/Halifax" (Atlantic time), but
 *    querying api.open-meteo.com/v1/forecast for Alert's exact coordinates
 *    (a different code path from geocoding) resolves to "America/Iqaluit"
 *    (Eastern time) — matching the rest of Nunavut. These are NOT
 *    equivalent zones (different real-world DST rules), so this is a real
 *    functional correction, not a display-only relabel.
 *  - Hanoi, Vietnam: geocoding says "Asia/Bangkok", and querying the
 *    forecast api for Hanoi's coordinates returns the SAME "Asia/Bangkok"
 *    (unlike Alert, the two lookups agree) — strong evidence this is an
 *    IANA tzdata alias choice (Bangkok and Ho_Chi_Minh share identical
 *    UTC+7-no-DST rules, so tzdata can legitimately use either as the
 *    canonical representative name for the same underlying zone), not a
 *    functional bug. This override is display-only, matching the country
 *    it's actually in — utcOffsetSeconds is unaffected either way.
 */
const TIMEZONE_OVERRIDES = {
  'Alert|Canada': 'America/Iqaluit',
  'Hanoi|Vietnam': 'Asia/Ho_Chi_Minh',
}

/**
 * Refuses to silently ship a station whose pick wasn't actually verified.
 * Both flags come from build-stations.mjs's pickBest — previously computed
 * but never checked here, so a country mismatch or an arbitrary
 * no-real-signal pick could flow straight through into shipped data with
 * only a stderr log (easy to miss in a 314-line batch run) as the safety
 * net. Throwing here makes both cases a hard build failure instead.
 */
export function assertCleanPick(entry) {
  if (!entry.countryMatched) {
    throw new Error(
      `"${entry.queryName}, ${entry.expectedCountry}" was not country-matched by the geocoder ` +
        '(resolve the COUNTRY MISMATCH manually before re-running assembly)',
    )
  }
  if (entry.ambiguous) {
    throw new Error(
      `"${entry.queryName}, ${entry.expectedCountry}" was an ambiguous pick — no capital, exact-name, ` +
        'or population signal broke the tie (resolve manually before re-running assembly)',
    )
  }
}

/**
 * admin1 (state/province) is deliberately NOT carried through from the
 * geocoder: DESIGN §2.2 reserves it for disambiguating a name that's
 * otherwise ambiguous (e.g. Córdoba, Argentina vs Córdoba, Spain), and this
 * curated list has zero (name, country) collisions that need it —
 * attaching whatever admin1 the geocoder happened to return would just
 * make some entries arbitrarily verbose ("Chicago, Illinois, United
 * States") with no disambiguating purpose.
 */
export function buildStationRecord(entry, content) {
  assertCleanPick(entry)
  if (!content) {
    throw new Error(`no enrichment content for "${entry.name}|${entry.expectedCountry}"`)
  }

  const timezone = TIMEZONE_OVERRIDES[`${entry.name}|${entry.expectedCountry}`] ?? entry.timezone

  return {
    name: content.displayName ?? entry.name,
    // Always the canonical country declared in station-candidates.mjs, never
    // the geocoder's raw returned string — a review finding was that this
    // preferred the geocoder's variant when present, shipping inconsistent
    // results ("The Netherlands" for one aliased country, "South Korea" for
    // another) even though both were equally verified via COUNTRY_ALIASES.
    country: entry.expectedCountry,
    lat: entry.lat,
    lon: entry.lon,
    timezone,
    utcOffsetSeconds: utcOffsetSeconds(timezone),
    descriptor: content.descriptor,
    climateRegime: entry.climateRegime,
  }
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('usage: npx tsx scripts/assemble-stations.mjs <geocoded-stations.json>')
    process.exit(1)
  }

  const { resolved } = JSON.parse(readFileSync(inputPath, 'utf8'))

  const stations = resolved.map((entry) => {
    const key = `${entry.name}|${entry.expectedCountry}`
    return buildStationRecord(entry, ENRICHMENT[key])
  })

  // Self-validate before writing: run every record through the same schema
  // src/geo/stations.test.ts checks later, so a bad build fails HERE, not
  // after assets/stations.json is already committed.
  const validateStationList = await loadValidateStationList()
  validateStationList(stations)

  writeFileSync(new URL('../assets/stations.json', import.meta.url), JSON.stringify(stations, null, 2) + '\n')
  console.error(`wrote ${stations.length} stations to assets/stations.json (self-validated)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
