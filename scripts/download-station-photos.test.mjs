import { describe, expect, it } from 'vitest'
import { hasUsableAttribution, photoFileName } from './download-station-photos.mjs'

describe('photoFileName', () => {
  it('derives a stable, filesystem-safe name from the station identity', () => {
    expect(photoFileName('Bujumbura|Burundi')).toBe('bujumbura-burundi.jpg')
  })

  it('strips accents rather than emitting them into a filename', () => {
    expect(photoFileName('Tromsø|Norway')).toBe('tromso-norway.jpg')
    expect(photoFileName('İzmir|Turkey')).toBe('izmir-turkey.jpg')
  })

  it('collapses spaces, commas and apostrophes', () => {
    expect(photoFileName("Sana'a|Yemen")).toBe('sanaa-yemen.jpg')
    expect(photoFileName('Port Moresby|Papua New Guinea')).toBe('port-moresby-papua-new-guinea.jpg')
  })

  /**
   * Names become require() keys in generated code and files on disk, so two
   * different stations must never collapse to the same one.
   */
  it('keeps same-named cities in different countries distinct', () => {
    expect(photoFileName('Córdoba|Spain')).not.toBe(photoFileName('Córdoba|Argentina'))
  })

  it('produces only lowercase, digits, and hyphens', () => {
    expect(photoFileName("Nuku'alofa|Tonga")).toMatch(/^[a-z0-9-]+\.jpg$/)
    expect(photoFileName('Ürümqi|China')).toMatch(/^[a-z0-9-]+\.jpg$/)
  })
})

describe('hasUsableAttribution', () => {
  /**
   * CC BY and CC BY-SA REQUIRE naming the author. An image we cannot
   * attribute cannot be shipped, however good it looks — so the pipeline
   * drops it rather than displaying it uncredited.
   */
  it('accepts an entry with an author and a licence', () => {
    expect(hasUsableAttribution({ artist: 'SteveRwanda', licence: 'CC BY-SA 3.0' })).toBe(true)
  })

  it('rejects a CC BY-SA entry with no author', () => {
    expect(hasUsableAttribution({ licence: 'CC BY-SA 3.0' })).toBe(false)
  })

  it('rejects an entry with a blank author', () => {
    expect(hasUsableAttribution({ artist: '   ', licence: 'CC BY 2.0' })).toBe(false)
  })

  /**
   * Public domain and CC0 impose no attribution requirement, so they are
   * usable even when Commons records no author.
   */
  it('accepts public-domain and CC0 entries without an author', () => {
    expect(hasUsableAttribution({ licence: 'Public domain' })).toBe(true)
    expect(hasUsableAttribution({ licence: 'CC0' })).toBe(true)
  })

  /**
   * A bare "Attribution" licence is a custom, unreviewed term rather than a
   * standard CC grant — not something to ship on an assumption.
   */
  it('rejects a vague non-standard licence', () => {
    expect(hasUsableAttribution({ artist: 'Someone', licence: 'Attribution' })).toBe(false)
  })

  it('rejects an entry with no licence at all', () => {
    expect(hasUsableAttribution({ artist: 'Someone' })).toBe(false)
  })
})
