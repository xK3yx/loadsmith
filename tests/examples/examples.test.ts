// Every loadout in examples/ must validate, apply cleanly, and follow the
// prompt's rules, so the examples stay a model of what the AI should write.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lookupItem } from '../../src/data/index.ts'
import { type PlayerCharacter, createEmptyPlayer, loadPlayer } from '../../src/format/index.ts'
import { type Entry, type Loadout, applyLoadout, parseLoadoutText, validateLoadout } from '../../src/loadout/index.ts'
import { buildPrompt } from '../../src/ui/logic/prompt.ts'
import { findSaves } from '../format/saves.ts'
import { conservationErrors } from '../loadout/helpers.ts'

const DIR = join(import.meta.dirname, '..', '..', 'examples')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()

function load(file: string): Loadout {
  const r = parseLoadoutText(readFileSync(join(DIR, file), 'utf8'))
  if (!r.ok) throw new Error(`${file}: ${r.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`)
  return r.loadout
}

function blank(): PlayerCharacter {
  const p = createEmptyPlayer(326)
  p.name = 'Example'
  p.statLifeMax = 100
  p.statManaMax = 20
  return p
}

const itemName = (e: Entry): string => String(typeof e === 'object' ? e.item : e)
const prefixOf = (e: Entry): string | undefined => (typeof e === 'object' && e.prefix !== undefined ? String(e.prefix) : undefined)
const key = (e: Entry): string | undefined => {
  const r = lookupItem(itemName(e), 326)
  return r.ok ? r.item.key : undefined
}

type Space = { mode?: string; items?: Entry[] } | undefined
type Gear = { accessories?: Entry[] } | undefined

function spaces(l: Loadout): Space[] {
  return Object.values((l.storage ?? {}) as Record<string, Space>)
}

function storageItems(l: Loadout): Entry[] {
  return spaces(l).flatMap((s) => s?.items ?? [])
}

const BOWS = new Set(['Phantasm', 'Tsunami', 'DaedalusStormbow', 'Eventide', 'ShadowFlameBow', 'Marrowbow', 'HellwingBow', 'PulseBow', 'ChlorophyteShotbow', 'DD2BetsyBow'])
const QUIVERS = new Set(['MagicQuiver', 'MoltenQuiver', 'StalkersQuiver', 'PhoenixQuiver'])
const UTILITY = ['Spelunker Potion', 'Hunter Potion', 'Shine Potion', 'Night Owl Potion', 'Mining Potion', 'Builder Potion', 'Gravitation Potion', 'Recall Potion']

describe('examples', () => {
  it('has one example per class', () => {
    expect(FILES).toEqual(['all-rounder.json', 'magic.json', 'melee.json', 'ranged.json', 'summon.json'])
  })

  describe.each(FILES)('%s', (file) => {
    const l = load(file)

    it('is a 1.4.5.8 bosses loadout that validates with no errors or warnings', () => {
      expect(l).toMatchObject({ schema: 'loadsmith/1', game_version: '1.4.5.8', goal: 'bosses', best_modifiers: true })
      const v = validateLoadout(l, blank())
      expect(v.errors).toEqual([])
      expect(v.warnings).toEqual([])
    })

    it('applies to a blank character and adds up', () => {
      const p = blank()
      const r = applyLoadout(p, l)
      if (!r.ok) throw new Error(r.errors.map((e) => `${e.path}: ${e.message}`).join('\n'))
      expect(conservationErrors(p, r.character, r.preview)).toEqual([])
      expect(r.preview.removed).toEqual([]) // examples never delete anything
    })

    it('fills every section', () => {
      for (const k of ['armor', 'accessories', 'weapons', 'hotbar', 'ammo', 'coins', 'equipment', 'loadouts', 'items', 'storage', 'character', 'unsupported', 'notes']) {
        expect(l, k).toHaveProperty(k)
      }
      expect(l.accessories).toHaveLength(7)
      expect(Object.keys(l.loadouts ?? {})).toEqual(['2', '3'])
      expect(spaces(l).every((s) => s?.mode === 'add')).toBe(true)
    })

    it('puts boss potions in the inventory and utility potions in storage', () => {
      const items = l.items ?? []
      const potions = items.filter((e) => /Potion|Flask/.test(itemName(e)) && itemName(e) !== 'Wormhole Potion')
      expect(potions.length).toBeGreaterThan(5)
      for (const p of potions) {
        expect(UTILITY, itemName(p)).not.toContain(itemName(p))
        expect(typeof p === 'object' && p.favorite, itemName(p)).toBe(true)
      }
      const stored = storageItems(l).map(itemName)
      for (const u of UTILITY) expect(stored, u).toContain(u)
    })

    it('includes the convenience items', () => {
      const names = (l.items ?? []).map(itemName)
      for (const n of ['Void Bag', 'Money Trough', 'Shellphone', 'Rod of Harmony', 'Wormhole Potion']) expect(names, n).toContain(n)
    })

    it('only wears a quiver with a bow', () => {
      const gear = [l as Gear, ...Object.values((l.loadouts ?? {}) as Record<string, Gear>)].flatMap((g) => g?.accessories ?? [])
      if (gear.some((a) => QUIVERS.has(key(a) ?? ''))) {
        expect((l.weapons ?? []).some((w) => BOWS.has(key(w) ?? ''))).toBe(true)
      }
    })

    it('uses Crystal Bullets, not Luminite, in the ammo slots for bosses', () => {
      const ammo = (l.ammo ?? []).map(itemName)
      if ((l.weapons ?? []).some((w) => itemName(w) === 'S.D.M.G.')) {
        expect(ammo).toContain('Crystal Bullet')
        expect(ammo).not.toContain('Luminite Bullet')
      }
    })

    it('cites a source for its picks and names the version', () => {
      expect(l.notes).toMatch(/Version researched: Terraria 1\.4\.5\.8/)
      expect(l.notes).toContain('https://terraria.wiki.gg/wiki/Guide:Class_setups')
      expect((l.notes ?? '').match(/https:\/\//g)?.length).toBeGreaterThan(5)
    })
  })

  it('gives summon staffs Fabled and whips Legendary', () => {
    for (const w of load('summon.json').weapons ?? []) {
      const name = itemName(w)
      expect(prefixOf(w), name).toBe(['Possession', 'Constellation'].includes(name) ? 'Legendary' : 'Fabled')
    }
  })

  it('stocks the all-rounder\'s storage with the other classes\' kits', () => {
    const l = load('all-rounder.json')
    expect(l.class).toBe('all-rounder')
    expect([l.loadouts?.['2']?.class, l.loadouts?.['3']?.class]).toEqual(['ranged', 'magic'])
    const stored = storageItems(l).map(itemName)
    for (const n of ['Meowmere', 'Phantasm', 'Lunar Flare', 'Terraprisma', 'Possession', 'Stardust Helmet', 'Twilight Grasp', 'Archery Potion', 'Magic Power Potion', 'Summoning Potion']) {
      expect(stored, n).toContain(n)
    }
  })
})

describe('prompt', () => {
  const p = blank()

  it('teaches the lessons from real characters', () => {
    const text = buildPrompt({ class: 'ranged', goal: 'bosses', world: 'master', bestModifiers: true }, p)
    for (const lesson of [
      'Guide:Class_setups',
      'Mystic Arts Sash',
      'Possession and Constellation',
      'Twilight Grasp and Ouroboros Ring',
      'Phoenix Quiver',
      'Crystal Bullets for bosses but Luminite Bullets for crowds',
      'quick-buff (B) only uses potions in the inventory',
      'Void Bag, Money Trough, Shellphone, Rod of Harmony, and Wormhole Potions for multiplayer',
      'Fabled for summon staffs',
      'Legendary for melee weapons and whips',
      'which Terraria version you researched',
      'source URL',
    ]) {
      expect(text, lesson).toContain(lesson)
    }
    expect(text).toContain('defensive set and an exploring set')
  })

  it('tells an all-rounder to stock the other classes\' kits', () => {
    const text = buildPrompt({ class: 'all-rounder', goal: 'bosses', world: 'master', bestModifiers: true }, p)
    expect(text).toContain("every other class's full kit")
    expect(text).not.toContain('defensive set and an exploring set')
  })
})

const saves = findSaves().filter((s) => s.label.includes('1458'))

describe.skipIf(saves.length === 0)('examples on real 1.4.5.8 saves', () => {
  it.each(saves.map((s) => [s.label, s] as const))('%s', async (_label, save) => {
    const p = await loadPlayer(save.bytes)
    for (const file of FILES) {
      const l = load(file)
      if (p.difficulty === 3) l.target = { mode: 'journey', world_difficulty: 'master' }
      const r = applyLoadout(p, l)
      if (!r.ok) throw new Error(`${file}: ${r.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`)
      expect(conservationErrors(p, r.character, r.preview), file).toEqual([])
    }
  })
})
