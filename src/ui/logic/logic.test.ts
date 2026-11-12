import { describe, expect, it } from 'vitest'
import { MAX_SUPPORTED_VERSION, itemByKey, lookupItem } from '../../data/index.ts'
import { type PlayerCharacter, createEmptyPlayer, savePlayer } from '../../format/index.ts'
import { type Loadout, applyLoadout, validateLoadout } from '../../loadout/index.ts'
import { characterSummary, itemLabel, loadCharacterFile } from './character.ts'
import { prepareDownload, downloadName, viewLabel } from './download.ts'
import { appendAt, entryParts, gearBase, getAt, removeAt, resolveItem, setAt, withField } from './entries.ts'
import { itemOptions, modifierMatches, modifierOptions } from './options.ts'
import { applyFix, issueLabel, isUnder, parsePath } from './paths.ts'
import { CLASS_LABELS, PERFECT_GEAR_LOADOUT, PROMPT_CLASSES, buildPrompt, missingChoices, slotText } from './prompt.ts'

function id(key: string): number {
  const item = itemByKey(key)
  if (!item) throw new Error(key)
  return item.id
}

function character(version = MAX_SUPPORTED_VERSION, journey = false): PlayerCharacter {
  const p = createEmptyPlayer(version)
  p.name = 'Tester'
  p.difficulty = journey ? 3 : 0
  p.statLifeMax = 400
  p.statManaMax = 200
  p.inventory[0] = { netId: id('Megashark'), stack: 1, prefix: 0, favorited: false }
  p.armor[3] = { netId: id('HermesBoots'), stack: 1, prefix: 65, favorited: false }
  p.bank2[0] = { netId: id('Torch'), stack: 99, prefix: 0, favorited: false }
  return p
}

describe('loadCharacterFile', () => {
  it('reads a character and summarizes it in plain words', async () => {
    const p = character()
    const r = await loadCharacterFile('Tester.plr', await savePlayer(p))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const s = characterSummary(r.character)
    expect(s).toMatchObject({ name: 'Tester', mode: 'Classic', difficulty: 'Softcore', gameVersion: '1.4.5.8', life: 400 })
    expect(s.outdatedNotice).toBeUndefined()
    expect(s.hotbar).toEqual(['Megashark'])
    expect(s.accessories).toEqual(['Warding Hermes Boots'])
    expect(s.storage.find((x) => x.label === 'Safe')).toEqual({ label: 'Safe', used: 1, total: 40 })
  })

  it('shows the outdated message for a 1.4.4.9 Journey character', async () => {
    const r = await loadCharacterFile('old.plr', await savePlayer(character(279, true)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const s = characterSummary(r.character)
    expect(s.mode).toBe('Journey')
    expect(s.outdatedNotice).toMatch(/last saved in Terraria 1\.4\.4\.9/)
  })

  it('turns bad files into sentences', async () => {
    const plr = await savePlayer(character())
    expect(await loadCharacterFile('x.tplr', plr)).toMatchObject({ ok: false, message: expect.stringMatching(/tModLoader/) })
    expect(await loadCharacterFile('x.plr.bak', plr)).toMatchObject({ ok: false, message: expect.stringMatching(/backup/) })
    expect(await loadCharacterFile('x.plr', new Uint8Array([1, 2, 3]))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/doesn't look like a Terraria character/),
    })
    expect(await loadCharacterFile('x.plr', await savePlayer(character(270)))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/older version.*save and quit once/),
    })
  })

  it('labels items the way the game does', () => {
    expect(itemLabel({ netId: id('Torch'), stack: 99, prefix: 0 }, 326)).toBe('Torch ×99')
    expect(viewLabel({ id: 1, name: 'Zenith', stack: 1, prefix: 81, prefixName: 'Legendary' })).toBe('Legendary Zenith')
  })
})

describe('buildPrompt', () => {
  const p = character()

  it('needs a class and a world', () => {
    expect(missingChoices({ goal: 'bosses', bestModifiers: true })).toEqual(['class', 'world'])
    expect(() => buildPrompt({ goal: 'bosses', bestModifiers: true }, p)).toThrow()
  })

  it.each(PROMPT_CLASSES)('fills every placeholder for %s', (c) => {
    for (const goal of ['bosses', 'general'] as const) {
      for (const world of ['classic', 'expert', 'master', 'journey'] as const) {
        const text = buildPrompt({ class: c, goal, world, bestModifiers: goal === 'bosses' }, p)
        expect(text).not.toMatch(/\{\{/)
        expect(text).toContain(`"class": "${c}"`)
        expect(text).toContain(`"goal": "${goal}"`)
        expect(text).toContain(`"world_difficulty": "${world}"`)
        expect(text).toContain(`"best_modifiers": ${goal === 'bosses'}`)
        expect(text).toContain('1.4.5.8')
      }
    }
    expect(CLASS_LABELS[c]).toBeTruthy()
  })

  it('states slots, the all-rounder rules, and Journey research', () => {
    expect(buildPrompt({ class: 'melee', goal: 'bosses', world: 'master', bestModifiers: false }, p)).toContain('Fill exactly 7 accessory slots')
    expect(buildPrompt({ class: 'melee', goal: 'bosses', world: 'classic', bestModifiers: false }, p)).toContain('Fill exactly 5 accessory slots')
    expect(buildPrompt({ class: 'all-rounder', goal: 'general', world: 'expert', bestModifiers: true }, p)).toMatch(/three different class builds/)
    expect(buildPrompt({ class: 'magic', goal: 'bosses', world: 'master', bestModifiers: true }, p)).not.toContain('journey_research')
    const journey = buildPrompt({ class: 'magic', goal: 'bosses', world: 'journey', bestModifiers: true }, character(326, true))
    expect(journey).toContain('"journey_research": "full"')
    expect(journey).toContain('"mode": "journey"')
    expect(slotText('expert')).toBe('6 accessory slots')
  })

  it('carries the Milestone 5 prompt rules', () => {
    const text = buildPrompt({ class: 'ranged', goal: 'bosses', world: 'master', bestModifiers: true }, p)
    expect(text).toMatch(/Phoenix Quiver/)
    expect(text).toMatch(/Luminite Bullets/)
    expect(text).toMatch(/latest update/)
  })

  it('the perfect-gear loadout reforges and changes nothing else', () => {
    const r = applyLoadout(p, structuredClone(PERFECT_GEAR_LOADOUT) as unknown as Loadout)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.preview.added).toEqual([])
    expect(r.preview.reforged.map((x) => [x.item.name, x.item.prefixName])).toEqual([
      ['Megashark', 'Unreal'],
      ['Hermes Boots', 'Menacing'],
    ])
  })
})

describe('paths', () => {
  it('parses and labels issue paths', () => {
    expect(parsePath('loadouts.2.accessories[0].prefix')).toEqual(['loadouts', '2', 'accessories', 0, 'prefix'])
    expect(issueLabel('accessories[2]')).toBe('Accessory 3')
    expect(issueLabel('weapons[0].prefix')).toBe('Weapon 1: modifier')
    expect(issueLabel('armor[1]')).toBe('Armor: chest piece')
    expect(issueLabel('loadouts.2.accessories[0].prefix')).toBe('Loadout 2, accessory 1: modifier')
    expect(issueLabel('storage.safe.items[3].stack')).toBe('Safe, item 4: amount')
    expect(issueLabel('equipment.light_pet')).toBe('Light pet')
    expect(issueLabel('coins.platinum')).toBe('Platinum coins')
    expect(issueLabel('character.max_life')).toBe('Max life')
    expect(issueLabel('character.used_galaxy_perl')).toBe('Character setting "used_galaxy_perl"')
    expect(issueLabel('save.version')).toBe('Your character')
    expect(issueLabel('(top level)')).toBe("The AI's answer")
    expect(issueLabel('hotbar[9]')).toBe('Hotbar slot 10')
  })

  it('matches issues to rows', () => {
    expect(isUnder('accessories[2].prefix', 'accessories[2]')).toBe(true)
    expect(isUnder('accessories[20]', 'accessories[2]')).toBe(false)
    expect(isUnder('storage.safe.items[0]', 'storage.safe')).toBe(true)
  })

  it('applies "did you mean" fixes that the validator then accepts', () => {
    const p = character()
    const l: Loadout = {
      schema: 'loadsmith/1',
      accessories: ['Celestial Shel', { item: 'Hermes Boots', prefix: 'Menacin', note: 'kept' }],
      weapons: [{ item: 'Megashark', prefix: 'Legendary' }],
      character: { used_galaxy_perl: true },
    }
    const v = validateLoadout(l, p)
    let fixed: Loadout = l
    for (const e of v.errors) {
      const s = e.suggestions?.[0]
      if (s) fixed = applyFix(fixed, e.path, s) ?? fixed
    }
    expect(fixed.accessories).toEqual(['Celestial Shell', { item: 'Hermes Boots', prefix: 'Menacing', note: 'kept' }])
    expect(fixed.character).toEqual({ used_galaxy_pearl: true })
    expect(applyFix(fixed, 'weapons[0].prefix', 'Unreal')?.weapons).toEqual([{ item: 'Megashark', prefix: 'Unreal' }])
    expect(applyFix(fixed, 'nothing[4]', 'x')).toBeUndefined()
    expect(validateLoadout(applyFix(fixed, 'weapons[0].prefix', 'Unreal')!, p).errors).toEqual([])
  })
})

describe('entries', () => {
  const l: Loadout = { schema: 'loadsmith/1', accessories: ['Hermes Boots'] }

  it('gets, sets, appends and removes by path', () => {
    expect(getAt(l, 'accessories[0]')).toBe('Hermes Boots')
    const s = setAt(l, 'storage.safe.items[0]', 'Torch')
    expect(s.storage).toEqual({ safe: { items: ['Torch'] } })
    expect(l.storage).toBeUndefined() // input untouched
    expect(appendAt(l, 'accessories', 'Shield of Cthulhu').accessories).toEqual(['Hermes Boots', 'Shield of Cthulhu'])
    expect(removeAt(l, 'accessories', 0).accessories).toEqual([])
    expect(setAt({ schema: 'loadsmith/1', goal: 'bosses' } as Loadout, 'goal', undefined)).toEqual({ schema: 'loadsmith/1' })
  })

  it('switches entries between plain names and objects', () => {
    const e = withField('Hermes Boots', 'prefix', 'Menacing')
    expect(e).toEqual({ item: 'Hermes Boots', prefix: 'Menacing' })
    expect(withField(e, 'prefix', '')).toBe('Hermes Boots')
    expect(withField({ item: 'Torch', note: 'n' }, 'favorite', false)).toEqual({ item: 'Torch', note: 'n' })
    expect(entryParts({ item: 'Torch', stack: 5, favorite: true })).toEqual({ item: 'Torch', stack: 5, favorite: true })
    expect(entryParts(null)).toBeUndefined()
  })

  it('finds where loadout 1 lives', () => {
    expect(gearBase(l, 1)).toBe('')
    expect(gearBase({ schema: 'loadsmith/1', loadouts: { '1': {} } }, 1)).toBe('loadouts.1.')
    expect(gearBase(l, 3)).toBe('loadouts.3.')
    expect(resolveItem('zenith', 326)?.name).toBe('Zenith')
    expect(resolveItem('nope nope', 326)).toBeUndefined()
  })
})

describe('dropdown options', () => {
  it('ranks names that start with the query first', () => {
    const names = itemOptions('zen', 326).map((o) => o.name)
    expect(names[0]).toBe('Zenith')
    expect(itemOptions('', 326).length).toBe(50)
    expect(itemOptions('celestial sheel', 326).map((o) => o.name)).toContain('Celestial Shell')
  })

  it('filters by slot and save version', () => {
    expect(itemOptions('boots', 326, 'accessory').every((o) => o.name.toLowerCase().includes('boots') || o.name)).toBe(true)
    expect(itemOptions('solar flare', 326, 'head').map((o) => o.name)).toEqual(['Solar Flare Helmet'])
    // Items newer than the save don't show up.
    const v279 = new Set(itemOptions('', 279).map((o) => o.id))
    expect([...v279].every((x) => x < 6000)).toBe(true)
  })

  it('stores IDs for names two items share', () => {
    for (const o of itemOptions('', 326, 'any')) {
      const r = lookupItem(o.value, 326)
      expect(r.ok && r.item.id).toBe(o.id)
    }
  })

  it('lists only modifiers that fit, best first', () => {
    const gun = modifierOptions(itemByKey('Megashark'), 326)
    expect(gun[0]).toMatchObject({ name: 'Unreal', best: true })
    expect(gun.map((m) => m.name)).not.toContain('Legendary')
    const acc = modifierOptions(itemByKey('HermesBoots'), 326)
    expect(acc[0]).toMatchObject({ name: 'Menacing', best: true })
    expect(acc.every((m) => m.id >= 62 && m.id <= 80)).toBe(true)
    expect(modifierOptions(itemByKey('SolarFlareHelmet'), 326)).toEqual([])
    expect(modifierOptions(itemByKey('EmpressBlade'), 326)[0]?.name).toBe('Fabled')
    expect(modifierOptions(itemByKey('EmpressBlade'), 279).map((m) => m.name)).not.toContain('Fabled')
    expect(modifierMatches(acc, 'MEN').map((m) => m.name)).toEqual(['Menacing'])
  })
})

describe('download', () => {
  it('builds a file that reads back the same', async () => {
    const r = await prepareDownload(character())
    expect(r.ok).toBe(true)
  })

  it('keeps the original file name', () => {
    expect(downloadName('C:\\fakepath\\Tester.plr', 'Tester')).toBe('Tester.plr')
    expect(downloadName(undefined, 'A/B:C')).toBe('ABC.plr')
    expect(downloadName(undefined, '   ')).toBe('character.plr')
  })
})
