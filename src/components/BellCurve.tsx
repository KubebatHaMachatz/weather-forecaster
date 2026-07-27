import { Canvas, Line, Path, Skia, vec } from '@shopify/react-native-skia'
import { useMemo } from 'react'
import { bellCurvePoints } from '../tutorial/tutorialCall'

const CURVE_COLOR = '#1E3A5F'
const CURVE_FILL = '#1E3A5F22'
const AXIS_COLOR = '#94A3B8'
const TRUTH_COLOR = '#B91C1C'
const SAMPLE_COUNT = 121

interface BellCurveProps {
  readonly mean: number
  readonly sd: number
  readonly axisMin: number
  readonly axisMax: number
  readonly width: number
  readonly height: number
  /** Drawn as a vertical marker once the Call has been scored. */
  readonly truth?: number
}

/**
 * DESIGN §3.1's Bell, rendered from real normal density — a narrower
 * forecast genuinely peaks higher, which is what makes the risk trade-off
 * legible rather than decorative.
 */
export function BellCurve({ mean, sd, axisMin, axisMax, width, height, truth }: BellCurveProps) {
  const axisY = height - 16

  const path = useMemo(() => {
    const points = bellCurvePoints(mean, sd, axisMin, axisMax, SAMPLE_COUNT)
    // Normalised to THIS curve's own peak, so it always fills the plot.
    //
    // A fixed scale was tried first and looked broken: the sd range is 16:1,
    // so at the default width the curve occupied about an eighth of the
    // canvas. Nothing is hidden by normalising, because for a distribution
    // drawn over a value axis the confidence signal is the horizontal
    // SPREAD — a wide forecast visibly covers more of the axis — and peak
    // height is just the redundant restatement of it that scaling was
    // fighting over.
    const peakDensity = points.reduce((max, p) => (p.density > max ? p.density : max), 0)
    const toX = (value: number) => ((value - axisMin) / (axisMax - axisMin)) * width
    // Guard the divide: a mean far outside [axisMin, axisMax] relative to sd
    // makes every sampled density underflow to 0, and dividing by that
    // yields NaN coordinates — which Skia does not handle gracefully. The
    // tutorial's sliders clamp the mean onto the axis so this can't fire
    // there, but this component takes those bounds as props and shouldn't
    // depend on every future caller doing the same.
    const toY =
      peakDensity > 0 ? (density: number) => axisY - (density / peakDensity) * (axisY - 8) : () => axisY

    const builder = Skia.PathBuilder.Make()
    builder.moveTo(toX(axisMin), axisY)
    for (const point of points) {
      builder.lineTo(toX(point.value), toY(point.density))
    }
    builder.lineTo(toX(axisMax), axisY)
    builder.close()
    return builder.detach()
  }, [mean, sd, axisMin, axisMax, width, axisY])

  const truthX = truth === undefined ? null : ((truth - axisMin) / (axisMax - axisMin)) * width

  return (
    <Canvas style={{ width, height }}>
      <Path path={path} color={CURVE_FILL} />
      <Path path={path} style="stroke" strokeWidth={2} color={CURVE_COLOR} />
      <Line p1={vec(0, axisY)} p2={vec(width, axisY)} color={AXIS_COLOR} strokeWidth={1} />
      {truthX !== null && (
        <Line p1={vec(truthX, 4)} p2={vec(truthX, axisY)} color={TRUTH_COLOR} strokeWidth={2} />
      )}
    </Canvas>
  )
}
