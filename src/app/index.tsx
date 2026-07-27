import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView } from 'react-native'
import { loadCallHistory } from '../history/callHistory'
import { isCommitted } from '../history/commitment'
import { useTodaysCall } from '../hooks/useTodaysCall'
import { stationImageFor, stationImageKey, type StationImage } from '../geo/stationImages'
import stationImagesRaw from '../../assets/station-images.json'
import { StationBanner } from '../components/StationBanner'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

const stationImages = stationImagesRaw as Record<string, StationImage>

/** Matches --muted-foreground in src/global.css; readable on both light and dark backgrounds. */
const NAV_ICON_COLOR = '#64748B'

const OTHER_SCREENS = [
  { href: '/chart', label: 'The Chart', icon: 'globe' },
  { href: '/history', label: 'History', icon: 'clock' },
  { href: '/tutorial', label: 'Tutorial Call', icon: 'help-circle' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/attribution', label: 'Data & Attribution', icon: 'info' },
] as const

function NavList() {
  return (
    <VStack space="md" className="mt-10">
      {OTHER_SCREENS.map((screen) => (
        <Link key={screen.href} href={screen.href} asChild>
          <Button variant="link" className="self-start px-0">
            <Feather name={screen.icon} size={18} color={NAV_ICON_COLOR} accessible={false} />
            <ButtonText>{screen.label}</ButtonText>
          </Button>
        </Link>
      ))}
    </VStack>
  )
}

export default function HomeScreen() {
  const state = useTodaysCall()
  const [called, setCalled] = useState<boolean | null>(null)

  // Re-checked on focus, so returning from the Call screen immediately
  // reflects a commitment just made.
  const date = state.status === 'ready' ? state.date : null
  useFocusEffect(
    useCallback(() => {
      if (date === null) return
      let cancelled = false
      loadCallHistory(AsyncStorage).then((history) => {
        if (!cancelled) setCalled(isCommitted(history, date))
      })
      return () => {
        cancelled = true
      }
    }, [date]),
  )

  if (state.status === 'loading') {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </Box>
    )
  }

  /**
   * No trusted date is a real, reachable state — first launch with no
   * network. DESIGN §10 forbids falling back to the device clock, so the
   * only honest thing is to say so and offer a retry.
   */
  if (state.status === 'unavailable') {
    return (
      <Box className="flex-1 bg-background px-6 pt-24">
        <Heading size="xl">Today&rsquo;s Call isn&rsquo;t available</Heading>
        <Text className="mt-3 leading-6 text-muted-foreground">
          Ensemble takes the date from Open-Meteo rather than from your device, so everyone gets
          the same Call. That needs a connection at least once.
        </Text>
        <Button className="mt-6 self-start" onPress={state.retry}>
          <ButtonText>Try again</ButtonText>
        </Button>
        <NavList />
      </Box>
    )
  }

  const { call } = state
  const image = stationImageFor(stationImages, call.station)

  return (
    // Scrollable: the banner alone is ~90% of the screen width tall, so the
    // nav list below it would otherwise be unreachable on a short device.
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 48 }}>
      <StationBanner
        image={image}
        imageKey={stationImageKey(call.station)}
        fallbackLabel={call.stationLabel}
      />

      <Box className="px-6 pt-6">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&rsquo;s Call
        </Text>
        <Heading size="2xl" className="mt-1">
          {call.stationLabel}
        </Heading>
        <Text className="mt-2 leading-6 text-foreground">{call.station.descriptor}</Text>

        <Link href="/call" asChild>
          <Button className="mt-6">
            <ButtonText>
              {called === true ? 'See your Call' : 'Make today’s Call'}
            </ButtonText>
          </Button>
        </Link>

        <NavList />
      </Box>
    </ScrollView>
  )
}
