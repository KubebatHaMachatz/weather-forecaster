import { describe, expect, it } from 'vitest'
import { projectVisibleSegments } from './globeOutline.js'

const LONDON = { lat: 51.5, lon: -0.1 }
const PARIS = { lat: 48.9, lon: 2.3 }
const BERLIN = { lat: 52.5, lon: 13.4 }
// Antipodal to London — always on the far side of a London-centered globe.
const ANTIPODE_OF_LONDON = { lat: -51.5, lon: 179.9 }

describe('projectVisibleSegments', () => {
  it('centering the view on a point projects it to the origin', () => {
    const [segment] = projectVisibleSegments([[LONDON, PARIS]], LONDON)
    expect(segment?.x1).toBeCloseTo(0, 10)
    expect(segment?.y1).toBeCloseTo(0, 10)
  })

  it('emits one segment per adjacent pair when the whole ring is near-side', () => {
    const ring = [LONDON, PARIS, BERLIN, LONDON]
    const segments = projectVisibleSegments([ring], LONDON)
    expect(segments).toHaveLength(3)
  })

  it('emits no segments for a ring entirely on the far side', () => {
    const farRing = [ANTIPODE_OF_LONDON, { lat: -50, lon: 170 }, { lat: -45, lon: -170 }, ANTIPODE_OF_LONDON]
    const segments = projectVisibleSegments([farRing], LONDON)
    expect(segments).toHaveLength(0)
  })

  it('drops segments touching the far side rather than drawing a wraparound line', () => {
    // London (near), then straight to the antipode (far): the only possible
    // segment spans the horizon, so it must be dropped, not drawn as a
    // straight line across the disc — that would be a visible artifact of
    // the exact bug class this function exists to avoid (see coordinates.ts
    // / projection.ts's longitude-wrapping history in this project).
    const segments = projectVisibleSegments([[LONDON, ANTIPODE_OF_LONDON]], LONDON)
    expect(segments).toHaveLength(0)
  })

  it('flattens multiple rings into one segment list', () => {
    const ringA = [LONDON, PARIS]
    const ringB = [PARIS, BERLIN]
    const segments = projectVisibleSegments([ringA, ringB], LONDON)
    expect(segments).toHaveLength(2)
  })

  it('handles empty and single-point rings without throwing', () => {
    expect(projectVisibleSegments([[], [LONDON]], LONDON)).toEqual([])
  })
})
