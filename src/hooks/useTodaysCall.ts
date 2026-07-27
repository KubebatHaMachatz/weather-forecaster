import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { generateCall, type Call } from '../puzzle/daily'
import { validateStationList } from '../geo/stationData'
import { createTrustedClock } from '../api/trustedClock'
import { fetchClockReference, syncTrustedClock } from '../api/clockSync'
import stationsRaw from '../../assets/stations.json'

/**
 * Today's Call, derived from the TRUSTED clock (DESIGN §10) — the `Date`
 * header on an Open-Meteo response, never the device clock, so moving the
 * device date can't change which Call you get.
 *
 * The cost of that guarantee is that the date can be genuinely unknown: on
 * a first launch with no network there is no trusted date and no honest way
 * to invent one. That state is surfaced as `status: 'unavailable'` for the
 * UI to explain, rather than silently papered over.
 */
export type TodaysCallState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly call: Call; readonly date: string }
  | { readonly status: 'unavailable' }

const stations = validateStationList(stationsRaw)

export function useTodaysCall(): TodaysCallState & { readonly retry: () => void } {
  const [date, setDate] = useState<string | null>(null)
  const [settled, setSettled] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const clock = createTrustedClock(AsyncStorage)

    void (async () => {
      await syncTrustedClock(clock, fetchClockReference)
      const puzzleDate = await clock.puzzleDate()
      if (cancelled) return
      setDate(puzzleDate)
      setSettled(true)
    })()

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setSettled(false)
    setAttempt((n) => n + 1)
  }, [])

  const call = useMemo(() => (date === null ? null : generateCall(date, stations)), [date])

  if (!settled) return { status: 'loading', retry }
  if (date === null || call === null) return { status: 'unavailable', retry }
  return { status: 'ready', call, date, retry }
}
