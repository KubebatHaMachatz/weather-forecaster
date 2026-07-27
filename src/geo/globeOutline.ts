import type { LatLon } from './coordinates.js'
import { orthographic } from './projection.js'

/** Unit-disc line segment, per orthographic()'s own convention — scaling to pixels is the renderer's job. */
export interface ProjectedSegment {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/**
 * Projects a set of rings (e.g. coastline outlines) centered on `center`,
 * emitting one segment per adjacent point pair — but ONLY where BOTH
 * endpoints are on the near hemisphere.
 *
 * A segment with one near-side and one far-side endpoint straddles the
 * horizon; the far point's (x, y) is a valid unit-disc coordinate on its
 * own (orthographic() doesn't refuse to compute it), but connecting it to
 * the near point would draw a straight line across the disc that has no
 * relationship to the actual coastline — a visible artifact, not a
 * simplification. Dropping such segments slightly clips the coastline right
 * at the horizon edge instead; that's an accepted, honest trade for not
 * drawing wrong lines (a real precision fix would interpolate the exact
 * horizon crossing, which this project doesn't need yet for a small
 * mobile globe).
 */
export function projectVisibleSegments(
  rings: readonly (readonly LatLon[])[],
  center: LatLon,
): readonly ProjectedSegment[] {
  const segments: ProjectedSegment[] = []

  for (const ring of rings) {
    const first = ring[0]
    if (first === undefined) continue

    let previous = orthographic(first, center)
    for (let i = 1; i < ring.length; i++) {
      const point = ring[i]
      if (point === undefined) continue

      const projected = orthographic(point, center)
      if (previous.visible && projected.visible) {
        segments.push({ x1: previous.x, y1: previous.y, x2: projected.x, y2: projected.y })
      }
      previous = projected
    }
  }

  return segments
}
