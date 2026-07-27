import { describe, expect, it } from 'vitest'
import { currentStreak } from './streak.js'

/**
 * DESIGN §7: "Streak — days *called*, not days correct. Showing up is the
 * habit we're reinforcing." DESIGN §13.4: a missed day breaks the streak.
 */
describe('currentStreak', () => {
  it('is zero when nothing has ever been called', () => {
    expect(currentStreak([], '2026-07-27')).toBe(0)
  })

  it('counts a single call made today', () => {
    expect(currentStreak(['2026-07-27'], '2026-07-27')).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(currentStreak(['2026-07-25', '2026-07-26', '2026-07-27'], '2026-07-27')).toBe(3)
  })

  /**
   * The streak is still alive before today's call is made — you haven't
   * missed today until today is over. Counting from yesterday keeps the
   * streak from appearing to reset every morning.
   */
  it('survives today not being called yet', () => {
    expect(currentStreak(['2026-07-25', '2026-07-26'], '2026-07-27')).toBe(2)
  })

  it('breaks on a gap, counting only the run that reaches the present', () => {
    expect(currentStreak(['2026-07-20', '2026-07-21', '2026-07-26', '2026-07-27'], '2026-07-27')).toBe(2)
  })

  it('is zero when the most recent call is too old to still count', () => {
    expect(currentStreak(['2026-07-20', '2026-07-21'], '2026-07-27')).toBe(0)
  })

  it('does not care what order the dates arrive in', () => {
    expect(currentStreak(['2026-07-27', '2026-07-25', '2026-07-26'], '2026-07-27')).toBe(3)
  })

  it('counts a duplicated date once rather than inflating the streak', () => {
    expect(currentStreak(['2026-07-26', '2026-07-26', '2026-07-27'], '2026-07-27')).toBe(2)
  })

  it('spans a month boundary', () => {
    expect(currentStreak(['2026-06-30', '2026-07-01'], '2026-07-01')).toBe(2)
  })

  it('spans a leap day', () => {
    expect(currentStreak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01')).toBe(3)
  })

  it('spans a year boundary', () => {
    expect(currentStreak(['2026-12-31', '2027-01-01'], '2027-01-01')).toBe(2)
  })

  it('ignores dates in the future rather than counting them', () => {
    // A tampered device clock (or a stale record) must not be able to
    // manufacture streak days that haven't happened.
    expect(currentStreak(['2026-07-27', '2026-07-28', '2026-07-29'], '2026-07-27')).toBe(1)
  })
})
