import { Link } from 'expo-router'
import { FlatList } from 'react-native'
import stationImagesRaw from '../../assets/station-images.json'
import type { StationImage } from '../geo/stationImages'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'

const stationImages = stationImagesRaw as Record<string, StationImage>

/**
 * expo-router's typed routes can narrow a string LITERAL to an external
 * URL, but not a value read from JSON. These are all http(s) links written
 * by the build pipeline (and the manifest test asserts their shape), so
 * this states that fact rather than widening Link's prop type.
 */
type ExternalUrl = Parameters<typeof Link>[0]['href']
const externalUrl = (url: string): ExternalUrl => url as ExternalUrl

/**
 * The complete per-photograph credit.
 *
 * Commons' credit-line guidance names author + licence designation +
 * licence link as the required elements, with the source page recommended.
 * The banner itself carries author and licence (attribution has to be on
 * the work, not only elsewhere); this screen carries the linked, full
 * version for all of them, which a 10px overlay could never do legibly.
 */
const CREDITS = Object.entries(stationImages)
  .map(([key, image]) => ({ key, station: key.replace('|', ', '), image }))
  .sort((a, b) => a.station.localeCompare(b.station))

export default function PhotoCreditsScreen() {
  return (
    <Box className="flex-1 bg-background">
      <FlatList
        data={CREDITS}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 }}
        ListHeaderComponent={
          <Box className="mb-6">
            <Heading size="xl">Photo credits</Heading>
            <Text className="mt-2 leading-6 text-muted-foreground">
              Every station photograph, its photographer, its licence, and the article it came
              from. All are bundled with the app under free licences.
            </Text>
          </Box>
        }
        renderItem={({ item }) => (
          <Box className="mb-5">
            <Text className="font-semibold text-foreground">{item.station}</Text>
            <Text className="text-muted-foreground">
              {item.image.artist ?? 'Unknown author'} · {item.image.licence}
            </Text>
            <Box className="flex-row flex-wrap gap-x-4">
              <Link href={externalUrl(item.image.sourcePage)} className="text-primary underline">
                Source
              </Link>
              {item.image.licenceUrl !== undefined && (
                <Link href={externalUrl(item.image.licenceUrl)} className="text-primary underline">
                  Licence
                </Link>
              )}
            </Box>
          </Box>
        )}
      />
    </Box>
  )
}
