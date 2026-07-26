/**
 * Standard normal helpers.
 *
 * The usual Abramowitz & Stegun 7.1.26 approximation for erf is accurate to
 * only ~1.5e-7 and, worse, is not exact at zero — which would make the CRPS
 * value at the distribution mean subtly wrong. We use the incomplete gamma
 * function instead (erf(x) = P(1/2, x²)), which is exact at zero and good to
 * near machine precision everywhere else.
 */

const LN_GAMMA_HALF = 0.5723649429247001 // ln Γ(1/2) = ln √π
const EPSILON = 1e-16
const TINY = 1e-300

/**
 * Both routines below iterate until a convergence criterion is met, with an
 * iteration cap only as a guard against a non-terminating loop. If the cap is
 * ever actually reached the result would be silently inaccurate, which for erf
 * means a quietly wrong CRPS and no other symptom — so it throws instead.
 * gaussian.test.ts exercises the full input range to confirm these caps are
 * comfortably sufficient in practice.
 */
const MAX_SERIES_TERMS = 200
const MAX_FRACTION_DEPTH = 300

/** Lower regularised incomplete gamma P(1/2, x), by series. Converges fast for small x. */
function lowerGammaHalf(x: number): number {
  let ap = 0.5
  let del = 1 / ap
  let sum = del
  for (let n = 0; n < MAX_SERIES_TERMS; n++) {
    ap += 1
    del *= x / ap
    sum += del
    if (Math.abs(del) < Math.abs(sum) * EPSILON) {
      return sum * Math.exp(-x + 0.5 * Math.log(x) - LN_GAMMA_HALF)
    }
  }
  throw new Error(
    `incomplete gamma series did not converge for x=${x} within ${MAX_SERIES_TERMS} terms`,
  )
}

/** Upper regularised incomplete gamma Q(1/2, x), by continued fraction. Better for large x. */
function upperGammaHalf(x: number): number {
  let b = x + 0.5
  let c = 1 / TINY
  let d = 1 / b
  let h = d
  for (let i = 1; i <= MAX_FRACTION_DEPTH; i++) {
    const an = -i * (i - 0.5)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPSILON) {
      return Math.exp(-x + 0.5 * Math.log(x) - LN_GAMMA_HALF) * h
    }
  }
  throw new Error(
    `incomplete gamma continued fraction did not converge for x=${x} within ${MAX_FRACTION_DEPTH} iterations`,
  )
}

export function erf(x: number): number {
  if (x === 0) return 0
  const squared = x * x
  // exp(-x²) underflows past ~27; erf is 1 to within double precision long before that
  if (squared > 200) return x > 0 ? 1 : -1
  const magnitude = squared < 1.5 ? lowerGammaHalf(squared) : 1 - upperGammaHalf(squared)
  return x < 0 ? -magnitude : magnitude
}

const SQRT_2 = Math.SQRT2
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI)

export function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / SQRT_2))
}

export function standardNormalPdf(z: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * z * z)
}
