/**
 * The real range of standing UTC offsets — shared so src/geo/stationData.ts
 * (strict content validation) and src/scoring/resolution.ts (a defensive
 * runtime assertion, which adds its own explicit slack on top) can't drift
 * out of sync the way they previously did with two independently-typed
 * copies of the same fact.
 */
export const REAL_MIN_UTC_OFFSET_SECONDS = -12 * 3600 // Baker Island
export const REAL_MAX_UTC_OFFSET_SECONDS = 14 * 3600 // Kiribati's Line Islands
