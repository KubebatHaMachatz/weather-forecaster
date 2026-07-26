import { describe, expect, it } from 'vitest'
import { countryMatches, normalise, pickBest } from './build-stations.mjs'

/**
 * scripts/build-stations.mjs has already produced several real, subtle bugs
 * caught only through ad-hoc manual verification during development (Alert
 * vs Alert Bay, Washington vs Washington D.C., territories with null
 * country fields) — reason enough to give its pure logic proper test
 * coverage rather than leaving it as untested build tooling.
 */

describe('normalise', () => {
  it('strips NFD-decomposing accents', () => {
    expect(normalise('Reykjavík')).toBe(normalise('Reykjavik'))
    expect(normalise('São Paulo')).toBe(normalise('Sao Paulo'))
  })

  it('strips apostrophe variants', () => {
    expect(normalise("Nuku'alofa")).toBe(normalise('Nukuʻalofa'))
  })

  /**
   * Regression test for a review finding: NFD normalisation only strips
   * accents that decompose into a base letter + combining mark (é → e +
   * combining-acute). Several Nordic/Germanic letters are their own
   * distinct code points with no such decomposition — ø, Æ, Å, ß — so they
   * passed through unstripped, and an ASCII-transliterated form of a name
   * using them would wrongly fail the exact-match check.
   */
  it('folds letters that do not decompose under NFD', () => {
    expect(normalise('Tromsø')).toBe(normalise('Tromso'))
    expect(normalise('Ærø')).toBe(normalise('AEro'))
    expect(normalise('Åre')).toBe(normalise('Are'))
    expect(normalise('Straße')).toBe(normalise('Strasse'))
  })
})

describe('countryMatches', () => {
  it('matches on country name', () => {
    expect(countryMatches('Chile', { country: 'Chile', country_code: 'CL' })).toBe(true)
  })

  it('matches a territory on country_code when country is null', () => {
    expect(countryMatches('Greenland', { country: null, country_code: 'GL' })).toBe(true)
  })

  it('does not match an unrelated country', () => {
    expect(countryMatches('Chile', { country: 'Peru', country_code: 'PE' })).toBe(false)
  })
})

describe('pickBest', () => {
  it('prefers the national capital across the whole pool, not just exact-name matches', () => {
    const results = [
      { name: 'Washington', country: 'United States', country_code: 'US', feature_code: 'PPLA2', population: 13497 },
      { name: 'Washington D.C.', country: 'United States', country_code: 'US', feature_code: 'PPLC', population: 689545 },
    ]
    const { record } = pickBest(results, 'Washington', 'United States')
    expect(record.feature_code).toBe('PPLC')
  })

  it('prefers an exact name match over a differently-named, more populous place', () => {
    const results = [
      { name: 'Alert Bay', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: 449 },
      { name: 'Alert', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null },
    ]
    const { record } = pickBest(results, 'Alert', 'Canada')
    expect(record.name).toBe('Alert')
  })

  /**
   * Regression test for a review finding: when no candidate is a capital,
   * no candidate is an exact name match, AND every candidate has
   * population: null, the population-sort tiebreak compares 0 to 0 for
   * every pair. Because Array.prototype.sort is stable, this silently
   * returns whichever candidate the API happened to list first — with no
   * diagnostic, since countryMatched is still true. pickBest must surface
   * this as an explicit ambiguous flag rather than staying silent.
   */
  it('flags an ambiguous pick when no capital, no exact match, and no population data exist to break the tie', () => {
    const results = [
      { name: 'Smallville', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null },
      { name: 'Otherville', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null },
    ]
    const { ambiguous } = pickBest(results, 'Query That Matches Neither', 'Canada')
    expect(ambiguous).toBe(true)
  })

  it('does not flag ambiguous when an exact match or capital resolves the tie', () => {
    const results = [
      { name: 'Alert', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null },
      { name: 'Alert Bay', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null },
    ]
    const { ambiguous } = pickBest(results, 'Alert', 'Canada')
    expect(ambiguous).toBe(false)
  })

  it('does not flag ambiguous when only one country-matching candidate exists', () => {
    const results = [{ name: 'Solo', country: 'Canada', country_code: 'CA', feature_code: 'PPL', population: null }]
    const { ambiguous } = pickBest(results, 'Solo', 'Canada')
    expect(ambiguous).toBe(false)
  })
})
