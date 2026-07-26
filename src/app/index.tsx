import { Link } from 'expo-router'
import { useMemo } from 'react'
import { generateCall } from '../puzzle/daily'
import { validateStationList } from '../geo/stationData'
import stationsRaw from '../../assets/stations.json'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

/** Device-local calendar date, YYYY-MM-DD — a display convenience only. */
function todayLocalDate(): string {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const OTHER_SCREENS = [
  { href: '/chart', label: 'The Chart' },
  { href: '/history', label: 'History' },
  { href: '/tutorial', label: 'Tutorial Call' },
  { href: '/settings', label: 'Settings' },
  { href: '/attribution', label: 'Data & Attribution' },
] as const

export default function HomeScreen() {
  const call = useMemo(() => {
    const stations = validateStationList(stationsRaw)
    return generateCall(todayLocalDate(), stations)
  }, [])

  return (
    <Box className="flex-1 bg-background px-6 pt-24">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today&rsquo;s Call
      </Text>
      <Heading size="2xl" className="mt-1">
        {call.stationLabel}
      </Heading>
      <Text className="mt-2 leading-6 text-foreground">{call.station.descriptor}</Text>

      <VStack space="md" className="mt-12">
        {OTHER_SCREENS.map((screen) => (
          <Link key={screen.href} href={screen.href} asChild>
            <Button variant="link" className="self-start px-0">
              <ButtonText>{screen.label}</ButtonText>
            </Button>
          </Link>
        ))}
      </VStack>
    </Box>
  )
}
