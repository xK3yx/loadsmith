// Synthetic tests for the loadout schema, validator and applyLoadout. They
// need no save files, so they also run in CI.

import { describe, expect, it } from 'vitest'
import { lookupItem } from '../data/index.ts'
import { type PlayerCharacter, createEmptyPlayer, parsePlayer, serializePlayer } from '../format/index.ts'
import { MAX_INPUT_BYTES, type Loadout, applyLoadout, parseLoadout, parseLoadoutText, validateLoadout } from './index.ts'

function character(version = 326, opts: { journey?: boolean } = {}): PlayerCharacter {
  const p = createEmptyPlayer(version)
  p.name = 'Tester'
  p.difficulty = opts.journey ? 3 : 0
  p.buffs = Array.from({ length: 44 }, () => ({ type: 0, time: 0 }))
  if (version < 280) p.voiceVariant = 1
  return p
}

function loadout(obj: Record<string, unknown>): Loadout {
  const r = parseLoadout({ schema: 'loadsmith/1', ...obj })
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.loadout
}

const id = (name: string, v = 326): number => {
  const r = lookupItem(name, v)
  if (!r.ok) throw new Error(name)
  return r.item.id
}

function errorsOf(obj: Record<string, unknown>, p = character()): string[] {
  return validateLoadout(loadout(obj), p).errors.map((e) => `${e.path}: ${e.message}`)
}

function warningsOf(obj: Record<string, unknown>, p = character()): string[] {
  return validateLoadout(loadout(obj), p).warnings.map((e) => `${e.path}: ${e.message}`)
}

function applied(obj: Record<string, unknown>, p = character()) {
  const r = applyLoadout(p, loadout(obj))
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.path}: ${e.message}`).join('\n'))
  return r
}

describe('parseLoadoutText', () => {
  it('reads plain JSON or a fenced code block from AI output', () => {
    expect(parseLoadoutText('{"schema":"loadsmith/1"}').ok).toBe(true)
    expect(parseLoadoutText('Here you go:\n```json\n{"schema":"loadsmith/1","notes":"x"}\n```\nEnjoy!').ok).toBe(true)
  })

  it('rejects bad JSON, the wrong schema, and oversized input', () => {
    expect(parseLoadoutText('{schema: loadsmith}')).toMatchObject({ ok: false })
    expect(parseLoadoutText('{"schema":"loadsmith/2"}')).toMatchObject({ ok: false })
    expect(parseLoadoutText(`{"notes":"${'x'.repeat(MAX_INPUT_BYTES)}"}`)).toMatchObject({ ok: false })
  })

  it('bounds list sizes and numbers', () => {
    expect(parseLoadout({ schema: 'loadsmith/1', accessories: new Array(8).fill('Ankh Shield') }).ok).toBe(false)
    expect(parseLoadout({ schema: 'loadsmith/1', items: [{ item: 'Wood', stack: 1.5 }] }).ok).toBe(false)
    expect(parseLoadout({ schema: 'loadsmith/1', storage: { safe: { mode: 'merge', items: [] } } }).ok).toBe(false)
  })
})

describe('validateLoadout', () => {
  it('accepts a correct loadout with no issues', () => {
    expect(
      validateLoadout(
        loadout({
          armor: ['Solar Flare Helmet', 'Solar Flare Breastplate', 'Solar Flare Leggings'],
          accessories: [{ item: 'Celestial Starboard', prefix: 'Menacing' }],
          weapons: [{ item: 'Zenith', prefix: 'Legendary' }],
        }),
        character(),
      ),
    ).toMatchObject({ errors: [], warnings: [] })
  })

  it('blocks unknown items with suggestions', () => {
    const v = validateLoadout(loadout({ weapons: ['Zenit'] }), character())
    expect(v.errors[0]).toMatchObject({ path: 'weapons[0]', suggestions: ['Zenith'] })
  })

  it('blocks ambiguous names and items newer than the save', () => {
    expect(errorsOf({ items: ['Strange Plant'] })[0]).toMatch(/several items/)
    expect(errorsOf({ weapons: ['Cobwhip'] }, character(279))[0]).toMatch(/doesn't exist/)
  })

  it('blocks wrong, unknown and too-new modifiers', () => {
    expect(errorsOf({ weapons: [{ item: 'S.D.M.G.', prefix: 'Legendary' }] })[0]).toMatch(/can't go on/)
    expect(errorsOf({ weapons: [{ item: 'Zenith', prefix: 'Legendery' }] })[0]).toMatch(/Unknown modifier/)
    expect(errorsOf({ weapons: [{ item: 'Terraprisma', prefix: 'Fabled' }] }, character(279))[0]).toMatch(/newer/)
  })

  it('checks armor slots and armor modifiers', () => {
    expect(errorsOf({ armor: ['Solar Flare Breastplate'] })[0]).toMatch(/isn't a helmet/)
    expect(errorsOf({ armor: [{ item: 'Solar Flare Helmet', prefix: 'Godly' }] })[0]).toMatch(/can't have a modifier/)
  })

  it('blocks non-accessories, duplicates and two pairs of wings', () => {
    expect(errorsOf({ accessories: ['Zenith'] })[0]).toMatch(/isn't an accessory/)
    expect(errorsOf({ accessories: ['Ankh Shield', 'Ankh Shield'] })[0]).toMatch(/equipped twice/)
    expect(errorsOf({ accessories: ['Celestial Starboard', 'Fishron Wings'] })[0]).toMatch(/one pair of wings/)
  })

  it('warns when there are more accessories than the world allows', () => {
    const six = ['Ankh Shield', 'Celestial Shell', 'Soaring Insignia', 'Celestial Starboard', 'Fire Gauntlet', 'Destroyer Emblem']
    expect(warningsOf({ accessories: six, target: { world_difficulty: 'classic' } })[0]).toMatch(/5 slots/)
    expect(warningsOf({ accessories: six, target: { world_difficulty: 'expert' }, character: { demon_heart: true } })).toEqual([])
    expect(warningsOf({ accessories: six })[0]).toMatch(/Expert or Master/)
  })

  it('checks stacks and coins', () => {
    expect(errorsOf({ items: [{ item: 'Zenith', stack: 2 }] })[0]).toMatch(/stacks to 1/)
    expect(errorsOf({ coins: { gold: 101 } })[0]).toMatch(/at most 100/)
    expect(errorsOf({ coins: { platinum: 9999 } })).toEqual([])
    expect(warningsOf({ items: [{ item: 'Grappling Hook', stack: 3 }] })[0]).toMatch(/Not sure/)
    expect(warningsOf({ items: [{ item: 'Treasure Bag (Moon Lord)', stack: 30 }] })).toEqual([]) // safe stackable
  })

  it('blocks loadout 1 being set twice', () => {
    expect(errorsOf({ armor: ['Solar Flare Helmet'], loadouts: { '1': { armor: ['Vortex Helmet'] } } })[0]).toMatch(/set twice/)
  })

  it('checks hotbar entries are available', () => {
    expect(errorsOf({ hotbar: ['Zenith'] })[0]).toMatch(/isn't in the inventory/)
    expect(errorsOf({ weapons: ['Zenith'], hotbar: [null, 'Zenith'] })).toEqual([])
  })

  it('caps life and mana', () => {
    expect(errorsOf({ character: { max_life: 501 } })[0]).toMatch(/at most 500/)
    expect(errorsOf({ character: { max_mana: 201 } })[0]).toMatch(/at most 200/)
    expect(errorsOf({ character: { max_life: 500, max_mana: 200 } })).toEqual([])
  })

  it('accepts any known player flag by name, and rejects unknown ones with suggestions', () => {
    expect(errorsOf({ character: { used_galaxy_pearl: true, downed_dd2_event_any_difficulty: true } })).toEqual([])
    const v = validateLoadout(loadout({ character: { used_galaxy_perl: true } }), character())
    expect(v.errors[0]).toMatchObject({ path: 'character.used_galaxy_perl', suggestions: ['used_galaxy_pearl'] })
    expect(errorsOf({ character: { used_ambrosia: 'yes' } })[0]).toMatch(/true or false/)
  })

  it('allows full research only on Journey characters, with an unverified warning', () => {
    expect(errorsOf({ character: { journey_research: 'full' } })[0]).toMatch(/only for Journey/)
    const v = validateLoadout(loadout({ character: { journey_research: 'full' } }), character(326, { journey: true }))
    expect(v.errors).toEqual([])
    expect(v.warnings[0]?.message).toMatch(/haven't been checked in-game/)
  })

  it('puts the outdated-save message first, but still validates and applies', () => {
    const v = validateLoadout(loadout({ sources: ['x'], weapons: ['Zenith'] }), character(279))
    expect(v.errors).toEqual([])
    expect(v.warnings[0]).toMatchObject({ path: 'save.version', message: expect.stringMatching(/load it in Terraria 1\.4\.5\.8/) })
    expect(v.warnings).toHaveLength(2)
    expect(applyLoadout(character(279), loadout({ weapons: ['Zenith'] })).ok).toBe(true)
    expect(warningsOf({ weapons: ['Zenith'] })).toEqual([]) // current save: no message
  })

  it('warns about unknown keys, version and mode mismatches', () => {
    const w = warningsOf({ sources: ['x'], game_version: '1.4.4.9', target: { mode: 'journey' }, weapons: [{ item: 'Zenith', why: 'best' }] })
    expect(w).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sources: Unknown key/),
        expect.stringMatching(/^weapons\[0\]\.why: Unknown key/),
        expect.stringMatching(/^game_version: .*older/),
        expect.stringMatching(/^target.mode: .*Classic character/),
      ]),
    )
  })
})

describe('applyLoadout', () => {
  it('leaves the input character untouched', () => {
    const p = character()
    const copy = structuredClone(p)
    applied({ weapons: ['Zenith'] }, p)
    expect(p).toEqual(copy)
  })

  it('moves replaced gear to free inventory, then storage', () => {
    const p = character()
    p.armor[0] = { netId: id('Vortex Helmet'), stack: 1, prefix: 0, favorited: false }
    for (let i = 10; i < 50; i++) p.inventory[i] = { netId: id('Dirt Block'), stack: 1, prefix: 0, favorited: false }
    const r = applied({ armor: ['Solar Flare Helmet'] }, p)
    expect(r.character.armor[0]!.netId).toBe(id('Solar Flare Helmet'))
    expect(r.preview.moved).toEqual([expect.objectContaining({ to: 'Piggy Bank' })])
    expect(r.character.bank1[0]!.netId).toBe(id('Vortex Helmet'))
  })

  it('empties accessory slots the list does not use', () => {
    const p = character()
    p.armor[8] = { netId: id('Ankh Shield'), stack: 1, prefix: 65, favorited: false }
    const r = applied({ accessories: ['Celestial Starboard'] }, p)
    expect(r.character.armor[3]!.netId).toBe(id('Celestial Starboard'))
    expect(r.character.armor[8]!.netId).toBe(0)
    expect(r.character.inventory.some((i) => i.netId === id('Ankh Shield') && i.prefix === 65)).toBe(true)
  })

  it('blocks instead of dropping anything when there is no room', () => {
    const p = character()
    p.armor[0] = { netId: id('Vortex Helmet'), stack: 1, prefix: 0, favorited: false }
    const full = { netId: id('Dirt Block'), stack: 9999, prefix: 0, favorited: false }
    for (let i = 10; i < 50; i++) p.inventory[i] = { ...full }
    for (const b of [p.bank1, p.bank2, p.bank3, p.bank4]) for (let i = 0; i < 40; i++) b[i] = { ...full }
    const r = applyLoadout(p, loadout({ armor: ['Solar Flare Helmet'] }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors[0]?.message).toMatch(/No room for 1x Vortex Helmet/)
  })

  it('puts add-mode storage items in the next space with room and lists them', () => {
    const p = character()
    const wood = { netId: id('Wood'), stack: 10, prefix: 0, favorited: false }
    for (let i = 0; i < 40; i++) p.bank1[i] = { ...wood }
    for (let i = 0; i < 39; i++) p.bank2[i] = { ...wood }
    const r = applied({ storage: { piggy_bank: { items: ['Zenith', 'Terraprisma'] } } }, p)
    // Safe has one free slot, then the Defender's Forge.
    expect(r.character.bank2[39]!.netId).toBe(id('Zenith'))
    expect(r.character.bank3[0]!.netId).toBe(id('Terraprisma'))
    expect(r.preview.redirected).toEqual([
      expect.objectContaining({ wanted: 'Piggy Bank', to: 'Safe', path: 'storage.piggy_bank.items[0]' }),
      expect.objectContaining({ wanted: 'Piggy Bank', to: "Defender's Forge", path: 'storage.piggy_bank.items[1]' }),
    ])
  })

  it('fills the chosen space first and skips spaces in replace mode', () => {
    const p = character()
    for (let i = 0; i < 39; i++) p.bank1[i] = { netId: id('Wood'), stack: 10, prefix: 0, favorited: false }
    const r = applied({ storage: { piggy_bank: { items: ['Zenith', 'Terraprisma'] }, safe: { mode: 'replace', items: [] } } }, p)
    expect(r.character.bank1[39]!.netId).toBe(id('Zenith'))
    expect(r.character.bank2.every((i) => i.netId === 0)).toBe(true)
    expect(r.character.bank3[0]!.netId).toBe(id('Terraprisma'))
    expect(r.preview.redirected.map((x) => x.item.name)).toEqual(['Terraprisma'])
  })

  it('blocks only when every storage space is full, and replace clears it', () => {
    const p = character()
    for (const b of [p.bank1, p.bank2, p.bank3, p.bank4]) for (let i = 0; i < 40; i++) b[i] = { netId: id('Wood'), stack: 10, prefix: 0, favorited: false }
    const add = applyLoadout(p, loadout({ storage: { piggy_bank: { items: ['Zenith'] } } }))
    expect(add.ok).toBe(false)
    expect(!add.ok && add.errors[0]?.message).toMatch(/every storage space is full/)
    const replace = applied({ storage: { piggy_bank: { mode: 'replace', items: ['Zenith'] } } }, p)
    expect(replace.preview.removed).toHaveLength(40)
    expect(replace.character.bank1.filter((i) => i.netId !== 0)).toHaveLength(1)
  })

  it('merges items into existing stacks first and only warns when a new slot is needed', () => {
    const p = character()
    const potion = id('Super Healing Potion')
    p.inventory[12] = { netId: potion, stack: 9000, prefix: 0, favorited: false }
    const fits = applied({ items: [{ item: potion, stack: 999 }] }, p)
    expect(fits.character.inventory[12]!.stack).toBe(9999)
    expect(fits.preview.warnings).toEqual([])

    const overflow = applied({ items: [{ item: potion, stack: 1500 }] }, p)
    expect(overflow.character.inventory[12]!.stack).toBe(9999)
    expect(overflow.character.inventory[10]).toMatchObject({ netId: potion, stack: 501 })
    expect(overflow.preview.warnings[0]?.message).toMatch(/takes a new slot/)

    const fresh = applied({ items: [{ item: 'Ironskin Potion', stack: 30 }] }, p)
    expect(fresh.preview.warnings).toEqual([]) // didn't have it: a new slot is expected
  })

  it('moves an owned weapon into the hotbar with the new modifier instead of adding a copy', () => {
    const p = character()
    const zenith = id('Zenith')
    p.bank2[5] = { netId: zenith, stack: 1, prefix: 59, favorited: false } // Godly, in the Safe
    const r = applied({ weapons: [{ item: 'Zenith', prefix: 'Legendary' }] }, p)
    expect(r.character.inventory[0]).toMatchObject({ netId: zenith, prefix: 81 })
    expect(r.character.bank2[5]!.netId).toBe(0)
    expect(r.preview.added).toEqual([])
    expect(r.preview.moved).toEqual([expect.objectContaining({ from: 'Safe slot 6', to: 'Hotbar' })])
    expect(r.preview.reforged).toEqual([expect.objectContaining({ fromPrefixName: 'Godly', reason: 'loadout', item: expect.objectContaining({ prefixName: 'Legendary' }) })])
    expect(r.preview.warnings).toEqual([])
  })

  it('keeps the owned modifier when the loadout names none, and prefers an exact match', () => {
    const p = character()
    const shield = id('Ankh Shield')
    p.inventory[30] = { netId: shield, stack: 1, prefix: 65, favorited: false } // Warding
    p.bank1[0] = { netId: shield, stack: 1, prefix: 72, favorited: false } // Menacing
    const none = applied({ accessories: ['Ankh Shield'] }, p)
    expect(none.character.armor[3]).toMatchObject({ netId: shield, prefix: 65 })
    expect(none.character.inventory[30]!.netId).toBe(0)
    expect(none.preview.reforged).toEqual([])
    const exact = applied({ accessories: [{ item: 'Ankh Shield', prefix: 'Menacing' }] }, p)
    expect(exact.character.armor[3]).toMatchObject({ netId: shield, prefix: 72 })
    expect(exact.character.bank1[0]!.netId).toBe(0)
    expect(exact.character.inventory[30]!.netId).toBe(shield) // the Warding one stays
    expect(exact.preview.reforged).toEqual([])
  })

  it('reforges an item taken off when it is re-equipped elsewhere, and adds only what is not owned', () => {
    const p = character()
    p.inventory[0] = { netId: id('Zenith'), stack: 1, prefix: 59, favorited: false }
    const r = applied({ weapons: ['Terraprisma', { item: 'Zenith', prefix: 'Legendary' }] }, p)
    expect(r.character.inventory.slice(0, 2).map((i) => [i.netId, i.prefix])).toEqual([
      [id('Terraprisma'), 0],
      [id('Zenith'), 81],
    ])
    expect(r.character.inventory.filter((i) => i.netId === id('Zenith'))).toHaveLength(1)
    expect(r.preview.added.map((a) => a.name)).toEqual(['Terraprisma'])
  })

  it('best_modifiers reforges every owned weapon and accessory and lists each change', () => {
    const p = character()
    p.inventory[3] = { netId: id('Zenith'), stack: 1, prefix: 59, favorited: false } // Godly
    p.bank4[0] = { netId: id('S.D.M.G.'), stack: 1, prefix: 0, favorited: false }
    p.bank1[2] = { netId: id('Terraprisma'), stack: 1, prefix: 57, favorited: false } // Ruthless: pre-1.4.5 best
    p.loadouts[1]!.armor[3] = { netId: id('Ankh Shield'), stack: 1, prefix: 65, favorited: false } // loadout 2, Warding
    p.armor[13] = { netId: id('Celestial Shell'), stack: 1, prefix: 0, favorited: false } // vanity accessory
    p.inventory[20] = { netId: id('Nebula Blaze'), stack: 1, prefix: 83, favorited: false } // already Mythical
    p.inventory[21] = { netId: id('Solar Flare Helmet'), stack: 1, prefix: 0, favorited: false } // armor: no modifier
    const r = applied({ best_modifiers: true }, p)
    const c = r.character
    expect([c.inventory[3]!.prefix, c.bank4[0]!.prefix, c.bank1[2]!.prefix, c.loadouts[1]!.armor[3]!.prefix, c.armor[13]!.prefix]).toEqual([81, 82, 85, 72, 72])
    expect(c.inventory[20]!.prefix).toBe(83)
    expect(c.inventory[21]!.prefix).toBe(0)
    expect(r.preview.reforged.map((x) => [x.item.name, x.fromPrefixName ?? null, x.item.prefixName, x.where, x.reason])).toEqual([
      ['Zenith', 'Godly', 'Legendary', 'Hotbar', 'best'],
      ['Terraprisma', 'Ruthless', 'Fabled', 'Piggy Bank', 'best'],
      ['S.D.M.G.', null, 'Unreal', 'Void Vault', 'best'],
      ['Celestial Shell', null, 'Menacing', 'Loadout 1 equipment', 'best'],
      ['Ankh Shield', 'Warding', 'Menacing', 'Loadout 2 equipment', 'best'],
    ])
    expect(parsePlayer(serializePlayer(c))).toEqual(c)
  })

  it('best_modifiers keeps modifiers the loadout names and follows the save version', () => {
    const p = character(279)
    p.bank1[0] = { netId: id('Terraprisma', 279), stack: 1, prefix: 83, favorited: false }
    const r = applied({ best_modifiers: true, weapons: [{ item: 'Zenith', prefix: 'Godly' }], accessories: [{ item: 'Ankh Shield', prefix: 'Warding' }] }, p)
    expect(r.character.inventory[0]!.prefix).toBe(59) // named in the loadout: kept
    expect(r.character.armor[3]!.prefix).toBe(65)
    expect(r.character.bank1[0]!.prefix).toBe(57) // summon staff before 1.4.5: Ruthless, not Fabled
  })

  it('best_modifiers warns about modified items whose weapon type is unknown', () => {
    const p = character()
    p.inventory[10] = { netId: id('Copper Pickaxe'), stack: 1, prefix: 1, favorited: false }
    const r = applied({ best_modifiers: true }, p)
    expect(r.character.inventory[10]!.prefix).toBe(1)
    expect(r.preview.warnings).toEqual([expect.objectContaining({ path: 'best_modifiers', message: expect.stringMatching(/Copper Pickaxe/) })])
  })

  it('replaces coin slots and keeps the old coins', () => {
    const p = character()
    p.inventory[50] = { netId: id('Gold Coin'), stack: 40, prefix: 0, favorited: false }
    const r = applied({ coins: { platinum: 10, silver: 5 } }, p)
    expect(r.character.inventory.slice(50, 54).map((i) => [i.netId, i.stack])).toEqual([
      [id('Platinum Coin'), 10],
      [id('Silver Coin'), 5],
      [0, 0],
      [0, 0],
    ])
    expect(r.character.inventory.some((i, k) => k < 50 && i.netId === id('Gold Coin') && i.stack === 40)).toBe(true)
  })

  it('orders the hotbar by swapping, and favorites only where the file stores it', () => {
    const p = character()
    p.inventory[20] = { netId: id('Magic Mirror'), stack: 1, prefix: 0, favorited: false }
    const r = applied({
      weapons: ['Zenith', { item: 'Terraprisma', favorite: true }],
      hotbar: ['Terraprisma', 'Magic Mirror', 'Zenith'],
      storage: { safe: { items: [{ item: 'Wood', stack: 10, favorite: true }] } },
    }, p)
    expect(r.character.inventory.slice(0, 3).map((i) => i.netId)).toEqual([id('Terraprisma'), id('Magic Mirror'), id('Zenith')])
    expect(r.character.inventory[0]!.favorited).toBe(true)
    expect(r.character.bank2[0]!.favorited).toBe(false) // the Safe doesn't store favorites
    expect(parsePlayer(serializePlayer(r.character))).toEqual(r.character)
  })

  it('sets equipment slots in pet, light pet, minecart, mount, hook order', () => {
    const r = applied({ equipment: { hook: 'Lunar Hook', pet: 'Bone Rattle', mount: 'Cosmic Car Key' } })
    expect(r.character.miscEquips.map((i) => i.netId)).toEqual([id('Bone Rattle'), 0, 0, id('Cosmic Car Key'), id('Lunar Hook')])
  })

  it('sets life, mana, boosters and flags', () => {
    const r = applied({ character: { max_life: 500, max_mana: 200, boosters: 'all', demon_heart: true, minecart_upgrade: true } })
    const c = r.character
    expect([c.statLifeMax, c.statLife, c.statManaMax, c.statMana]).toEqual([500, 500, 200, 200])
    expect([c.usedAegisCrystal, c.usedAegisFruit, c.usedArcaneCrystal, c.usedGalaxyPearl, c.usedGummyWorm, c.usedAmbrosia]).toEqual(new Array(6).fill(true))
    expect([c.ateArtisanBread, c.unlockedBiomeTorches, c.usingBiomeTorches, c.extraAccessory]).toEqual([true, true, true, true])
    expect(c.superCartFlags & 3).toBe(3)
  })

  it('writes exactly the research amount, never more, and never lowers', () => {
    const p = character(326, { journey: true })
    p.creativeSacrifices = [
      { key: 'DirtBlock', value: 40 }, // partial: raised to 100
      { key: 'LifeCrystal', value: 13 }, // above the table (10): left alone
    ]
    const r = applied({ character: { journey_research: 'full' } }, p)
    const get = (k: string) => r.character.creativeSacrifices.find((s) => s.key === k)?.value
    expect(get('DirtBlock')).toBe(100)
    expect(get('LifeCrystal')).toBe(13)
    expect(get('Zenith')).toBe(1)
    expect(get('SuperHealingPotion')).toBe(30)
    expect(r.preview.research).toMatchObject({ raised: 1, unverified: true })
    // Nothing newer than the save version is researched.
    const old = applied({ character: { journey_research: 'full' } }, character(279, { journey: true }))
    expect(old.character.creativeSacrifices.some((s) => s.key === 'MeteorWhip')).toBe(false) // Starcrash, 1.4.5
    expect(parsePlayer(serializePlayer(r.character))).toEqual(r.character)
  })
})
