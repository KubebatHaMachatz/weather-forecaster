import { useMemo } from 'react'
import { generateCall, type Call } from '../puzzle/daily'
import { validateStationList } from '../geo/stationData'
import stationsRaw from '../../assets/stations.json'

/** Device-local calendar date, YYYY-MM-DD — a display convenience only. */
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
