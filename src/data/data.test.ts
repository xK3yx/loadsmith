import { describe, expect, it } from 'vitest'
import {
  ALIAS_RULES,
  ITEMS,
  PREFIXES,
  SUPPORTED_VERSIONS,
  THROWN_CONSUMABLES,
  WEAPON_CLASSES,
  type WeaponClass,
  allowedPrefixIds,
  appliesTo,
  bestPrefixFor,
  checkPrefix,
  checkStack,
  displayName,
  gameVersionsFor,
  itemByKey,
  lookupItem,
  lookupPrefix,
  maxItemId,
  maxPrefixId,
  maxStackFor,
  normalizeName,
  outdatedSaveNotice,
  prefixById,
  prefixCategory,
  saveVersionFor,
} from './index.ts'
import { BEST_PREFIX_RULES } from './rules/index.ts'
import type { ItemRecord } from './types.ts'

const item = (name: string): ItemRecord => {
  const r = lookupItem(name, 326)
  if (!r.ok) throw new Error(`test setup: ${name} not found (${r.reason})`)
  return r.item
}

describe('data integrity', () => {
  it('has unique ids and keys', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
    const keys = ITEMS.flatMap((i) => (i.key ? [i.key] : []))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('maps every weapon class and thrown entry to a real item', () => {
    for (const key of [...Object.keys(WEAPON_CLASSES), ...THROWN_CONSUMABLES]) {
      expect(itemByKey(key), key).toBeDefined()
    }
  })

  it('never classes equipment as a weapon or a thrown consumable', () => {
    for (const key of [...Object.keys(WEAPON_CLASSES), ...THROWN_CONSUMABLES]) {
      const i = itemByKey(key)!
      expect(i.accessory || i.armor || i.mount, key).toBeFalsy()
    }
  })

  it('resolves every alias to a real item', () => {
    for (const key of Object.values(ALIAS_RULES.duplicatePicks)) expect(itemByKey(key), key).toBeDefined()
    for (const { key } of ALIAS_RULES.renamed) expect(itemByKey(key), key).toBeDefined()
  })

  it('has a decision for every name shared by several items', () => {
    const counts = new Map<string, number>()
    for (const i of ITEMS) counts.set(normalizeName(i.name), (counts.get(normalizeName(i.name)) ?? 0) + 1)
    for (const [name, n] of counts) {
      if (n < 2) continue
      const r = lookupItem(name, 326)
      expect(r.ok || (!r.ok && r.reason === 'ambiguous'), name).toBe(true)
    }
  })

  it('has the 1.4.5 summon modifiers at 85-97', () => {
    expect(PREFIXES.filter((p) => p.id >= 85).map((p) => p.name)).toEqual([
      'Fabled',
      'Loyal',
      'Worthy',
      'Focused',
      'Patient',
      'Rabid',
      'Ill-Tempered',
      'Petty',
      'Feeble',
      'Skittish',
      'Eager',
      'Ballistic',
      'Scraggling',
    ])
  })

  it('puts every modifier in exactly one category', () => {
    for (const p of PREFIXES) expect(prefixCategory(p.id), p.name).toBeDefined()
    expect(PREFIXES.length).toBe(97)
  })
})

describe('versions', () => {
  it('supports the released versions from 1.4.4.9 to 1.4.5.8', () => {
    expect(SUPPORTED_VERSIONS).toEqual([279, 315, 316, 317, 318, 319, 325, 326])
  })

  it('knows the item and modifier limits', () => {
    expect(maxItemId(279)).toBe(5455)
    expect(maxItemId(326)).toBe(6195)
    expect(maxPrefixId(279)).toBe(84)
    expect(maxPrefixId(315)).toBe(97)
    expect(() => maxItemId(300)).toThrow(RangeError)
    expect(() => maxItemId(327)).toThrow(RangeError)
  })

  it('maps game versions both ways', () => {
    expect(saveVersionFor('1.4.4.9')).toBe(279)
    expect(saveVersionFor('v1.4.5.8')).toBe(326)
    expect(gameVersionsFor(315)).toEqual(['1.4.5.0', '1.4.5.1', '1.4.5.2'])
  })
})

describe('lookupItem', () => {
  it('finds items by exact name, any case or punctuation', () => {
    for (const q of ['Zenith', 'zenith', '  ZENITH ', 'S.D.M.G.', 'sdmg', 'S D M G', "Jack 'O Lantern Launcher", 'jack o lantern launcher']) {
      expect(lookupItem(q, 326).ok, q).toBe(true)
    }
    expect(item('sdmg').id).toBe(1553)
  })

  it('folds curly quotes and accents', () => {
    expect(item('True Night’s Edge').key).toBe('TrueNightsEdge')
  })

  it('finds items by TEdit key and by id', () => {
    const r = lookupItem('EmpressBlade', 326)
    expect(r.ok && r.item.name).toBe('Terraprisma')
    expect(r.ok && r.matchedBy).toBe('key')
    const byNum = lookupItem(4956, 326)
    expect(byNum.ok && byNum.item.name).toBe('Zenith')
    const byStr = lookupItem('4956', 326)
    expect(byStr.ok && byStr.item.name).toBe('Zenith')
  })

  it('picks the sensible item for shared names', () => {
    expect(item('Restoration Potion').id).toBe(227)
    expect(item('Jungle Key').key).toBe('JungleKey')
    const r = lookupItem('Strange Plant', 326)
    expect(!r.ok && r.reason).toBe('ambiguous')
    expect(!r.ok && r.reason === 'ambiguous' && r.candidates.length).toBe(4)
  })

  it('rejects items newer than the save', () => {
    const r = lookupItem(5456, 279)
    expect(!r.ok && r.reason).toBe('too-new')
    expect(lookupItem(5456, 326).ok).toBe(true)
    const named = lookupItem('Cobwhip', 279)
    expect(!named.ok && named.reason).toBe('too-new')
  })

  it('rejects ids that are in range but not real items', () => {
    const r = lookupItem(2772, 326)
    expect(!r.ok && r.reason).toBe('unknown')
  })

  it('reads pre-1.4.5 names in older saves', () => {
    const old = lookupItem('Flairon', 279)
    expect(old.ok && old.item.key).toBe('Flairon')
    expect(old.ok && displayName(old.item, 279)).toBe('Flairon')
    expect(old.ok && displayName(old.item, 326)).toBe('Flairoon')
    const now = lookupItem('Flairon', 326)
    expect(now.ok && now.item.key).toBe('FlaironFlail')
  })

  it('suggests close names for typos', () => {
    const r = lookupItem('Zenit', 326)
    expect(!r.ok && r.reason === 'unknown' && r.suggestions[0]?.name).toBe('Zenith')

    const swapped = lookupItem('Staff Stardust Dragon', 326)
    expect(!swapped.ok && swapped.reason === 'unknown' && swapped.suggestions[0]?.name).toBe('Stardust Dragon Staff')

    const shield = lookupItem('Celestial Shield', 326)
    expect(!shield.ok && shield.reason === 'unknown' && shield.suggestions.map((s) => s.name)).toContain('Celestial Shell')
  })

  it('only suggests items the save version has', () => {
    const r = lookupItem('Cobwhipp', 279)
    expect(!r.ok && r.reason === 'unknown' && r.suggestions.every((s) => s.value.id <= 5455)).toBe(true)
  })

  it('returns no suggestions for nonsense', () => {
    const r = lookupItem('qqqqzzzz', 326)
    expect(!r.ok && r.reason === 'unknown' && r.suggestions).toEqual([])
  })
})

describe('lookupPrefix', () => {
  it('finds modifiers by name, key and id', () => {
    for (const q of ['Godly', 'godly', 59, '59']) {
      const r = lookupPrefix(q, 326)
      expect(r.ok && r.prefix.id, String(q)).toBe(59)
    }
    const key = lookupPrefix('IllTempered', 326)
    expect(key.ok && key.prefix.name).toBe('Ill-Tempered')
  })

  it('rejects 1.4.5 modifiers in older saves', () => {
    const r = lookupPrefix('Fabled', 279)
    expect(!r.ok && r.reason).toBe('too-new')
    expect(lookupPrefix('Fabled', 315).ok).toBe(true)
  })

  it('uses the item to pick between modifiers that share a name', () => {
    const pick = (name: string, itemName: string) => {
      const r = lookupPrefix(name, 326, item(itemName))
      return r.ok ? r.prefix.id : undefined
    }
    expect(pick('Legendary', 'Zenith')).toBe(81)
    expect(pick('Legendary', 'Terrarian')).toBe(84)
    expect(pick('Hasty', 'Celestial Starboard')).toBe(75)
    expect(pick('Quick', 'Celestial Starboard')).toBe(76)
    expect(pick('Quick', 'Zenith')).toBe(42)
    expect(pick('Hasty', 'S.D.M.G.')).toBe(18)
    expect(pick('Deadly', 'Last Prism')).toBe(43)

    const ranged = lookupPrefix('Deadly', 326, item('S.D.M.G.'))
    expect(ranged.ok && ranged.prefix.id).toBe(20)
    expect(ranged.ok && ranged.note).toMatch(/43/)
  })

  it('notes ambiguity when no item is given', () => {
    const r = lookupPrefix('Legendary', 326)
    expect(r.ok && r.prefix.id).toBe(81)
    expect(r.ok && r.note).toMatch(/ambiguous/)
  })

  it('suggests close modifier names', () => {
    const r = lookupPrefix('Menacin', 326)
    expect(!r.ok && r.reason === 'unknown' && r.suggestions[0]?.name).toBe('Menacing')
  })
})

describe('checkPrefix', () => {
  const ok = (prefix: number, itemName: string, v = 326) => checkPrefix(prefix, item(itemName), v)

  it('allows the right class modifiers', () => {
    expect(ok(81, 'Zenith').ok).toBe(true) // Legendary
    expect(ok(82, 'S.D.M.G.').ok).toBe(true) // Unreal
    expect(ok(83, 'Last Prism').ok).toBe(true) // Mythical
    expect(ok(84, 'Terrarian').ok).toBe(true) // Legendary (Terrarian)
    expect(ok(72, 'Celestial Starboard').ok).toBe(true) // Menacing
    expect(ok(5, 'Kaleidoscope').ok).toBe(true) // whips take melee modifiers
    expect(ok(37, 'Solar Eruption').ok).toBe(true) // universal on a flail
  })

  it('blocks modifiers for the wrong item type', () => {
    expect(ok(81, 'S.D.M.G.')).toMatchObject({ ok: false, severity: 'error' }) // Legendary on a gun
    expect(ok(72, 'Zenith')).toMatchObject({ ok: false, severity: 'error' }) // Menacing on a sword
    expect(ok(81, 'Celestial Starboard')).toMatchObject({ ok: false, severity: 'error' })
    expect(ok(81, 'Terrarian')).toMatchObject({ ok: false, severity: 'error' }) // needs 84
    expect(ok(84, 'Zenith')).toMatchObject({ ok: false, severity: 'error' })
    expect(ok(81, 'Solar Eruption')).toMatchObject({ ok: false, severity: 'error' }) // flails: universal only
    expect(ok(85, 'Kaleidoscope')).toMatchObject({ ok: false, severity: 'error' }) // Fabled on a whip
    expect(ok(59, 'Solar Flare Helmet')).toMatchObject({ ok: false, reason: 'no-prefix-allowed' })
  })

  it('applies the 1.4.5 summon rules only to 1.4.5 saves', () => {
    expect(ok(85, 'Stardust Dragon Staff', 326).ok).toBe(true) // Fabled
    expect(ok(57, 'Stardust Dragon Staff', 326).ok).toBe(true) // Ruthless: universal, no crit
    expect(ok(59, 'Stardust Dragon Staff', 326)).toMatchObject({ ok: false, severity: 'error' }) // Godly has crit
    expect(ok(83, 'Stardust Dragon Staff', 326)).toMatchObject({ ok: false, severity: 'error' })

    expect(ok(85, 'Stardust Dragon Staff', 279)).toMatchObject({ ok: false, reason: 'too-new' })
    expect(ok(59, 'Stardust Dragon Staff', 279).ok).toBe(true)
    expect(ok(83, 'Stardust Dragon Staff', 279).ok).toBe(true) // pre-1.4.5 staffs used the magic pool
  })

  it('only warns for weapons it does not know', () => {
    expect(ok(59, 'Copper Broadsword')).toMatchObject({ ok: false, severity: 'warning', reason: 'unverified' })
    expect(ok(72, 'Copper Broadsword')).toMatchObject({ ok: false, severity: 'error' }) // accessory modifier on a non-accessory
  })

  it('treats 0 as no modifier', () => {
    expect(ok(0, 'Solar Flare Helmet').ok).toBe(true)
  })
})

describe('stacks', () => {
  it('forces 1 for known single items', () => {
    for (const n of ['Zenith', 'Terraprisma', 'Solar Flare Helmet', 'Celestial Starboard', 'Cosmic Car Key']) {
      expect(maxStackFor(item(n)), n).toEqual({ max: 1, basis: 'single' })
    }
  })

  it('uses real coin limits', () => {
    expect(maxStackFor(item('Copper Coin')).max).toBe(100)
    expect(maxStackFor(item('Gold Coin')).max).toBe(100)
    expect(maxStackFor(item('Platinum Coin')).max).toBe(9999)
  })

  it('treats consumables, ammo, food, blocks and thrown weapons as stackable', () => {
    for (const n of ['Super Healing Potion', 'Wooden Arrow', 'Chlorophyte Bullet', 'Dirt Block', 'Shuriken', 'Throwing Knife', 'Bone Javelin', 'Grenade']) {
      expect(maxStackFor(item(n)), n).toEqual({ max: 9999, basis: 'stackable' })
    }
  })

  it('does not treat rackable as single', () => {
    expect(item('Shuriken').rackable).toBe(true)
    expect(maxStackFor(item('Shuriken')).max).toBe(9999)
  })

  it('allows unclear items up to 9999 with a warning', () => {
    expect(maxStackFor(item('Grappling Hook'))).toEqual({ max: 9999, basis: 'unclear' })
    expect(checkStack(item('Grappling Hook'), 5)).toMatchObject({ ok: false, severity: 'warning' })
    expect(checkStack(item('Grappling Hook'), 1)).toEqual({ ok: true, stack: 1 })
  })

  it('blocks stacks over the limit or below 1', () => {
    expect(checkStack(item('Zenith'), 2)).toMatchObject({ ok: false, severity: 'error' })
    expect(checkStack(item('Gold Coin'), 101)).toMatchObject({ ok: false, severity: 'error' })
    expect(checkStack(item('Wooden Arrow'), 10000)).toMatchObject({ ok: false, severity: 'error' })
    expect(checkStack(item('Wooden Arrow'), 0)).toMatchObject({ ok: false, severity: 'error' })
    expect(checkStack(item('Wooden Arrow'), 1.5)).toMatchObject({ ok: false, severity: 'error' })
    expect(checkStack(item('Super Healing Potion'), 9999)).toEqual({ ok: true, stack: 9999 })
  })
})

describe('best modifiers', () => {
  it('every best modifier is one its type can roll, in every supported version', () => {
    const bad: string[] = []
    for (const v of SUPPORTED_VERSIONS) {
      for (const [type, rules] of Object.entries(BEST_PREFIX_RULES)) {
        const rule = rules.find((r) => appliesTo(r, v))
        if (!rule) {
          bad.push(`${type} @${v}: no rule`)
          continue
        }
        const ok = type === 'accessory' ? prefixCategory(rule.prefix) === 'accessory' : allowedPrefixIds(type as WeaponClass, v).has(rule.prefix)
        if (!ok || rule.prefix > maxPrefixId(v)) bad.push(`${type} @${v}: ${rule.prefix}`)
        if (rule.name && prefixById(rule.prefix)?.name !== rule.name) bad.push(`${type}: ${rule.prefix} is not ${rule.name}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('picks by item type and version', () => {
    const get = (key: string, v: number) => bestPrefixFor(itemByKey(key)!, v)
    expect(get('Zenith', 326)).toBe(81)
    expect(get('EmpressBlade', 279)).toBe(57)
    expect(get('EmpressBlade', 326)).toBe(85)
    expect(get('AnkhShield', 326)).toBe(72)
    expect(get('SolarFlareHelmet', 326)).toBeUndefined()
  })
})

describe('outdated save notice', () => {
  it('asks older saves to be loaded and saved in-game first, and says nothing for current ones', () => {
    const notice = outdatedSaveNotice(279)
    expect(notice).toMatch(/last saved in Terraria 1\.4\.4\.9/)
    expect(notice).toMatch(/load it in Terraria 1\.4\.5\.8/)
    expect(notice).toMatch(/save and quit once/)
    expect(outdatedSaveNotice(315)).toMatch(/last saved in Terraria 1\.4\.5\.2/)
    expect(outdatedSaveNotice(326)).toBeUndefined()
    for (const v of SUPPORTED_VERSIONS) expect(outdatedSaveNotice(v) === undefined).toBe(v === Math.max(...SUPPORTED_VERSIONS))
  })
})
