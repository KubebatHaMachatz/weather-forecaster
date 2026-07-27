import { fetchArchive } from '../api/archive.js'
import { generateCall } from '../puzzle/daily.js'
import { validateStationList } from '../geo/stationData.js'
import stationsRaw from '../../assets/stations.json'
import type { CallHistoryEntry } from '../history/callHistory.js'
import { archiveQueryFor, extractTruth } from './extractTruth.js'
import type { Truth } from './scoreCall.js'

const stations = validateStationList(stationsRaw)

/**
 * Fetches the archive truth for a committed Call.
 *
 * The Call is regenerated from its date rather than stored alongside the
 * commitment: generateCall is a pure function of the date (DESIGN §10's
 * "same puzzle for everyone"), so this reconstructs exactly the station,
 * question and target hour the player was asked about — with no chance of a
 * stored copy drifting from it.
 *
 * Returns null when the archive can't answer — the caller leaves the Call
 * pending rather than inventing a score.
 */
export async function fetchTruthForEntry(entry: CallHistoryEntry): Promise<Truth | null> {
  const call = generateCall(entry.date, stations)
  const query = archiveQueryFor(call)

  const { data } = await fetchArchive({
    latitude: query.latitude,
    longitude: query.longitude,
    startDate: query.startDate,
    endDate: query.endDate,
    timezone: query.timezone,
    ...(query.hourly !== undefined ? { hourly: query.hourly } : {}),
    ...(query.daily !== undefined ? { daily: query.daily } : {}),
  })

  return extractTruth(call, data as Parameters<typeof extractTruth>[1])
}

/** The station's UTC offset for a committed Call, for the §9.2a timing gate. */
export function stationOffsetForEntry(entry: CallHistoryEntry): number {
  return generateCall(entry.date, stations).station.utcOffsetSeconds
}
