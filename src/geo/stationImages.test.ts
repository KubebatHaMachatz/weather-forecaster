import { describe, expect, it } from 'vitest'
import { stationImageKey, stationImageFor, type StationImage } from './stationImages.js'

const BUJUMBURA = { name: 'Bujumbura', country: 'Burundi' }

const IMAGE: StationImage = {
  url: 'https://upload.wikimedia.org/example.jpg',
  sourcePage: 'https://en.wikipedia.org/wiki/Bujumbura',
  licence: 'CC BY-SA 3.0',
  artist: 'SteveRwanda',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
}

describe('stationImageKey', () => {
  it('keys on name and country, matching the identity daily.ts hashes on', () => {
    expect(stationImageKey(BUJUMBURA)).toBe('Bujumbura|Burundi')
  })

  /**
   * The station list is guaranteed to have no duplicate (name, country)
   * pairs — validateStationList enforces exactly that — so a separator can
   * never collide two real stations. Pinned as a test so the key format
   * can't drift away from the manifest the build script writes.
   */
  it('distinguishes same-named cities in different countries', () => {
    expect(stationImageKey({ name: 'Córdoba', country: 'Spain' })).not.toBe(
      stationImageKey({ name: 'Córdoba', country: 'Argentina' }),
    )
  })
})

describe('stationImageFor', () => {
  const manifest = { 'Bujumbura|Burundi': IMAGE }

  it('returns the image for a station present in the manifest', () => {
    expect(stationImageFor(manifest, BUJUMBURA)).toEqual(IMAGE)
  })

  /**
   * Not every station has a verified, licensed photo — the build script
   * deliberately drops any it can't attribute. Callers must get null and
   * render a fallback, never a broken image.
   */
  it('returns null for a station with no image rather than undefined', () => {
    expect(stationImageFor(manifest, { name: 'Nowhere', country: 'Atlantis' })).toBeNull()
  })

  it('returns null for an entry that is present but malformed', () => {
    const broken = { 'X|Y': { licence: 'CC0' } } as unknown as Record<string, StationImage>
    expect(stationImageFor(broken, { name: 'X', country: 'Y' })).toBeNull()
  })

  it('ignores a prototype-chain key rather than treating it as an image', () => {
    // "constructor" et al. are inherited on a plain object literal; a naive
    // `manifest[key]` lookup would return a function here.
    expect(stationImageFor(manifest, { name: 'constructor', country: '' })).toBeNull()
    expect(stationImageFor(manifest, { name: 'toString', country: '' })).toBeNull()
  })
})
