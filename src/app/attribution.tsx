import { Link } from 'expo-router'
import { ScrollView } from 'react-native'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'
import { Button, ButtonText } from '../components/ui/button'

/**
 * Commons' credit-line guidance names the licence LINK as a required
 * element alongside author and licence designation, so every licence the
 * bundled photos use is linked to its text here.
 */
const LICENCE_LINKS = [
  { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/' },
  { name: 'CC BY 2.5', url: 'https://creativecommons.org/licenses/by/2.5/' },
  { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  { name: 'CC BY-SA 2.5', url: 'https://creativecommons.org/licenses/by-sa/2.5/' },
  { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { name: 'Free Art License', url: 'https://artlibre.org/licence/lal/en/' },
] as const

/**
 * DESIGN §9.6a: Open-Meteo's data is CC BY 4.0 with mandatory attribution on
 * every tier — this screen is a licence obligation, not a nicety. The
 * national services listed are the ones whose models actually appear by name
 * in the game's instruments (§4's "One Model" instrument), so this doubles
 * as a legend for those names.
 */
const CONTRIBUTING_SERVICES = [
  { model: 'ECMWF IFS', service: 'European Centre for Medium-Range Weather Forecasts' },
  { model: 'ICON', service: 'DWD — Deutscher Wetterdienst (Germany)' },
  { model: 'GFS', service: 'NOAA — National Oceanic and Atmospheric Administration (USA)' },
  { model: 'Météo-France', service: 'Météo-France (France)' },
  { model: 'JMA', service: 'Japan Meteorological Agency' },
  { model: 'UKMO', service: 'UK Met Office' },
  { model: 'GEM', service: 'ECCC — Environment and Climate Change Canada' },
] as const

export default function AttributionScreen() {
  return (
    // Scrollable: this screen carries real licence obligations, so its
    // content must never sit unreachably below the fold.
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 56 }}>
      <Box className="px-6 pt-16">
      <Heading size="xl">Data & Attribution</Heading>
      <Text className="mt-3 leading-6 text-foreground">
        Every forecast, every model, and the archive used to resolve each Call comes from{' '}
        <Link href="https://open-meteo.com" className="text-primary underline">
          Open-Meteo
        </Link>
        , licensed{' '}
        <Link href="https://creativecommons.org/licenses/by/4.0/" className="text-primary underline">
          CC BY 4.0
        </Link>
        .
      </Text>

      <Heading size="md" className="mt-8">
        Contributing national services
      </Heading>
      <Text className="mt-1 text-muted-foreground">
        The named models behind each instrument&rsquo;s &ldquo;One Model&rdquo; answer.
      </Text>

      <VStack space="md" className="mt-4">
        {CONTRIBUTING_SERVICES.map((entry) => (
          <Box key={entry.model} className="flex-row justify-between gap-4">
            <Text className="font-semibold text-foreground">{entry.model}</Text>
            <Text className="flex-1 text-right text-muted-foreground">{entry.service}</Text>
          </Box>
        ))}
      </VStack>

      <Heading size="md" className="mt-8">
        Station photographs
      </Heading>
      <Text className="mt-1 leading-6 text-muted-foreground">
        Banner photographs come from{' '}
        <Link href="https://commons.wikimedia.org" className="text-primary underline">
          Wikimedia Commons
        </Link>{' '}
        and Wikipedia, and are bundled with the app rather than loaded from Wikimedia&rsquo;s
        servers. Each is used under its own free licence and credited to its photographer on the
        image itself. Any photograph whose licence or author could not be established is not used
        at all.
      </Text>

      <Text className="mt-3 leading-6 text-muted-foreground">
        Licences in use, each linking to its full text:
      </Text>
      <VStack space="xs" className="mt-2">
        {LICENCE_LINKS.map((entry) => (
          <Link key={entry.name} href={entry.url} className="text-primary underline">
            {entry.name}
          </Link>
        ))}
      </VStack>

      <Text className="mt-4 leading-6 text-muted-foreground">
        Full per-photograph credits — photographer, licence, and a link to the source article —
        are listed on the Photo credits screen.
      </Text>
      <Link href="/photo-credits" asChild>
        <Button variant="outline" className="mt-4 self-start">
          <ButtonText>Photo credits</ButtonText>
        </Button>
      </Link>
      </Box>
    </ScrollView>
  )
}
