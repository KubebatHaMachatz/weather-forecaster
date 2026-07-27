import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ScrollView } from 'react-native'
import { loadCallHistory, type CallHistoryEntry } from '../history/callHistory'
import { currentStreak } from '../history/streak'
import { rankFor, rollingMeanSkill } from '../history/rank'
import { todayLocalDate } from '../hooks/useTodaysCall'
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

  if (history === null) {
    return (
      <Box className="flex-1 bg-background px-6 pt-16">
        <Heading size="xl">History</Heading>
      </Box>
    )
  }

  // Device clock, with the same caveat todayLocalDate documents — and it
  // bites a little harder here, since the streak is a progression reward
  // that a moved clock could otherwise be used to farm. Future-dated
  // records are already ignored by currentStreak/rollingMeanSkill, which
  // blunts the obvious version of that; the real fix is still the trusted
  // clock (DESIGN §10).
  const today = todayLocalDate()
  const streak = currentStreak(
    history.map((entry) => entry.date),
    today,
  )
  const scored = history
    .filter((entry): entry is CallHistoryEntry & { skill: number } => entry.skill !== undefined)
    .map((entry) => ({ date: entry.date, skill: entry.skill }))
  const meanSkill = rollingMeanSkill(scored, today)

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 48 }}>
      <Box className="px-6 pt-16">
        <Heading size="xl">History</Heading>

        <Box className="mt-6 flex-row gap-4">
          <Stat label="Streak" value={streak === 1 ? '1 day' : `${streak} days`} />
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
