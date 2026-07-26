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
export const COUNTRY_ALIASES = {
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

export function aliasFor(expectedCountry) {
  return COUNTRY_ALIASES[expectedCountry] ?? { names: [expectedCountry], codes: [] }
}

export function countryMatches(expected, result) {
  const alias = aliasFor(expected)
  if (result.country && alias.names.some((n) => n.toLowerCase() === result.country.toLowerCase())) {
    return true
  }
  return alias.codes?.includes(result.country_code) ?? false
}

/**
 * Explicit character folding for letters that ICU/Unicode NFD normalisation
 * does NOT decompose into a base letter + combining mark — found by review:
 * é → e + combining-acute under NFD, but ø, Æ, Å, ß are their own distinct
 * code points with nothing to strip, so they silently survived the original
 * accent-stripping pass and could reject a legitimate ASCII-transliterated
 * match ("Tromsø" would never equal "Tromso").
 */
const NON_DECOMPOSING_FOLDS = [
  [/æ/gi, 'ae'],
  [/ø/gi, 'o'],
  [/å/gi, 'a'],
  [/ß/g, 'ss'],
]

export const normalise = (s) => {
  let folded = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [pattern, replacement] of NON_DECOMPOSING_FOLDS) {
    folded = folded.replace(pattern, replacement)
  }
  return folded.replace(/['’ʻ]/g, '')
}

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
 *   1. Country-matching AND exact name match (fixes a real bug found while
 *      smoke-testing: "Alert" was losing to "Alert Bay" purely because the
 *      latter had non-null population data to sort on) — but capital match
 *      (below) is checked FIRST, across the whole pool, ahead of this.
 *   2. Country-matching, preferring the national/regional capital (PPLC).
 *   3. Country-matching, highest population.
 *   4. If nothing matched the expected country, fall back to the same
 *      preference order over the whole result set (flagged for review).
 *
 * Returns `ambiguous: true` whenever population is the ONLY thing that could
 * have broken a tie and every remaining candidate has `population: null` —
 * checked independently in both the exact-name-match tier and the final
 * whole-pool tier, since either can hold more than one candidate (two
 * unrelated places sharing the query's exact name is just as real a tie as
 * two unrelated places with no name match at all). In that case the
 * population sort compares `0 ?? 0` for every pair and, because
 * Array.prototype.sort is stable, silently returns whichever result the API
 * happened to list first. This was a review finding: that case previously
 * produced no diagnostic at all (countryMatched stays true), unlike a
 * genuine country mismatch — a silent, unflagged recurrence of exactly the
 * bug class this function was built to catch. A follow-up review finding
 * caught that the first fix only checked this in the whole-pool tier, missing
 * the identical tie inside the exact-name-match tier.
 */
export function pickBest(results, queryName, expectedCountry) {
  const matching = results.filter((r) => countryMatches(expectedCountry, r))
  const pool = matching.length > 0 ? matching : results
  const countryMatched = matching.length > 0

  const capital = pool.find((r) => r.feature_code === 'PPLC')
  if (capital) return { record: capital, countryMatched, ambiguous: false }

  const exact = pool.filter((r) => normalise(r.name) === normalise(queryName))
  if (exact.length > 0) {
    const byPopulation = [...exact].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    const ambiguous = exact.length > 1 && exact.every((r) => r.population === null || r.population === undefined)
    return { record: byPopulation[0], countryMatched, ambiguous }
  }

  const byPopulation = [...pool].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  const ambiguous = pool.length > 1 && pool.every((r) => r.population === null || r.population === undefined)
  return { record: byPopulation[0], countryMatched, ambiguous }
}

async function main() {
  const resolved = []
  const failures = []
  const countryMismatches = []
  const ambiguousPicks = []

  for (let i = 0; i < CANDIDATES.length; i++) {
    const candidate = CANDIDATES[i]
    process.stderr.write(`[${i + 1}/${CANDIDATES.length}] ${candidate.name}, ${candidate.country}... `)

    try {
      const results = await geocode(candidate.name)
      if (results.length === 0) {
        process.stderr.write('NO RESULTS\n')
        failures.push({ ...candidate, reason: 'no geocoding results' })
      } else {
        const { record, countryMatched, ambiguous } = pickBest(results, candidate.name, candidate.country)
        if (!countryMatched) {
          process.stderr.write(`COUNTRY MISMATCH (got "${record.country}", code ${record.country_code})\n`)
          countryMismatches.push({ ...candidate, gotCountry: record.country, gotCountryCode: record.country_code, gotName: record.name })
        } else if (ambiguous) {
          process.stderr.write(`AMBIGUOUS PICK (no capital/exact-match/population signal) -> ${record.name}\n`)
          ambiguousPicks.push({ ...candidate, gotName: record.name })
        } else {
          process.stderr.write(`OK -> ${record.name}, ${record.country ?? record.country_code} (${record.latitude}, ${record.longitude})\n`)
        }
        resolved.push({
          queryName: candidate.name,
          expectedCountry: candidate.country,
          climateRegime: candidate.climateRegime,
          countryMatched,
          ambiguous,
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
    `\n${resolved.length - ambiguousPicks.length} resolved cleanly, ${failures.length} failed, ` +
      `${countryMismatches.length} country mismatches, ${ambiguousPicks.length} ambiguous picks\n`,
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
  if (ambiguousPicks.length > 0) {
    process.stderr.write(
      `\nAMBIGUOUS PICKS (no real signal broke the tie — review manually):\n${ambiguousPicks
        .map((a) => `  "${a.name}, ${a.country}" -> picked "${a.gotName}" arbitrarily`)
        .join('\n')}\n`,
    )
  }

  console.log(JSON.stringify({ resolved, failures, countryMismatches, ambiguousPicks }, null, 2))
}

// Only run when this file is the actual entrypoint, not when imported (by
// tests, or by another script) — a bare top-level `main()` call previously
// fired a full live-API batch run just from `import()`-ing this module for
// inspection.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
