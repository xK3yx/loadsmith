// Checks a parsed loadsmith/1 loadout against a character, using src/data/.
// Errors block the download; warnings are shown but don't.

import {
  type ItemRecord,
  RESEARCH_UNVERIFIED,
  checkPrefix,
  checkStack,
  displayName,
  itemByKey,
  itemKind,
  lookupItem,
  lookupPrefix,
  maxStackFor,
  saveVersionFor,
  suggest,
} from '../data/index.ts'
import { PLAYER_FLAGS, type PlayerCharacter, type PlayerFlag, playerFlag } from '../format/index.ts'
import {
  BOOSTERS,
  CHARACTER_KEYS,
  type Entry,
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
  type GearSet,
  type ItemRef,
  KNOWN_KEYS,
  type Loadout,
  STORAGE_NAMES,
  type StorageName,
} from './schema.ts'
import { ARMOR_KINDS, COIN_KEYS, MAIN, accessorySlotCount } from './slots.ts'

export interface Issue {
  severity: 'error' | 'warning'
  path: string
  message: string
  suggestions?: string[]
}

export interface ResolvedEntry {
  item: ItemRecord
  prefix: number
  /** Whether the loadout named a modifier (prefix 0 then means "none"). */
  prefixGiven: boolean
  stack: number
  favorite: boolean
  path: string
}

export interface ResolvedGearSet {
  loadout: 1 | 2 | 3
  /** Head, body, legs; null leaves the slot as it is. Absent = armor not set. */
  armor?: (ResolvedEntry | null)[]
  accessories?: ResolvedEntry[]
}

export interface ResolvedFlag {
  flag: PlayerFlag
  value: boolean
  path: string
}

export interface ResolvedLoadout {
  gearSets: ResolvedGearSet[]
  weapons?: ResolvedEntry[]
  hotbar?: (ItemRecord | null)[]
  ammo?: ResolvedEntry[]
  coins?: ResolvedEntry[]
  equipment: Partial<Record<EquipmentSlot, ResolvedEntry>>
  items?: ResolvedEntry[]
  storage: Partial<Record<StorageName, { mode: 'add' | 'replace'; items: ResolvedEntry[] }>>
  character: {
    maxLife?: number
    maxMana?: number
    flags: ResolvedFlag[]
    fullResearch: boolean
  }
  unsupported: { recommendation: string; reason?: string }[]
  notes?: string
}

export interface Validation {
  errors: Issue[]
  warnings: Issue[]
  /** Present when there are no errors. */
  resolved?: ResolvedLoadout
}

export const MAX_LIFE_CAP = 500
export const MAX_MANA_CAP = 200

/** Booster names in loadsmith/1 mapped to the player flags they set. */
export const BOOSTER_FLAGS: Record<(typeof BOOSTERS)[number], string[]> = {
  vital_crystal: ['used_aegis_crystal'],
  aegis_fruit: ['used_aegis_fruit'],
  arcane_crystal: ['used_arcane_crystal'],
  galaxy_pearl: ['used_galaxy_pearl'],
  gummy_worm: ['used_gummy_worm'],
  ambrosia: ['used_ambrosia'],
  artisan_loaf: ['ate_artisan_bread'],
  torch_god: ['unlocked_biome_torches', 'using_biome_torches'],
}

export function validateLoadout(loadout: Loadout, p: PlayerCharacter): Validation {
  const v = new Validator(p)
  const resolved = v.run(loadout)
  return v.errors.length > 0 ? { errors: v.errors, warnings: v.warnings } : { errors: [], warnings: v.warnings, resolved }
}

class Validator {
  readonly errors: Issue[] = []
  readonly warnings: Issue[] = []
  private readonly p: PlayerCharacter
  private readonly version: number

  constructor(p: PlayerCharacter) {
    this.p = p
    this.version = p.version
  }

  private error(path: string, message: string, suggestions?: string[]): void {
    this.errors.push(suggestions?.length ? { severity: 'error', path, message, suggestions } : { severity: 'error', path, message })
  }

  private warn(path: string, message: string): void {
    this.warnings.push({ severity: 'warning', path, message })
  }

  run(l: Loadout): ResolvedLoadout {
    this.checkUnknownKeys(l)
    this.checkMeta(l)

    const out: ResolvedLoadout = {
      gearSets: this.gearSets(l),
      equipment: {},
      storage: {},
      character: { flags: [], fullResearch: false },
      unsupported: (l.unsupported ?? []).map((u) => (typeof u === 'string' ? { recommendation: u } : u)),
    }
    if (l.notes !== undefined) out.notes = l.notes

    if (l.weapons) out.weapons = this.entries(l.weapons, 'weapons', { weapon: true })
    if (l.ammo) out.ammo = this.entries(l.ammo, 'ammo', {})
    if (l.coins) out.coins = this.coins(l.coins)
    if (l.equipment) out.equipment = this.equipment(l.equipment)
    if (l.items) out.items = this.entries(l.items, 'items', {})
    if (l.storage) out.storage = this.storage(l.storage)
    if (l.hotbar) out.hotbar = this.hotbar(l.hotbar, out)
    if (l.character) out.character = this.character(l.character as Record<string, unknown>)
    return out
  }

  // ---------------------------------------------------------------- general

  private checkUnknownKeys(l: Loadout): void {
    const check = (obj: unknown, known: readonly string[], path: string) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
      for (const key of Object.keys(obj)) {
        if (!known.includes(key)) this.warn(path ? `${path}.${key}` : key, `Unknown key "${key}" is ignored.`)
      }
    }
    const checkEntries = (list: unknown, path: string) => {
      if (Array.isArray(list)) list.forEach((e, i) => check(e, KNOWN_KEYS.entry, `${path}[${i}]`))
    }
    const checkSet = (set: unknown, path: string) => {
      check(set, KNOWN_KEYS.gearSet, path)
      if (set && typeof set === 'object') {
        checkEntries((set as GearSet).armor, `${path}.armor`)
        checkEntries((set as GearSet).accessories, `${path}.accessories`)
      }
    }
    check(l, KNOWN_KEYS.top, '')
    check(l.target, KNOWN_KEYS.target, 'target')
    check(l.coins, KNOWN_KEYS.coins, 'coins')
    check(l.equipment, EQUIPMENT_SLOTS, 'equipment')
    check(l.storage, STORAGE_NAMES, 'storage')
    check(l.loadouts, ['1', '2', '3'], 'loadouts')
    checkSet({ armor: l.armor, accessories: l.accessories }, '')
    for (const n of ['1', '2', '3'] as const) if (l.loadouts?.[n]) checkSet(l.loadouts[n], `loadouts.${n}`)
    for (const key of ['weapons', 'ammo', 'items'] as const) checkEntries(l[key], key)
    for (const s of STORAGE_NAMES) {
      check(l.storage?.[s], KNOWN_KEYS.storage, `storage.${s}`)
      checkEntries(l.storage?.[s]?.items, `storage.${s}.items`)
    }
    for (const s of EQUIPMENT_SLOTS) check(l.equipment?.[s], KNOWN_KEYS.entry, `equipment.${s}`)
    l.unsupported?.forEach((u, i) => check(u, KNOWN_KEYS.unsupported, `unsupported[${i}]`))
  }

  private checkMeta(l: Loadout): void {
    if (l.game_version !== undefined) {
      const sv = saveVersionFor(l.game_version)
      if (sv === undefined) this.warn('game_version', `Unknown game version "${l.game_version}".`)
      else if (sv < this.version) {
        this.warn('game_version', `The loadout was researched for ${l.game_version}, older than this save. Newer gear may be missing.`)
      } else if (sv > this.version) {
        this.warn('game_version', `The loadout was written for ${l.game_version}, newer than this save. Items from later versions will be rejected.`)
      }
    }
    const journey = this.p.difficulty === 3
    if (l.target?.mode === 'journey' && !journey) this.warn('target.mode', 'The loadout targets Journey mode, but this is a Classic character.')
    if (l.target?.mode === 'classic' && journey) this.warn('target.mode', 'The loadout targets Classic mode, but this is a Journey character.')
  }

  /** Resolves one entry: item, modifier, stack and favorite. */
  private entry(
    e: Entry,
    path: string,
    opts: { weapon?: boolean; noPrefix?: boolean; noStack?: boolean },
  ): ResolvedEntry | undefined {
    const obj = typeof e === 'object' ? e : { item: e }
    const item = this.item(obj.item, path)
    if (!item) return undefined

    let prefix = 0
    const prefixGiven = obj.prefix !== undefined && obj.prefix !== ''
    if (obj.prefix !== undefined && obj.prefix !== '' && obj.prefix !== 0) {
      if (opts.noPrefix) {
        this.error(`${path}.prefix`, `${item.name} can't have a modifier in this slot.`)
      } else {
        const r = lookupPrefix(obj.prefix, this.version, item)
        if (!r.ok && r.reason === 'unknown') {
          this.error(`${path}.prefix`, `Unknown modifier "${r.input}".`, r.suggestions.map((s) => s.name))
        } else if (!r.ok) {
          this.error(`${path}.prefix`, `${r.prefix.name} is newer than this save's version of Terraria.`)
        } else {
          if (r.note) this.warn(`${path}.prefix`, r.note)
          const check = checkPrefix(r.prefix.id, item, this.version)
          if (!check.ok && check.severity === 'error') this.error(`${path}.prefix`, check.message)
          else if (!check.ok) this.warn(`${path}.prefix`, check.message)
          prefix = r.prefix.id
        }
      }
    }

    let stack = obj.stack ?? 1
    if (opts.noStack && stack !== 1) {
      this.error(`${path}.stack`, `${item.name} goes in a single slot; its stack must be 1.`)
      stack = 1
    } else {
      const check = checkStack(item, stack)
      if (!check.ok && check.severity === 'error') this.error(`${path}.stack`, check.message)
      else if (!check.ok) this.warn(`${path}.stack`, check.message)
    }

    if (opts.weapon && itemKind(item, this.version).kind !== 'weapon' && !item.rackable) {
      this.warn(path, `${item.name} isn't a known weapon.`)
    }
    return { item, prefix, prefixGiven, stack, favorite: obj.favorite ?? false, path }
  }

  private entries(list: Entry[], path: string, opts: { weapon?: boolean }): ResolvedEntry[] {
    return list.flatMap((e, i) => this.entry(e, `${path}[${i}]`, opts) ?? [])
  }

  private item(ref: ItemRef, path: string): ItemRecord | undefined {
    const r = lookupItem(ref, this.version)
    if (r.ok) return r.item
    switch (r.reason) {
      case 'unknown':
        this.error(path, `Unknown item "${r.input}".`, r.suggestions.map((s) => s.name))
        return undefined
      case 'ambiguous':
        this.error(
          path,
          `"${r.input}" matches several items; use an item ID.`,
          r.candidates.map((c) => `${displayName(c, this.version)} (${c.id})`),
        )
        return undefined
      case 'too-new':
        this.error(path, `${r.item.name} doesn't exist in this save's version of Terraria.`)
        return undefined
    }
  }

  // ---------------------------------------------------------------- gear

  private gearSets(l: Loadout): ResolvedGearSet[] {
    const sets: ResolvedGearSet[] = []
    const topLevel = l.armor !== undefined || l.accessories !== undefined
    if (topLevel && l.loadouts?.['1']) {
      this.error('loadouts.1', 'Loadout 1 is set twice: by top-level armor/accessories and by loadouts."1". Use one.')
    }
    const demonHeart = l.character?.demon_heart ?? this.p.extraAccessory
    const sources: [1 | 2 | 3, GearSet | undefined, string][] = [
      [1, topLevel ? { armor: l.armor, accessories: l.accessories } : l.loadouts?.['1'], topLevel ? '' : 'loadouts.1'],
      [2, l.loadouts?.['2'], 'loadouts.2'],
      [3, l.loadouts?.['3'], 'loadouts.3'],
    ]
    for (const [n, set, base] of sources) {
      if (!set) continue
      const at = (k: string) => (base ? `${base}.${k}` : k)
      const out: ResolvedGearSet = { loadout: n }
      if (set.armor) {
        out.armor = set.armor.map((e, i) => {
          if (e === null) return null
          const r = this.entry(e, at(`armor[${i}]`), { noStack: true })
          const want = ARMOR_KINDS[i]!
          if (r && r.item.armor !== want) {
            this.error(at(`armor[${i}]`), `${r.item.name} isn't ${want === 'head' ? 'a helmet' : want === 'body' ? 'a chest piece' : 'leggings'}; armor goes head, body, legs.`)
          }
          return r ?? null
        })
      }
      if (set.accessories) {
        const accs = this.entries(set.accessories, at('accessories'), {})
        for (const a of accs) {
          if (!a.item.accessory) this.error(a.path, `${a.item.name} isn't an accessory.`)
          if (a.stack !== 1) this.error(`${a.path}.stack`, 'Accessories go in single slots; stack must be 1.')
        }
        const seen = new Set<number>()
        for (const a of accs) {
          if (seen.has(a.item.id)) this.error(a.path, `${a.item.name} is equipped twice; the game allows one of each accessory.`)
          seen.add(a.item.id)
        }
        const wings = accs.filter((a) => a.item.wings)
        if (wings.length > 1) {
          this.error(at('accessories'), `Only one pair of wings can be equipped, but this loadout has ${wings.map((w) => w.item.name).join(', ')}.`)
        }
        const slots = accessorySlotCount(l.target?.world_difficulty, demonHeart)
        if (slots === undefined && accs.length > 5) {
          this.warn(at('accessories'), `${accs.length} accessories need an Expert or Master world (5 slots in Classic). Set target.world_difficulty to check.`)
        } else if (slots !== undefined && accs.length > slots) {
          this.warn(at('accessories'), `${accs.length} accessories, but a ${l.target?.world_difficulty} world gives ${slots} slots. The extra ones won't do anything.`)
        }
        out.accessories = accs
      }
      sets.push(out)
    }
    return sets
  }

  private coins(c: NonNullable<Loadout['coins']>): ResolvedEntry[] {
    const out: ResolvedEntry[] = []
    for (const [name, key] of Object.entries(COIN_KEYS) as [keyof typeof COIN_KEYS, string][]) {
      const count = c[name]
      if (!count) continue
      const item = itemByKey(key)!
      const max = maxStackFor(item).max
      if (count > max) {
        this.error(`coins.${name}`, `A coin slot holds at most ${max} ${item.name}s.`)
        continue
      }
      out.push({ item, prefix: 0, prefixGiven: false, stack: count, favorite: false, path: `coins.${name}` })
    }
    return out
  }

  private equipment(eq: NonNullable<Loadout['equipment']>): Partial<Record<EquipmentSlot, ResolvedEntry>> {
    const out: Partial<Record<EquipmentSlot, ResolvedEntry>> = {}
    for (const slot of EQUIPMENT_SLOTS) {
      const e = eq[slot]
      if (e === undefined) continue
      const r = this.entry(e, `equipment.${slot}`, { noPrefix: true, noStack: true })
      if (!r) continue
      if ((slot === 'mount' || slot === 'minecart') && !r.item.mount) {
        this.warn(`equipment.${slot}`, `${r.item.name} isn't a known mount item.`)
      }
      if (r.item.accessory || r.item.armor) this.error(`equipment.${slot}`, `${r.item.name} doesn't go in the ${slot.replace('_', ' ')} slot.`)
      out[slot] = r
    }
    return out
  }

  private storage(s: NonNullable<Loadout['storage']>): ResolvedLoadout['storage'] {
    const out: ResolvedLoadout['storage'] = {}
    for (const name of STORAGE_NAMES) {
      const space = s[name]
      if (!space) continue
      out[name] = { mode: space.mode ?? 'add', items: this.entries(space.items, `storage.${name}.items`, {}) }
    }
    return out
  }

  private hotbar(refs: (ItemRef | null)[], out: ResolvedLoadout): (ItemRecord | null)[] {
    // Items the loadout places, plus what the character already has in the
    // inventory or storage (the hotbar swaps items in from either).
    const available = new Set<number>([
      ...(out.weapons ?? []).map((e) => e.item.id),
      ...(out.items ?? []).map((e) => e.item.id),
      ...Object.values(out.storage).flatMap((s) => s.items.map((e) => e.item.id)),
      ...this.p.inventory.slice(0, MAIN.end + 1).map((i) => i.netId),
      ...[this.p.bank1, this.p.bank2, this.p.bank3, this.p.bank4].flatMap((b) => b.map((i) => i.netId)),
    ])
    return refs.map((ref, i) => {
      if (ref === null) return null
      const item = this.item(ref, `hotbar[${i}]`)
      if (!item) return null
      if (!available.has(item.id)) {
        this.error(`hotbar[${i}]`, `${item.name} isn't in the inventory, storage, or this loadout's weapons, items or storage.`)
      }
      return item
    })
  }

  // ---------------------------------------------------------------- character

  private character(c: Record<string, unknown>): ResolvedLoadout['character'] {
    const out: ResolvedLoadout['character'] = { flags: [], fullResearch: false }
    const setFlag = (name: string, value: boolean, path: string) => {
      const flag = playerFlag(name)
      if (!flag) {
        const options = [...PLAYER_FLAGS.map((f) => f.name), ...CHARACTER_KEYS]
        this.error(path, `Unknown character setting "${name}".`, suggest(name, options.map((o) => ({ value: o, name: o }))).map((s) => s.name))
        return
      }
      if (this.version < flag.since) {
        this.error(path, `${name} doesn't exist in this save's version of Terraria.`)
        return
      }
      out.flags.push({ flag, value, path })
    }

    if (typeof c.max_life === 'number') {
      if (c.max_life > MAX_LIFE_CAP) this.error('character.max_life', `Max life can be at most ${MAX_LIFE_CAP}.`)
      else if (c.max_life < 100) this.warn('character.max_life', 'Max life below 100 is lower than a new character.')
      out.maxLife = Math.min(c.max_life, MAX_LIFE_CAP)
    }
    if (typeof c.max_mana === 'number') {
      if (c.max_mana > MAX_MANA_CAP) this.error('character.max_mana', `Max mana can be at most ${MAX_MANA_CAP}.`)
      else if (c.max_mana < 20) this.warn('character.max_mana', 'Max mana below 20 is lower than a new character.')
      out.maxMana = Math.min(c.max_mana, MAX_MANA_CAP)
    }
    if (typeof c.demon_heart === 'boolean') setFlag('extra_accessory', c.demon_heart, 'character.demon_heart')
    if (typeof c.minecart_upgrade === 'boolean') {
      setFlag('unlocked_super_cart', c.minecart_upgrade, 'character.minecart_upgrade')
      setFlag('enabled_super_cart', c.minecart_upgrade, 'character.minecart_upgrade')
    }
    if (c.boosters !== undefined) {
      const list = c.boosters === 'all' ? BOOSTERS : (c.boosters as (typeof BOOSTERS)[number][])
      for (const b of list) for (const name of BOOSTER_FLAGS[b]) setFlag(name, true, 'character.boosters')
    }
    if (c.journey_research === 'full') {
      if (this.p.difficulty !== 3) {
        this.error('character.journey_research', 'Full research is only for Journey characters.')
      } else {
        out.fullResearch = true
        if (RESEARCH_UNVERIFIED) {
          this.warn(
            'character.journey_research',
            "Full research uses the wiki's research amounts, which haven't been checked in-game yet. Keep a backup.",
          )
        }
      }
    }

    // Any other key is a player flag by name, which must be true or false.
    for (const [key, value] of Object.entries(c)) {
      if ((CHARACTER_KEYS as readonly string[]).includes(key)) continue
      if (typeof value !== 'boolean') {
        this.error(`character.${key}`, `"${key}" must be true or false.`)
        continue
      }
      setFlag(key, value, `character.${key}`)
    }
    return out
  }
}
