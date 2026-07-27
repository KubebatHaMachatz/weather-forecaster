import { crpsGaussian } from '../scoring/crps.js'
import { skillScore } from '../scoring/skill.js'

/**
 * The fixed tutorial Call (DESIGN §12 ships one). Deliberately NOT today's
 * puzzle: it's replayable, always scores identically, and can be reasoned
 * about in the copy around it.
 *
 * The numbers are a plausible mid-winter Reykjavík day rather than real
 * observations — nothing here is claimed to be measured data, and none of
 * it feeds the real game's scoring.
 */
export interface Climatology {
  readonly mean: number
  readonly sd: number
}

export const TUTORIAL_CALL = {
  stationLabel: 'Reykjavík, Iceland',
  question: 'Temperature at 15:00 tomorrow',
  unit: '°C',
  /** What actually happened, revealed only after committing. */
  truth: 3.4,
  /** The baseline every forecast is scored against (DESIGN §4). */
  climatology: { mean: 1.0, sd: 4.0 } as Climatology,
  // Starts exactly AT climatology, so an untouched forecast scores skill
  // 0.000 — "here is the baseline, now beat it". A starting point that
  // already beat the baseline (an earlier sd of 3.0 scored +0.043) muddles
  // the one idea this screen exists to teach.
  initialMean: 1.0,
  initialSd: 4.0,
  axis: { min: -12, max: 16 },
} as const

/** Bounds for the width control; sd must stay positive for crpsGaussian. */
export const SD_BOUNDS = { min: 0.5, max: 8 } as const

export interface TutorialScore {
  /** The player's CRPS — lower is better. */
  readonly crps: number
  /** Climatology's CRPS on the same observation. */
  readonly baselineCrps: number
  /** 1 perfect, 0 ties climatology, negative means climatology won. */
  readonly skill: number
}

/**
 * Scores a stated Gaussian forecast against the truth, exactly as the real
 * game would: the player's Bell is a stated distribution, not an ensemble
 * sample, so DESIGN §4's rule sends it to the Gaussian closed form (and
 * NOT to crpsFair, which is for ensemble-derived baselines).
 */
export function scoreTutorialForecast(
  mean: number,
  sd: number,
  truth: number,
  climatology: Climatology,
): TutorialScore {
  if (!(sd > 0)) {
    throw new RangeError(`forecast width must be positive, received ${sd}`)
  }
  const crps = crpsGaussian(mean, sd, truth)
  const baselineCrps = crpsGaussian(climatology.mean, climatology.sd, truth)
  return { crps, baselineCrps, skill: skillScore(crps, baselineCrps) }
}

/**
 * The 80% central interval DESIGN §3.1 shows as the Bell's live readout.
 * 1.2816 is the standard normal 90th percentile — the two-sided 80%
 * bound — not a hand-tuned constant.
 */
const Z_80 = 1.2815515655446004

export function confidenceInterval80(mean: number, sd: number): { low: number; high: number } {
  return { low: mean - Z_80 * sd, high: mean + Z_80 * sd }
}

export interface BellPoint {
  readonly value: number
  readonly density: number
}

/**
 * Normal density sampled across the axis, for rendering the curve. Real
 * density (integrating to 1), so a narrower forecast genuinely peaks
 * higher — that visual is the point of DESIGN §3.1's risk trade-off, not
 * decoration.
 */
export function bellCurvePoints(
  mean: number,
  sd: number,
  axisMin: number,
  axisMax: number,
  sampleCount: number,
): readonly BellPoint[] {
  if (!(sd > 0)) {
    throw new RangeError(`forecast width must be positive, received ${sd}`)
  }
  if (sampleCount < 2) {
    throw new RangeError(`need at least 2 samples, received ${sampleCount}`)
  }

  const step = (axisMax - axisMin) / (sampleCount - 1)
  const scale = 1 / (sd * Math.sqrt(2 * Math.PI))

  return Array.from({ length: sampleCount }, (_, i) => {
    const value = axisMin + i * step
    const z = (value - mean) / sd
    return { value, density: scale * Math.exp(-0.5 * z * z) }
  })
}
