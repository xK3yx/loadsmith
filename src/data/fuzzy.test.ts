import { describe, expect, it } from 'vitest'
import { editDistance, normalizeName, similarity, suggest } from './fuzzy.ts'

describe('fuzzy matching', () => {
  it('normalizes case, punctuation, spaces, quotes and accents', () => {
    expect(normalizeName("  Jack 'O Lantern Launcher ")).toBe('jackolanternlauncher')
    expect(normalizeName('S.D.M.G.')).toBe('sdmg')
    expect(normalizeName('True Night’s Edge')).toBe('truenightsedge')
    expect(normalizeName('Pokéball')).toBe('pokeball')
  })

  it('counts edits including adjacent swaps', () => {
    expect(editDistance('zenith', 'zenith')).toBe(0)
    expect(editDistance('zenit', 'zenith')).toBe(1)
    expect(editDistance('zneith', 'zenith')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
  })

  it('ignores word order', () => {
    expect(similarity('Staff Stardust Dragon', 'Stardust Dragon Staff')).toBe(1)
  })

  it('ranks, dedupes and limits suggestions', () => {
    const out = suggest('Zenit', [
      { value: 1, name: 'Zenith' },
      { value: 2, name: 'Zenith' },
      { value: 3, name: 'Zephyr Fish' },
      { value: 4, name: 'Dirt Block' },
    ])
    expect(out.map((s) => s.name)).toEqual(['Zenith'])
  })
})
