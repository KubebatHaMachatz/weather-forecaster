/**
 * DESIGN §9.3: "no Call ships with fewer than five responding models."
 * Checks every bundled station against the real multi-model forecast call
 * and flags any with poor regional coverage — most likely exactly the
 * remote/exotic stations this list deliberately includes (small islands,
 * polar research stations).
 *
 * Usage: node scripts/check-model-coverage.mjs
 */
import { readFileSync } from 'node:fs'

const THROTTLE_MS = 150
const MIN_RESPONDING_MODELS = 5

const MODELS = [
  'ecmwf_ifs025',
  'icon_seamless',
  'gfs_seamless',
  'gem_seamless',
  'meteofrance_seamless',
  'jma_seamless',
  'ukmo_seamless',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const stations = JSON.parse(readFileSync(new URL('../assets/stations.json', import.meta.url), 'utf8'))

async function checkCoverage(station, attempt = 1) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(station.lat))
  url.searchParams.set('longitude', String(station.lon))
  url.searchParams.set('hourly', 'temperature_2m')
  url.searchParams.set('models', MODELS.join(','))
  url.searchParams.set('forecast_days', '1')

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return { error: `HTTP ${res.status}` }
    }
    const body = await res.json()
    const hourly = body.hourly ?? {}

    const responding = MODELS.filter((model) => {
      const series = hourly[`temperature_2m_${model}`]
      return Array.isArray(series) && series.some((v) => v !== null)
    })

    return { responding: responding.length, missing: MODELS.filter((m) => !responding.includes(m)) }
  } catch (err) {
    // Transient network failures happen; retry once before giving up so one
    // dropped connection doesn't crash a 314-station run.
    if (attempt < 2) {
      await sleep(1000)
      return checkCoverage(station, attempt + 1)
    }
    return { error: err.message }
  }
}

async function main() {
  const flagged = []
  const errors = []

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]
    process.stderr.write(`[${i + 1}/${stations.length}] ${station.name}, ${station.country}... `)

    const result = await checkCoverage(station)
    if (result.error) {
      process.stderr.write(`ERROR: ${result.error}\n`)
      errors.push({ station, error: result.error })
    } else if (result.responding < MIN_RESPONDING_MODELS) {
      process.stderr.write(`LOW COVERAGE: ${result.responding}/${MODELS.length} (missing: ${result.missing.join(', ')})\n`)
      flagged.push({ station, ...result })
    } else {
      process.stderr.write(`OK (${result.responding}/${MODELS.length})\n`)
    }

    await sleep(THROTTLE_MS)
  }

  process.stderr.write(
    `\n${stations.length - flagged.length - errors.length}/${stations.length} stations meet the ${MIN_RESPONDING_MODELS}-model minimum\n`,
  )
  if (flagged.length > 0) {
    process.stderr.write(`\nFLAGGED (below minimum):\n`)
    for (const f of flagged) {
      process.stderr.write(`  ${f.station.name}, ${f.station.country}: ${f.responding}/${MODELS.length} (missing ${f.missing.join(', ')})\n`)
    }
  }
  if (errors.length > 0) {
    process.stderr.write(`\nERRORS:\n`)
    for (const e of errors) {
      process.stderr.write(`  ${e.station.name}, ${e.station.country}: ${e.error}\n`)
    }
  }
}

main()
