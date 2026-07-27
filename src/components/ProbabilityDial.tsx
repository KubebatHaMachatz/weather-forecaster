import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { useMemo } from 'react'

const TRACK_COLOR = '#CBD5E1'
const FILL_COLOR = '#1E3A5F'
const STROKE_WIDTH = 14

interface ProbabilityDialProps {
  /** 0–1. */
  readonly probability: number
  readonly size: number
}

/**
 * DESIGN §3.2's Dial: a 0–100% arc for binary questions.
 *
 * A half-circle opening upward, so 0% and 100% sit at the two ends and 50%
 * — which §3.2 makes always allowed and always worth zero net — is exactly
 * at the top. Reading "am I above or below honest ignorance?" is then a
 * glance rather than arithmetic.
 */
export function ProbabilityDial({ probability, size }: ProbabilityDialProps) {
  const height = size / 2 + STROKE_WIDTH
  const radius = (size - STROKE_WIDTH) / 2
  const cx = size / 2
  const cy = height - STROKE_WIDTH / 2

  const { track, fill } = useMemo(() => {
    // Skia sweeps clockwise from 180° (west), so a 180° sweep traces the
    // upper half left-to-right — matching 0% on the left, 100% on the right.
    // PathBuilder, not Skia.Path.Make() — the latter's addArc logs a
    // deprecation warning on every render (seen in logcat, same class of
    // warning already fixed for moveTo/lineTo in chart.tsx).
    const bounds = { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }
    const trackPath = Skia.PathBuilder.Make().addArc(bounds, 180, 180).detach()

    const clamped = Math.min(1, Math.max(0, probability))
    // A zero-length arc still renders a dot with a round cap; skip it so 0%
    // reads as genuinely empty.
    const fillPath =
      clamped > 0
        ? Skia.PathBuilder.Make().addArc(bounds, 180, 180 * clamped).detach()
        : Skia.PathBuilder.Make().detach()

    return { track: trackPath, fill: fillPath }
  }, [probability, cx, cy, radius])

  return (
    <Canvas style={{ width: size, height }}>
      <Path path={track} style="stroke" strokeWidth={STROKE_WIDTH} strokeCap="round" color={TRACK_COLOR} />
      <Path path={fill} style="stroke" strokeWidth={STROKE_WIDTH} strokeCap="round" color={FILL_COLOR} />
    </Canvas>
  )
}
