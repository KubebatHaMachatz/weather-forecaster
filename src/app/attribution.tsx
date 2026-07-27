import { Link } from 'expo-router'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'
import { VStack } from '../components/ui/vstack'

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
    <Box className="flex-1 bg-background px-6 pt-16">
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
        and Wikipedia. Each is used under its own Creative Commons licence, credited to its
        photographer on the image itself. Photographs whose licence could not be read are not
        used at all.
      </Text>
    </Box>
  )
}
