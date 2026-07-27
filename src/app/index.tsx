import { Feather } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { useTodaysCall } from '../hooks/useTodaysCall'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

/** Matches --muted-foreground in src/global.css; readable on both light and dark backgrounds. */
const NAV_ICON_COLOR = '#64748B'

const OTHER_SCREENS = [
  { href: '/chart', label: 'The Chart', icon: 'globe' },
  { href: '/history', label: 'History', icon: 'clock' },
  { href: '/tutorial', label: 'Tutorial Call', icon: 'help-circle' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/attribution', label: 'Data & Attribution', icon: 'info' },
] as const

export default function HomeScreen() {
  const call = useTodaysCall()

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
              <Feather name={screen.icon} size={18} color={NAV_ICON_COLOR} accessible={false} />
              <ButtonText>{screen.label}</ButtonText>
            </Button>
          </Link>
        ))}
      </VStack>
    </Box>
  )
}
