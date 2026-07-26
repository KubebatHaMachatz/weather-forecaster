import { describe, expect, it } from 'vitest'
import { REAL_MAX_UTC_OFFSET_SECONDS, REAL_MIN_UTC_OFFSET_SECONDS } from './utcOffsetRange.js'

/**
 * Regression test for a review finding: src/geo/stationData.ts and
 * src/scoring/resolution.ts each independently defined "the range of real
 * standing UTC offsets" with different numeric bounds and no shared
 * constant — a maintainer updating one had no signal the other existed.
 */
describe('REAL_MIN/MAX_UTC_OFFSET_SECONDS', () => {
  it('spans UTC-12 (Baker Island) to UTC+14 (Kiribati)', () => {
    expect(REAL_MIN_UTC_OFFSET_SECONDS).toBe(-12 * 3600)
    expect(REAL_MAX_UTC_OFFSET_SECONDS).toBe(14 * 3600)
  })
})
