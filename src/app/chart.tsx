import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia'
import { useMemo, useState } from 'react'
import { ActivityIndicator, LayoutChangeEvent } from 'react-native'
import { useTodaysCall } from '../hooks/useTodaysCall'
import { landRingsFromGeoJson, type MultiPolygonFeature } from '../geo/worldMap'
import { projectVisibleSegments } from '../geo/globeOutline'
import worldGeoJsonRaw from '../../assets/world.geo.json'
import { Box } from '../components/ui/box'
import { Heading } from '../components/ui/heading'
import { Text } from '../components/ui/text'

// JSON imports infer plain number[] arrays, not the fixed-length [lon, lat]
// tuples MultiPolygonFeature declares — a real structural match (this file
// is exactly scripts/build-worldmap.mjs's output), just not one TS can
// verify from a JSON literal, hence the unknown detour rather than an
// unchecked `as`.
const worldGeoJson = worldGeoJsonRaw as unknown as MultiPolygonFeature

const OCEAN_COLOR = '#E2E8F0' // matches android-icon-background / a calm, muted fill
const COASTLINE_COLOR = '#94A3B8'
const HORIZON_COLOR = '#CBD5E1'
const STATION_COLOR = '#0F172A'

export default function ChartScreen() {
  const state = useTodaysCall()
  const [size, setSize] = useState(0)

  const centre = state.status === 'ready' ? state.call.station : null

  const rings = useMemo(() => landRingsFromGeoJson(worldGeoJson), [])
  const segments = useMemo(
    () => (centre === null ? [] : projectVisibleSegments(rings, { lat: centre.lat, lon: centre.lon })),
    [rings, centre],
  )

  const radius = size / 2
  const coastlinePath = useMemo(() => {
    if (radius <= 0 || segments.length === 0) return null
    // PathBuilder, not the older Skia.Path.Make() — the latter's
    // moveTo/lineTo log a deprecation warning on every render (seen in
    // logcat while verifying this screen on an emulator, not assumed).
    const builder = Skia.PathBuilder.Make()
    for (const segment of segments) {
      // orthographic()'s y is "up" (north is +y); Skia's canvas y grows
      // downward, so it must be negated here or the whole map renders
      // vertically mirrored — the exact class of bug this project's
      // daylight.ts polar day/night fix already ran into once.
      builder.moveTo(radius + segment.x1 * radius, radius - segment.y1 * radius)
      builder.lineTo(radius + segment.x2 * radius, radius - segment.y2 * radius)
    }
    return builder.detach()
  }, [segments, radius])

  const onLayout = (event: LayoutChangeEvent) => {
    setSize(event.nativeEvent.layout.width)
  }

  if (state.status === 'loading') {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </Box>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <Box className="flex-1 bg-background px-6 pt-16">
        <Heading size="xl">The Chart</Heading>
        <Text className="mt-3 leading-6 text-muted-foreground">
          The Chart centres on today&rsquo;s station, which needs a connection to establish first.
        </Text>
      </Box>
    )
  }

  return (
    <Box className="flex-1 bg-background px-6 pt-16">
      <Heading size="xl">The Chart</Heading>
      <Text className="mt-1 text-muted-foreground">{state.call.stationLabel}, centered</Text>

      <Box className="mt-6 aspect-square w-full" onLayout={onLayout}>
        {size > 0 && (
          <Canvas style={{ width: size, height: size }}>
            <Circle cx={radius} cy={radius} r={radius} color={OCEAN_COLOR} />
            {coastlinePath && (
              <Path path={coastlinePath} style="stroke" strokeWidth={1} color={COASTLINE_COLOR} />
            )}
            <Circle
              cx={radius}
              cy={radius}
              r={radius - 0.5}
              style="stroke"
              strokeWidth={1}
              color={HORIZON_COLOR}
            />
            <Circle cx={radius} cy={radius} r={4} color={STATION_COLOR} />
          </Canvas>
        )}
      </Box>

      <Text className="mt-4 text-muted-foreground">
        Neighbour, Barometer, and Climatology overlays (DESIGN §5) land in a follow-up PR.
      </Text>
    </Box>
  )
}
