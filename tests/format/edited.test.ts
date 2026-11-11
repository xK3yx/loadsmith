// Cross-check against the old Python prototype, which patched fixed byte
// offsets in 1.4.4.9 saves. Each "-edited" save is the prototype's output for
// the matching original. If our field map is right, the parsed models differ
// only in fields a loadout touches, never in appearance, stats or Journey data.

import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadPlayer } from '../../src/format/index.ts'
import { LOCAL_DIR, diffPaths, readSave } from './saves.ts'

const LOADOUT_FIELDS = new Set([
  'unlockedBiomeTorches',
  'usingBiomeTorches',
  'ateArtisanBread',
  'usedAegisCrystal',
  'usedAegisFruit',
  'usedArcaneCrystal',
  'usedGalaxyPearl',
  'usedGummyWorm',
  'usedAmbrosia',
  'armor',
  'inventory',
  'bank1',
  'bank2',
  'bank3',
  'bank4',
])

// Every "<name>-edited.plr" in tests/local with a matching "<name>.plr".
const pairs = (existsSync(LOCAL_DIR) ? readdirSync(LOCAL_DIR) : [])
  .filter((f) => f.endsWith('-edited.plr'))
  .map((f) => f.slice(0, -'-edited.plr'.length))
  .sort()
  .map((base) => ({
    base,
    original: readSave(LOCAL_DIR, `${base}.plr`),
    edited: readSave(LOCAL_DIR, `${base}-edited.plr`),
  }))
  .filter((p) => p.original && p.edited)

describe.skipIf(pairs.length === 0)('prototype-edited saves', () => {
  describe.each(pairs)('$base', ({ original, edited }) => {
    it('differs only in loadout fields', async () => {
      const a = await loadPlayer(original!)
      const b = await loadPlayer(edited!)
      const changed = diffPaths(a, b)
      expect(changed.length).toBeGreaterThan(0)
      const unexpected = changed.filter((path) => !LOADOUT_FIELDS.has(path.split('.')[0]!))
      expect(unexpected).toEqual([])
    })

    it('has every booster applied', async () => {
      const b = await loadPlayer(edited!)
      expect([
        b.usedAegisCrystal,
        b.usedAegisFruit,
        b.usedArcaneCrystal,
        b.usedGalaxyPearl,
        b.usedGummyWorm,
        b.usedAmbrosia,
        b.ateArtisanBread,
        b.unlockedBiomeTorches,
      ]).toEqual(new Array(8).fill(true))
    })
  })
})
