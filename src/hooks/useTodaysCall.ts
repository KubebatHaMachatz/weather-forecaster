import { useMemo } from 'react'
import { generateCall, type Call } from '../puzzle/daily'
import { validateStationList } from '../geo/stationData'
import stationsRaw from '../../assets/stations.json'

/**
 * Device-local calendar date, YYYY-MM-DD.
 *
 * KNOWN GAP, deliberately not solved here: DESIGN §10 requires the date
 * driving puzzle generation to come from a TRUSTED clock (the `Date` header
 * on any Open-Meteo response — src/api/serverTime.ts's requireServerDate
 * already implements exactly this), precisely because the date decides which
 * station and question you get. Reading the device clock means changing the
 * device date changes your puzzle.
 *
 * It's harmless today only because nothing is committed or scored yet — there
 * is no answer to lock in and no streak to protect. It must be replaced with
 * the trusted clock before any commit/scoring flow ships, and this is called
 * out here rather than left as a silently-wrong "it works" default.
 */
function todayLocalDate(): string {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's Call, shared by every screen that needs to know which station/question is live. */
export function useTodaysCall(): Call {
  return useMemo(() => {
    const stations = validateStationList(stationsRaw)
    return generateCall(todayLocalDate(), stations)
  }, [])
}
