/**
 * Skill score — how much better than a baseline a forecast was.
 *
 *   SS = 1 − score / referenceScore
 *
 * 1 is perfect, 0 ties the baseline, negative means the baseline won. This is
 * how operational forecasters are actually judged, and the baseline chosen
 * changes the meaning entirely: beating climatology means you know something
 * about tomorrow, beating persistence means you know something about change.
 *
 * Takes any *negatively oriented* score (lower-is-better), i.e. CRPS or Brier.
 */
export function skillScore(score: number, referenceScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(referenceScore)) {
    throw new TypeError(
      `skill score needs finite inputs, received score=${score} reference=${referenceScore}`,
    )
  }
  if (score < 0 || referenceScore < 0) {
    throw new RangeError(
      `scores must not be negative, received score=${score} reference=${referenceScore}`,
    )
  }

  // An unbeatable baseline. Returning NaN here would silently poison the
  // rolling 30-day average, so the loss is made explicit instead.
  if (referenceScore === 0) {
    return score === 0 ? 0 : Number.NEGATIVE_INFINITY
  }

  return 1 - score / referenceScore
}
