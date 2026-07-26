/**
 * Resolves scripts/station-candidates.mjs into real, verified coordinates
 * via Open-Meteo's Geocoding API — the same provider already used elsewhere
 * in this project. Nothing numeric here is typed from memory.
 *
 * Run sequentially with throttling, matching the discipline established in
 * SPIKE.md and DESIGN §9.6 (mobile carrier-grade NAT means shared IPs, so
 * chattiness is a real risk, not just politeness).
 *
 * Usage: node scripts/build-stations.mjs > /tmp/geocoded-stations.json
 * Diagnostics go to stderr so stdout stays clean JSON.
 */
import { CANDIDATES } from './station-candidates.mjs'

const THROTTLE_MS = 150

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Two problems found by smoke-testing this against real responses before
 * running the full batch:
 *
 * 1. Territories (Greenland, Svalbard, French Guiana, ...) come back with
 *    `country: null` and only a `country_code` populated — matching on
 *    country name alone silently fails for all of them.
 * 2. Open-Meteo's country field sometimes differs from common usage
 *    ("Czechia" vs "Czech Republic").
 *
 * Both discovered empirically (see the mismatch log from the first run),
 * not guessed — `codes` are the standard ISO 3166-1 alpha-2 codes.
 */
const COUNTRY_ALIASES = {
  'United States': { names: ['United States', 'United States of America'] },
  'United Kingdom': { names: ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'] },
  'South Korea': { names: ['South Korea', 'Republic of Korea'] },
  'North Korea': { names: ['North Korea', "Democratic People's Republic of Korea"] },
  Russia: { names: ['Russia', 'Russian Federation'] },
  Czechia: { names: ['Czechia', 'Czech Republic'] },
  Vietnam: { names: ['Vietnam', 'Viet Nam'] },
  Laos: { names: ['Laos', "Lao People's Democratic Republic"] },
  Syria: { names: ['Syria', 'Syrian Arab Republic'] },
  Tanzania: { names: ['Tanzania', 'United Republic of Tanzania'] },
  Moldova: { names: ['Moldova', 'Republic of Moldova'] },
  Netherlands: { names: ['Netherlands', 'The Netherlands'] },
  Turkey: { names: ['Turkey', 'Republic of Türkiye', 'Türkiye'] },
  'Democratic Republic of the Congo': { names: ['Democratic Republic of the Congo', 'Democratic Republic of Congo'] },
  "Côte d'Ivoire": { names: ["Côte d'Ivoire", 'Ivory Coast'] },
  // Svalbard geocodes under its own code (SJ) despite being part of Norway.
  Norway: { names: ['Norway'], codes: ['NO', 'SJ'] },
  Greenland: { names: ['Greenland'], codes: ['GL'] },
  'French Guiana': { names: ['French Guiana'], codes: ['GF'] },
  Réunion: { names: ['Réunion', 'Reunion'], codes: ['RE'] },
  'Puerto Rico': { names: ['Puerto Rico'], codes: ['PR'] },
  'Falkland Islands': { names: ['Falkland Islands'], codes: ['FK'] },
  'U.S. Virgin Islands': {
    names: ['U.S. Virgin Islands', 'United States Virgin Islands', 'Virgin Islands, U.S.'],
    codes: ['VI'],
  },
  'Hong Kong': { names: ['Hong Kong'], codes: ['HK'] },
  Antarctica: { names: ['Antarctica'], codes: ['AQ'] },
  'Marshall Islands': { names: ['Marshall Islands'], codes: ['MH'] },
  'New Caledonia': { names: ['New Caledonia'], codes: ['NC'] },
  'French Polynesia': { names: ['French Polynesia'], codes: ['PF'] },
  Bermuda: { names: ['Bermuda'], codes: ['BM'] },
}

function aliasFor(expectedCountry) {
  return COUNTRY_ALIASES[expectedCountry] ?? { names: [expectedCountry], codes: [] }
}

function countryMatches(expected, result) {
  const alias = aliasFor(expected)
  if (result.country && alias.names.some((n) => n.toLowerCase() === result.country.toLowerCase())) {
    return true
  }
  return alias.codes?.includes(result.country_code) ?? false
}

const normalise = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents for comparison only
    .replace(/['’ʻ]/g, '')

async function geocode(name) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`geocoding ${name}: HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.results ?? []
}

/**
 * Picks the best candidate from a geocoding response. Order of preference:
 *   1. Country-matching AND the national capital (PPLC) — checked across the
 *      WHOLE country-matching pool, not just exact-name matches. An earlier
 *      version checked this only within the exact-name subset and broke on
 *      "Washington": the real capital's name field is "Washington D.C.",
 *      which fails an exact match against the query "Washington", so it was
 *      excluded in favour of an same-named-but-wrong small town in
 *      Pennsylvania that did match exactly. A capital hit is essentially
 *      never the wrong answer for a country-matching query, so it must
 *      outrank exact-name filtering, not be subordinate to it.
 *   2. Country-matching AND exact name match (fixes a different real bug:
 *      "Alert" was losing to "Alert Bay" purely because the latter had
 *      non-null population data to sort on).
 *   3. Country-matching, highest population.
 *   4. If nothing matched the expected country, fall back to the same
 *      preference order over the whole result set (flagged for review).
 */
function pickBest(results, queryName, expectedCountry) {
  const matching = results.filter((r) => countryMatches(expectedCountry, r))
  const pool = matching.length > 0 ? matching : results
  const countryMatched = matching.length > 0

  const capital = pool.find((r) => r.feature_code === 'PPLC')
  if (capital) return { record: capital, countryMatched }

  const exact = pool.filter((r) => normalise(r.name) === normalise(queryName))
  const ranked = exact.length > 0 ? exact : pool

  const byPopulation = [...ranked].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  return { record: byPopulation[0], countryMatched }
}

async function main() {
  const resolved = []
  const failures = []
  const countryMismatches = []

  for (let i = 0; i < CANDIDATES.length; i++) {
    const candidate = CANDIDATES[i]
    process.stderr.write(`[${i + 1}/${CANDIDATES.length}] ${candidate.name}, ${candidate.country}... `)

    try {
      const results = await geocode(candidate.name)
      if (results.length === 0) {
        process.stderr.write('NO RESULTS\n')
        failures.push({ ...candidate, reason: 'no geocoding results' })
      } else {
        const { record, countryMatched } = pickBest(results, candidate.name, candidate.country)
        if (!countryMatched) {
          process.stderr.write(`COUNTRY MISMATCH (got "${record.country}", code ${record.country_code})\n`)
          countryMismatches.push({ ...candidate, gotCountry: record.country, gotCountryCode: record.country_code, gotName: record.name })
        } else {
          process.stderr.write(`OK -> ${record.name}, ${record.country ?? record.country_code} (${record.latitude}, ${record.longitude})\n`)
        }
        resolved.push({
          queryName: candidate.name,
          expectedCountry: candidate.country,
          climateRegime: candidate.climateRegime,
          countryMatched,
          name: record.name,
          country: record.country,
          countryCode: record.country_code,
          admin1: record.admin1 ?? null,
          lat: record.latitude,
          lon: record.longitude,
          timezone: record.timezone,
          population: record.population ?? null,
          featureCode: record.feature_code,
        })
      }
    } catch (err) {
      process.stderr.write(`ERROR: ${err.message}\n`)
      failures.push({ ...candidate, reason: err.message })
    }

    await sleep(THROTTLE_MS)
  }

  process.stderr.write(
    `\n${resolved.length} resolved, ${failures.length} failed, ${countryMismatches.length} country mismatches\n`,
  )
  if (failures.length > 0) {
    process.stderr.write(`\nFAILURES:\n${failures.map((f) => `  ${f.name}, ${f.country}: ${f.reason}`).join('\n')}\n`)
  }
  if (countryMismatches.length > 0) {
    process.stderr.write(
      `\nCOUNTRY MISMATCHES (review manually):\n${countryMismatches
        .map((m) => `  "${m.name}, ${m.country}" -> got "${m.gotName}, ${m.gotCountry ?? m.gotCountryCode}"`)
        .join('\n')}\n`,
    )
  }

  console.log(JSON.stringify({ resolved, failures, countryMismatches }, null, 2))
}

main()
