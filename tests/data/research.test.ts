// Research amounts against real Journey saves. A save stores, for each
// researched item, how many were sacrificed. In a fully researched entry that
// equals the required amount, so the table must never ask for less than the
// game stored, and must match the fully researched entries.
//
// Known differences (left for the in-game check, see PLAN.md):
// - Life Crystal: saves store 13, the wiki says 10. Either the game keeps
//   sacrifices beyond the requirement, or the wiki is out of date.

import { describe, expect, it } from 'vitest'
import { itemByKey, maxItemId, researchAmount } from '../../src/data/index.ts'
import { loadPlayer } from '../../src/format/index.ts'
import { findSaves } from '../format/saves.ts'

const KNOWN_ABOVE_TABLE = new Set(['LifeCrystal'])

const journeySaves = (
  await Promise.all(findSaves().map(async (s) => ({ save: s, p: await loadPlayer(s.bytes) })))
).filter(({ p }) => p.difficulty === 3)

describe.skipIf(journeySaves.length === 0)('research amounts vs real Journey saves', () => {
  describe.each(journeySaves)('$save.label', ({ p }) => {
    it('has a table amount for every researched item', () => {
      const missing = p.creativeSacrifices.filter((s) => !researchAmount(s.key, p.version)).map((s) => s.key)
      expect(missing).toEqual([])
    })

    it('never stores more than the table, apart from known differences', () => {
      const above = p.creativeSacrifices
        .filter((s) => !KNOWN_ABOVE_TABLE.has(s.key))
        .filter((s) => s.value > (researchAmount(s.key, p.version)?.amount ?? Infinity))
        .map((s) => `${s.key}: save ${s.value}, table ${researchAmount(s.key, p.version)?.amount}`)
      expect(above).toEqual([])
    })

    it('matches the table for fully researched entries', () => {
      let equal = 0
      let partial = 0
      for (const s of p.creativeSacrifices) {
        const amount = researchAmount(s.key, p.version)?.amount
        if (amount === undefined || KNOWN_ABOVE_TABLE.has(s.key)) continue
        if (s.value === amount) equal++
        else partial++
      }
      // Report so a change in the wiki data shows up in the test output.
      console.log(`research: ${equal} entries match the table, ${partial} partial`)
      expect(equal).toBeGreaterThan(0)
    })

    it('only stores items that exist in the save version', () => {
      const limit = maxItemId(p.version)
      expect(p.creativeSacrifices.filter((s) => (itemByKey(s.key)?.id ?? Infinity) > limit)).toEqual([])
    })
  })
})
