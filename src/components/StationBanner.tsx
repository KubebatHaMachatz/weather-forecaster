import { Image } from 'expo-image'
import { useState } from 'react'
import { useWindowDimensions } from 'react-native'
import type { StationImage } from '../geo/stationImages'
import { Box } from './ui/box'
import { Text } from './ui/text'

/**
 * DESIGN §11.1 asks for calm, not flashy — so the banner is a plain
 * photograph with a small credit, not a hero image with overlaid text.
 */
const BANNER_ASPECT = 0.9 // height as a fraction of screen width

/**
 * Wikimedia's User-Agent policy REQUIRES a descriptive agent identifying the
 * app; it answers 403 to the generic one Glide/OkHttp sends by default.
 * Found by running the app on a device and reading logcat — every banner
 * failed to its fallback until this header was set.
 * https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
 */
const WIKIMEDIA_HEADERS = {
  'User-Agent': 'EnsembleWeatherGame/0.1 (https://github.com/KubebatHaMachatz/weather-forecaster)',
}

interface StationBannerProps {
  readonly image: StationImage | null
  /** Shown when there's no photo, so the space still says something useful. */
  readonly fallbackLabel: string
}

export function StationBanner({ image, fallbackLabel }: StationBannerProps) {
  const { width } = useWindowDimensions()
  const height = width * BANNER_ASPECT
  // A URL can 404 or the device can be offline; either way the alt state
  // must look deliberate rather than showing a broken/blank box.
  const [failed, setFailed] = useState(false)

  if (!image || failed) {
    return (
      <Box style={{ width, height }} className="items-center justify-center bg-muted">
        <Text className="px-6 text-center text-muted-foreground">{fallbackLabel}</Text>
      </Box>
    )
  }

  return (
    <Box style={{ width, height }}>
      <Image
        source={{ uri: image.url, headers: WIKIMEDIA_HEADERS }}
        style={{ width, height }}
        contentFit="cover"
        transition={200}
        // Disk-cached: the same station shows all day, so reopening the app
        // must not re-download the photo (and it keeps working offline once
        // seen — the rest of this app is deliberately offline-friendly).
        cachePolicy="disk"
        onError={() => setFailed(true)}
        accessibilityLabel={`Photograph of ${fallbackLabel}`}
      />
      {/*
        CC BY / BY-SA require crediting the author on the image itself, not
        only on a separate screen — hence this inline credit. The full
        licence text and link live on the Attribution screen.
      */}
      <Box className="absolute bottom-0 right-0 bg-background/70 px-2 py-1">
        <Text className="text-[10px] text-muted-foreground">
          {image.artist ? `${image.artist} · ` : ''}
          {image.licence}
        </Text>
      </Box>
    </Box>
  )
}
