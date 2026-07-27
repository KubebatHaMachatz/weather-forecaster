import { Image } from 'expo-image'
import { useWindowDimensions } from 'react-native'
import type { StationImage } from '../geo/stationImages'
import { STATION_PHOTO_ASSETS } from '../geo/stationPhotoAssets'
import { Box } from './ui/box'
import { Text } from './ui/text'

/**
 * DESIGN §11.1 asks for calm, not flashy — so the banner is a plain
 * photograph with a small credit, not a hero image with overlaid text.
 */
const BANNER_ASPECT = 0.9 // height as a fraction of screen width

interface StationBannerProps {
  readonly image: StationImage | null
  /** Key into the bundled photo assets — the station's "name|country". */
  readonly imageKey: string
  /** Shown when there's no photo, so the space still says something useful. */
  readonly fallbackLabel: string
}

export function StationBanner({ image, imageKey, fallbackLabel }: StationBannerProps) {
  const { width } = useWindowDimensions()
  const height = width * BANNER_ASPECT

  // Bundled, so there is no network fetch and no load failure to handle —
  // but a manifest entry with no generated asset would still be a bug, and
  // rendering nothing is better than rendering a broken box.
  const asset = image === null ? undefined : STATION_PHOTO_ASSETS[imageKey]

  if (image === null || asset === undefined) {
    return (
      <Box style={{ width, height }} className="items-center justify-center bg-muted">
        <Text className="px-6 text-center text-muted-foreground">{fallbackLabel}</Text>
      </Box>
    )
  }

  return (
    <Box style={{ width, height }}>
      <Image
        source={asset}
        style={{ width, height }}
        contentFit="cover"
        accessibilityLabel={`Photograph of ${fallbackLabel}`}
      />
      {/*
        CC BY / BY-SA require the author's name AND the licence, credited on
        the work itself rather than only on a separate screen. Commons'
        credit-line guidance names author + licence designation + licence
        link as the required elements, so the licence text is rendered here
        and the Attribution screen carries the linked, full explanation.
      */}
      <Box className="absolute bottom-0 right-0 bg-background/70 px-2 py-1">
        <Text className="text-[10px] text-muted-foreground">
          {image.artist ? `${image.artist} · ` : ''}
          {image.licence} · Wikimedia Commons
        </Text>
      </Box>
    </Box>
  )
}
