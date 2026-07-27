import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ScrollView } from 'react-native'
import { loadCallHistory, type CallHistoryEntry } from '../history/callHistory'
import { currentStreak } from '../history/streak'
import { rankFor, rollingMeanSkill } from '../history/rank'
import { useTodaysCall } from '../hooks/useTodaysCall'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Box className="flex-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-2xl font-semibold text-foreground">{value}</Text>
    </Box>
  )
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<CallHistoryEntry[] | null>(null)
  // Streak and rank are progression rewards, so the "today" they're measured
  // against must be the TRUSTED date (DESIGN §10) — a device clock the
  // player controls could otherwise be wound forward to farm a streak.
  const clock = useTodaysCall()

  // Reloads on focus rather than only on mount: a Call committed on another
  // screen must show up here without restarting the app.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      loadCallHistory(AsyncStorage).then((loaded) => {
        if (!cancelled) setHistory(loaded)
      })
      return () => {
        cancelled = true
      }
    }, []),
  )

  if (history === null || clock.status === 'loading') {
    return (
      <Box className="flex-1 bg-background px-6 pt-16">
        <Heading size="xl">History</Heading>
      </Box>
    )
  }

  /**
   * Without a trusted date, streak and rank are not computable — both are
   * defined relative to "today", and DESIGN §10 rules out substituting the
   * device clock. Past Calls are still shown, since those are facts already
   * recorded; only the two time-relative stats are withheld.
   */
  const today = clock.status === 'ready' ? clock.date : null

  const streak =
    today === null
      ? null
      : currentStreak(
          history.map((entry) => entry.date),
          today,
        )
  const scored = history
    .filter((entry): entry is CallHistoryEntry & { skill: number } => entry.skill !== undefined)
    .map((entry) => ({ date: entry.date, skill: entry.skill }))
  const meanSkill = today === null ? null : rollingMeanSkill(scored, today)

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 48 }}>
      <Box className="px-6 pt-16">
        <Heading size="xl">History</Heading>

        <Box className="mt-6 flex-row gap-4">
          <Stat
            label="Streak"
            // An em-dash, not "0 days": with no trusted date the streak is
            // unknown, and 0 would be a claim we can't actually make.
            value={streak === null ? '—' : streak === 1 ? '1 day' : `${streak} days`}
          />
          <Stat
            label="Rank"
            // null mean skill means nothing has resolved yet — showing a
            // rank derived from zero would assert a performance the player
            // hasn't actually produced.
            value={meanSkill === null ? '—' : rankFor(meanSkill).title}
          />
        </Box>
        {meanSkill !== null && (
          <Text className="mt-2 text-muted-foreground">
            Rolling 30-day mean skill {meanSkill.toFixed(2)}
          </Text>
        )}
        {today === null && (
          <Text className="mt-2 text-muted-foreground">
            Streak and rank need a connection — Ensemble takes the date from Open-Meteo, not from
            your device.
          </Text>
        )}

        {history.length === 0 ? (
          <Box className="mt-10">
            <Text className="leading-6 text-foreground">No Calls yet.</Text>
            <Text className="mt-2 leading-6 text-muted-foreground">
              Every Call you commit is recorded here, with the skill score it earned once it
              resolves the following day.
            </Text>
          </Box>
        ) : (
          <VStack space="md" className="mt-10">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Past Calls
            </Text>
            {[...history].reverse().map((entry) => (
              <Box key={entry.date} className="flex-row items-baseline justify-between gap-4">
                <Box className="flex-1">
                  <Text className="text-foreground">{entry.stationLabel}</Text>
                  <Text className="text-xs text-muted-foreground">{entry.date}</Text>
                </Box>
                <Text className="text-muted-foreground">
                  {entry.skill === undefined ? 'Pending' : entry.skill.toFixed(2)}
                </Text>
              </Box>
            ))}
          </VStack>
        )}
      </Box>
    </ScrollView>
  )
}
