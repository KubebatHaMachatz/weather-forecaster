import { crpsGaussian } from '../scoring/crps.js'
import { brier } from '../scoring/brier.js'
import { skillScore } from '../scoring/skill.js'
import type { StatedForecast } from '../history/commitment.js'

/**
 * What actually happened, in the shape the question asked for: a value for
 * distribution questions, an occurrence for probability ones.
 */
export type Truth =
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'occurred'; readonly occurred: boolean }

export interface Climatology {
  readonly mean: number
  readonly sd: number
}

/**
 * DESIGN §3.2: "Committing at 50% is always allowed and always scores zero
 * net." That only holds if 50% is precisely the baseline probability
 * questions are scored against, so this constant IS that guarantee.
 */
export const CLIMATOLOGY_PROBABILITY = 0.5

export interface CallScore {
  /** The raw negatively-oriented score — CRPS or Brier. Lower is better. */
  readonly score: number
  /** The same score for the climatology baseline. */
  readonly baselineScore: number
  /** 1 perfect, 0 ties climatology, negative means climatology won. */
  readonly skill: number
}

/**
 * Scores a committed forecast against the truth, using whichever proper
 * scoring rule the answer form calls for (DESIGN §4).
 *
 * The player's Bell is a STATED distribution, not an ensemble sample, so it
 * goes to the Gaussian closed form — crpsFair is reserved for
 * ensemble-derived baselines and would be wrong here.
 */
export function scoreAgainstTruth(
  forecast: StatedForecast,
  truth: Truth,
  climatology: Climatology,
): CallScore {
  if (forecast.kind === 'distribution') {
    if (truth.kind !== 'value') {
      throw new TypeError('a distribution forecast can only be scored against a numeric outcome')
    }
    const score = crpsGaussian(forecast.mean, forecast.sd, truth.value)
    const baselineScore = crpsGaussian(climatology.mean, climatology.sd, truth.value)
    return { score, baselineScore, skill: skillScore(score, baselineScore) }
  }

  if (truth.kind !== 'occurred') {
    throw new TypeError('a probability forecast can only be scored against a boolean outcome')
  }
  const score = brier(forecast.probability, truth.occurred)
  const baselineScore = brier(CLIMATOLOGY_PROBABILITY, truth.occurred)
  return { score, baselineScore, skill: skillScore(score, baselineScore) }
}
