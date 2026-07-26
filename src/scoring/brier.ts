/**
 * Brier score for a binary forecast — the scoring path for the Dial.
 *
 * Like CRPS, it is a proper scoring rule: expected score is minimised by
 * stating your true belief. Saying 50% costs a flat 0.25 whatever happens,
 * which is what makes honest ignorance safe and cheap.
 *
 * Lower is better. Zero is perfect, one is maximally wrong.
 */
export function brier(probability: number, occurred: boolean): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError(`probability must be within [0, 1], received ${probability}`)
  }
  return (probability - (occurred ? 1 : 0)) ** 2
}
