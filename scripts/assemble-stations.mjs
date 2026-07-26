/**
 * Combines the live-geocoded station data (build-stations.mjs output) with
 * hand-authored content (station-enrichment.mjs) into the final bundled
 * assets/stations.json (DESIGN §9.5).
 *
 * Usage: node scripts/build-stations.mjs > /tmp/geocoded-stations.json
 *        node scripts/assemble-stations.mjs /tmp/geocoded-stations.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ENRICHMENT } from './station-enrichment.mjs'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('usage: node scripts/assemble-stations.mjs <geocoded-stations.json>')
  process.exit(1)
}

/**
 * A live UTC offset for the station's IANA timezone, computed at build
 * time — NOT a permanent value. Real offsets shift with DST for roughly
 * 70% of this list's stations, so this is a best-effort seed: the actual
 * app always overwrites it with the fresh utc_offset_seconds a live
 * forecast/archive call returns whenever a station is used in a Call
 * (DESIGN §9.3). Good enough as a fallback for the Chart before any live
 * call has happened, never treated as authoritative.
 */
function utcOffsetSeconds(timeZone, at = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
  const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
  const match = part ? /GMT([+-])(\d{2}):(\d{2})/.exec(part) : null
  if (!match) {
    throw new Error(`could not compute UTC offset for timezone "${timeZone}"`)
  }
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60)
}

const { resolved } = JSON.parse(readFileSync(inputPath, 'utf8'))

const stations = resolved.map((s) => {
  const displayCountry = s.country || s.expectedCountry
  const key = `${s.name}|${displayCountry}`
  const content = ENRICHMENT[key]
  if (!content) {
    throw new Error(`no enrichment content for "${key}" — every geocoded station needs one`)
  }

  // admin1 (state/province) is deliberately NOT carried through from the
  // geocoder: DESIGN §2.2 reserves it for disambiguating a name that's
  // otherwise ambiguous (e.g. Córdoba, Argentina vs Córdoba, Spain), and
  // this curated list has zero (name, country) collisions that need it —
  // attaching whatever admin1 the geocoder happened to return would just
  // make some entries arbitrarily verbose ("Chicago, Illinois, United
  // States") with no disambiguating purpose.
  const station = {
    name: content.displayName ?? s.name,
    country: displayCountry,
    lat: s.lat,
    lon: s.lon,
    timezone: s.timezone,
    utcOffsetSeconds: utcOffsetSeconds(s.timezone),
    descriptor: content.descriptor,
    climateRegime: s.climateRegime,
  }

  return station
})

writeFileSync(new URL('../assets/stations.json', import.meta.url), JSON.stringify(stations, null, 2) + '\n')
console.error(`wrote ${stations.length} stations to assets/stations.json`)
