/**
 * The personal calibration curve (DESIGN §7.1): "when you say 70%, it
 * happens 52% of the time — you are overconfident in the 60–80% band."
 *
 * A player's history of Dial answers — a stated probability and whether the
 * event occurred — is binned into equal-width probability ranges. Comparing
 * each bin's mean stated probability against its observed frequency is what
 * the UI plots as the reliability diagram.
 */

export interface CalibrationObservation {
  readonly probability: number
  readonly occurred: boolean
}

export interface CalibrationBin {
  readonly binStart: number
  readonly binEnd: number
  readonly count: number
  /** Null rather than NaN when the bin has no observations — see reliability.test.ts. */
  readonly meanStatedProbability: number | null
  readonly observedFrequency: number | null
}

export function reliabilityDiagram(
  observations: readonly CalibrationObservation[],
  binCount = 10,
): CalibrationBin[] {
  if (!Number.isInteger(binCount) || binCount <= 0) {
    throw new RangeError(`bin count must be a positive integer, received ${binCount}`)
  }

  const probabilitySums = new Array<number>(binCount).fill(0)
  const occurredCounts = new Array<number>(binCount).fill(0)
  const counts = new Array<number>(binCount).fill(0)

  for (const { probability, occurred } of observations) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError(`probability must be within [0, 1], received ${probability}`)
    }
    // Exactly 1.0 would floor to an out-of-range index (== binCount); clamp
    // it into the last bin rather than losing the observation.
    const index = Math.min(Math.floor(probability * binCount), binCount - 1)
    // Non-null: index is always within [0, binCount), and all three arrays
    // are pre-filled to that exact length above.
    probabilitySums[index] = probabilitySums[index]! + probability
    if (occurred) occurredCounts[index] = occurredCounts[index]! + 1
    counts[index] = counts[index]! + 1
  }

  return Array.from({ length: binCount }, (_, i) => {
    const count = counts[i]!
    return {
      binStart: i / binCount,
      binEnd: (i + 1) / binCount,
      count,
      meanStatedProbability: count === 0 ? null : probabilitySums[i]! / count,
      observedFrequency: count === 0 ? null : occurredCounts[i]! / count,
    }
  })
}
