import { describe, expect, it } from 'vitest'
import { forecastMultiModelFixture } from './fixtures.js'

/**
 * Regression test for a review finding: the multi-model fixture's 48-hour
 * time array was built via `i % 24` for the hour with a fixed literal date,
 * so hours 24-47 duplicated hours 0-23 instead of rolling over to the next
 * calendar day the way a real 48-hour forecast response does.
 */
describe('forecastMultiModelFixture', () => {
  it('has a 48-element time array with 48 unique timestamps', () => {
    const time = forecastMultiModelFixture.hourly.time
    expect(time).toHaveLength(48)
    expect(new Set(time).size).toBe(48)
  })

  it('rolls the date over from 2026-07-26 to 2026-07-27 at hour 24', () => {
    const time = forecastMultiModelFixture.hourly.time
    expect(time[0]).toBe('2026-07-26T00:00')
    expect(time[23]).toBe('2026-07-26T23:00')
    expect(time[24]).toBe('2026-07-27T00:00')
    expect(time[47]).toBe('2026-07-27T23:00')
  })

  it('is monotonically increasing', () => {
    const time = forecastMultiModelFixture.hourly.time
    for (let i = 1; i < time.length; i++) {
      expect(new Date(time[i]! + ':00Z').getTime()).toBeGreaterThan(
        new Date(time[i - 1]! + ':00Z').getTime(),
      )
    }
  })

  it('keeps every model series the same length as the time array', () => {
    const { time, ...series } = forecastMultiModelFixture.hourly
    for (const values of Object.values(series)) {
      expect(values).toHaveLength(time.length)
    }
  })
})
