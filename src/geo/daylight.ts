import { toRadians } from './coordinates.js'

/**
 * Day length from latitude and date, using the CBM model
 * (Forsythe et al. 1995, "A model comparison for daylength as a function of
 * latitude and day of year"). Accurate to about a minute, needs no ephemeris,
 * and is a few lines of arithmetic — so the Chart can show it offline.
 */

/** Sun altitude at sunrise/sunset, in degrees below the horizon, including refraction. */
const DAYLIGHT_ANGLE_DEG = 0.8333

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Day of year, 1-based, leap-aware. */
export function dayOfYear(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`date must be formatted YYYY-MM-DD, received "${date}"`)
  }
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const asDate = new Date(Date.UTC(year, month - 1, day))
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    throw new RangeError(`date is not a real calendar date: "${date}"`)
  }

  const startOfYear = Date.UTC(year, 0, 1)
  return Math.round((asDate.getTime() - startOfYear) / 86_400_000) + 1
}

export function dayLengthHours(latitudeDeg: number, dayOfYearNumber: number): number {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new RangeError(`latitude must be within [-90, 90], received ${latitudeDeg}`)
  }
  if (!Number.isInteger(dayOfYearNumber) || dayOfYearNumber < 1 || dayOfYearNumber > 366) {
    throw new RangeError(`day of year must be an integer within [1, 366], received ${dayOfYearNumber}`)
  }

  // Earth's position on its orbit, then the sun's declination from it.
  const revolutionAngle =
    0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.00860 * (dayOfYearNumber - 186)))
  const declination = Math.asin(0.39795 * Math.cos(revolutionAngle))

  const latitude = toRadians(latitudeDeg)
  const hourAngleCosine =
    (Math.sin(toRadians(DAYLIGHT_ANGLE_DEG)) + Math.sin(latitude) * Math.sin(declination)) /
    (Math.cos(latitude) * Math.cos(declination))

  // Outside [-1, 1] the sun never crosses the horizon. Note the direction:
  // D = 24 − (24/π)·acos(ratio), so ratio = 1 gives acos = 0 and a 24-hour day,
  // while ratio = −1 gives acos = π and no day at all. Easy to invert; the
  // polar tests exist to catch exactly that.
  if (hourAngleCosine >= 1) return 24
  if (hourAngleCosine <= -1) return 0

  return 24 - (24 / Math.PI) * Math.acos(hourAngleCosine)
}
