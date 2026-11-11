// Applies loadouts to every real save and checks the result survives a full
// save/load round trip, adds up (nothing lost or invented), and puts things
// where the loadout says.

import { describe, expect, it } from 'vitest'
import { MAX_SUPPORTED_VERSION, itemById, itemKind, lookupItem, maxStackFor } from '../../src/data/index.ts'
import { type PlayerCharacter, loadPlayer, parsePlayer, savePlayer, serializePlayer } from '../../src/format/index.ts'
import { type Loadout, applyLoadout, parseLoadout, parseLoadoutText } from '../../src/loadout/index.ts'
import { findSaves } from '../format/saves.ts'
import { conservationErrors, planExampleText } from './helpers.ts'

const saves = findSaves()

/** The PLAN.md example, adjusted to what the save's version and mode allow. */
function fullLoadout(p: PlayerCharacter): Loadout {
  const r = parseLoadoutText(planExampleText())
  if (!r.ok) throw new Error('PLAN.md example does not parse')
  const l = structuredClone(r.loadout)
  const is145 = p.version >= 315
  // Fabled is a 1.4.5 modifier; Ruthless works on summon staffs in every version.
  l.weapons = [
    { item: 'Zenith', prefix: 'Legendary', favorite: true },
    { item: 'Terraprisma', prefix: is145 ? 'Fabled' : 'Ruthless' },
  ]
  l.items = [
    { item: 'Super Healing Potion', stack: 9999, favorite: true },
    { item: 'Rod of Harmony' },
  ]
  l.storage!.safe = { mode: 'replace', items: [{ item: 'S.D.M.G.', prefix: 'Unreal' }] }
  // Replace keeps this test predictable; add mode on a real save is tested below.
  l.storage!.piggy_bank!.mode = 'replace'
  if (p.difficulty !== 3) delete l.character!.journey_research
  return l
}

async function roundTrip(p: PlayerCharacter): Promise<PlayerCharacter> {
  return loadPlayer(await savePlayer(p))
}

function apply(p: PlayerCharacter, l: Loadout) {
  const result = applyLoadout(p, l)
  if (!result.ok) throw new Error(`apply failed:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`)
  return result
}

describe.skipIf(saves.length === 0)('applyLoadout on real saves', () => {
  describe.each(saves)('$label', (save) => {
    it('applies the full PLAN.md loadout, round-trips, and adds up', async () => {
      const before = await loadPlayer(save.bytes)
      const result = apply(before, fullLoadout(before))
      const after = result.character

      expect(conservationErrors(before, after, result.preview)).toEqual([])
      expect(await roundTrip(after)).toEqual(after)
      expect(parsePlayer(serializePlayer(after))).toEqual(after)
      expect(before).toEqual(await loadPlayer(save.bytes)) // input untouched

      const id = (name: string) => {
        const r = lookupItem(name, before.version)
        if (!r.ok) throw new Error(name)
        return r.item.id
      }
      // Armor and accessories of loadout 1 (the active one in these saves).
      expect(after.armor.slice(0, 3).map((i) => i.netId)).toEqual(
        ['Solar Flare Helmet', 'Solar Flare Breastplate', 'Solar Flare Leggings'].map(id),
      )
      expect(after.armor.slice(3, 10).map((i) => i.netId)).toEqual([id('Celestial Starboard'), id('Soaring Insignia'), 0, 0, 0, 0, 0])
      // Loadouts 2 and 3 are stored separately.
      expect(after.loadouts[1]!.armor.slice(0, 3).map((i) => i.netId)).toEqual(['Vortex Helmet', 'Vortex Breastplate', 'Vortex Leggings'].map(id))
      expect(after.loadouts[2]!.armor.slice(0, 3).map((i) => i.netId)).toEqual(['Nebula Helmet', 'Nebula Breastplate', 'Nebula Leggings'].map(id))
      // Hotbar order, favorite, misc equipment, coins, ammo.
      expect(after.inventory.slice(0, 4).map((i) => i.netId)).toEqual(
        ['Zenith', 'Terraprisma', 'Super Healing Potion', 'Rod of Harmony'].map(id),
      )
      expect(after.inventory[0]!.favorited).toBe(true)
      expect(after.miscEquips.map((i) => i.netId)).toEqual(
        ['Bone Rattle', 'Fairy Bell', 'Mechanical Cart', 'Cosmic Car Key', 'Lunar Hook'].map(id),
      )
      expect(after.inventory[50]).toMatchObject({ netId: id('Platinum Coin'), stack: 50 })
      expect(after.inventory[54]).toMatchObject({ netId: id('Chlorophyte Bullet'), stack: 9999 })
      // Safe and piggy bank were replaced; their old contents are listed as removed.
      expect(after.bank2.filter((i) => i.netId !== 0).map((i) => i.netId)).toEqual([id('S.D.M.G.')])
      const oldContents = [...before.bank1, ...before.bank2].filter((i) => i.netId !== 0).length
      expect(result.preview.removed.length).toBe(oldContents)
      // Character.
      expect(after.statLifeMax).toBe(500)
      expect(after.statManaMax).toBe(200)
      expect(after.extraAccessory).toBe(true)
      expect(after.superCartFlags & 3).toBe(3)
      expect([after.usedAegisCrystal, after.usedGalaxyPearl, after.ateArtisanBread, after.unlockedBiomeTorches]).toEqual([true, true, true, true])
      expect(result.preview.unsupported).toEqual([
        { recommendation: "Get the Peddler's Satchel", reason: "World upgrade; can't be set from a character file" },
      ])
      // Saves older than the newest supported version get the "load and save in-game first" message, first.
      expect(result.preview.warnings[0]?.path === 'save.version').toBe(before.version < MAX_SUPPORTED_VERSION)
      if (before.difficulty === 3) {
        expect(result.preview.research?.unverified).toBe(true)
        expect(result.preview.warnings.some((w) => w.path === 'character.journey_research')).toBe(true)
      }
    })

    it('re-equipping the same accessories in another order adds nothing', async () => {
      const before = await loadPlayer(save.bytes)
      const current = before.armor.slice(3, 10).filter((i) => i.netId !== 0)
      const l = parseLoadout({
        schema: 'loadsmith/1',
        accessories: [...current].reverse().map((i) => ({ item: i.netId, prefix: i.prefix })),
      })
      if (!l.ok) throw new Error('parse')
      const result = apply(before, l.loadout)
      expect(result.preview.added).toEqual([])
      expect(result.preview.moved).toEqual([])
      expect(conservationErrors(before, result.character, result.preview)).toEqual([])
      expect(await roundTrip(result.character)).toEqual(result.character)
    })

    it('writes loadout 1 to its stored slot when loadout 2 is active', async () => {
      const before = await loadPlayer(save.bytes)
      before.currentLoadoutIndex = 1
      const active = structuredClone(before.armor)
      const l = parseLoadout({ schema: 'loadsmith/1', loadouts: { '1': { armor: ['Solar Flare Helmet', null, null] } } })
      if (!l.ok) throw new Error('parse')
      const result = apply(before, l.loadout)
      const helmet = lookupItem('Solar Flare Helmet', before.version)
      expect(result.character.loadouts[0]!.armor[0]!.netId).toBe(helmet.ok && helmet.item.id)
      expect(result.character.armor).toEqual(active) // active gear (loadout 2) untouched
      expect(await roundTrip(result.character)).toEqual(result.character)
    })

    it('add-mode storage overflows into the next space and adds up', async () => {
      const before = await loadPlayer(save.bytes)
      const l = parseLoadout({ schema: 'loadsmith/1', storage: { piggy_bank: { items: ['Zenith', 'Terraprisma', 'S.D.M.G.'] } } })
      if (!l.ok) throw new Error('parse')
      const free = [before.bank1, before.bank2, before.bank3, before.bank4].flat().filter((i) => i.netId === 0).length
      const result = applyLoadout(before, l.loadout)
      if (free < 3) {
        expect(result.ok).toBe(false)
        return
      }
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('; '))
      const piggyFree = before.bank1.filter((i) => i.netId === 0).length
      expect(result.preview.redirected.length).toBe(Math.max(0, 3 - piggyFree))
      expect(conservationErrors(before, result.character, result.preview)).toEqual([])
      expect(await roundTrip(result.character)).toEqual(result.character)
    })

    it('moves owned weapons and accessories into place instead of adding copies', async () => {
      const before = await loadPlayer(save.bytes)
      const owned = (k: 'weapon' | 'accessory') =>
        [...before.inventory.slice(10, 50), ...before.bank1, ...before.bank2, ...before.bank3, ...before.bank4].find((i) => {
          const rec = i.netId ? itemById(i.netId) : undefined
          return rec && itemKind(rec, before.version).kind === k && maxStackFor(rec).max === 1
        })
      const weapon = owned('weapon')
      const accessory = owned('accessory')
      if (!weapon || !accessory) return
      const l = parseLoadout({
        schema: 'loadsmith/1',
        weapons: [{ item: weapon.netId }],
        accessories: [{ item: accessory.netId }],
      })
      if (!l.ok) throw new Error('parse')
      const result = apply(before, l.loadout)
      expect(result.preview.added.filter((a) => a.id === weapon.netId || a.id === accessory.netId)).toEqual([])
      expect(result.character.inventory[0]!.netId).toBe(weapon.netId)
      expect(result.character.armor[3]!.netId).toBe(accessory.netId)
      expect(conservationErrors(before, result.character, result.preview)).toEqual([])
      expect(await roundTrip(result.character)).toEqual(result.character)
    })

    it('best_modifiers reforges everything owned, adds up, and is stable', async () => {
      const before = await loadPlayer(save.bytes)
      const l = parseLoadout({ schema: 'loadsmith/1', best_modifiers: true })
      if (!l.ok) throw new Error('parse')
      const result = apply(before, l.loadout)
      expect(result.preview.added).toEqual([])
      expect(result.preview.reforged.every((r) => r.reason === 'best' && r.item.prefix !== r.fromPrefix)).toBe(true)
      expect(result.preview.reforged.length).toBe(result.preview.changes.length)
      expect(conservationErrors(before, result.character, result.preview)).toEqual([])
      expect(await roundTrip(result.character)).toEqual(result.character)
      // Running it again changes nothing.
      const again = apply(result.character, l.loadout)
      expect(again.preview.changes).toEqual([])
    })

    it('merges items into existing stacks before using new slots', async () => {
      const before = await loadPlayer(save.bytes)
      // Find a stackable item the character has with room left in its stack.
      const target = before.inventory.find((i) => i.netId !== 0 && i.stack > 1 && i.stack < 9000 && i.prefix === 0)
      if (!target) return
      const room = 9999 - target.stack
      const l = parseLoadout({ schema: 'loadsmith/1', items: [{ item: target.netId, stack: Math.min(room, 5) }] })
      if (!l.ok) throw new Error('parse')
      const result = apply(before, l.loadout)
      if (result.preview.warnings.some((w) => w.path === 'items[0].stack')) return // unclear stack rule: skip
      expect(result.preview.changes.every((c) => c.before !== null)).toBe(true) // no new slot used
      expect(conservationErrors(before, result.character, result.preview)).toEqual([])
    })
  })
})
