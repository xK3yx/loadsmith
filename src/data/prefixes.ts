// Modifier (prefix) lookup and eligibility.
//
// Categories follow the Terraria Wiki's Modifiers page (checked Nov 2026):
// 14 universal, 10 common, 16 melee, 12 ranged, 12 magic, 13 summon (1.4.5),
// 19 accessory, plus prefix 84, the Terrarian's own Legendary. TEdit's
// prefixes.json has names only, so these groupings are hand-made.

import { type Suggestion, normalizeName, suggest } from './fuzzy.ts'
import prefixesJson from './tedit/prefixes.json'
import type { ItemRecord, PrefixRecord } from './types.ts'
import { FIRST_145_VERSION, maxPrefixId } from './versions.ts'
import { type WeaponClass, WEAPON_CLASSES } from './weaponClasses.ts'

export const PREFIXES: readonly PrefixRecord[] = prefixesJson as PrefixRecord[]

export type PrefixCategory = 'universal' | 'common' | 'melee' | 'ranged' | 'magic' | 'summon' | 'accessory' | 'terrarian'

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const CATEGORY_IDS: Record<PrefixCategory, number[]> = {
  melee: [...range(1, 15), 81],
  ranged: [...range(16, 25), 58, 82],
  magic: [...range(26, 35), 52, 83],
  universal: [...range(36, 41), ...range(53, 57), 59, 60, 61],
  common: range(42, 51),
  accessory: range(62, 80),
  terrarian: [84],
  summon: range(85, 97),
}

/** Universal modifiers that add crit, which summon weapons can't take in 1.4.5. */
const CRIT_UNIVERSAL = new Set([36, 37, 59, 60, 61]) // Keen, Superior, Godly, Demonic, Zealous

const categoryOf = new Map<number, PrefixCategory>()
for (const [cat, ids] of Object.entries(CATEGORY_IDS) as [PrefixCategory, number[]][]) {
  for (const id of ids) categoryOf.set(id, cat)
}

export function prefixCategory(id: number): PrefixCategory | undefined {
  return categoryOf.get(id)
}

const byId = new Map(PREFIXES.map((p) => [p.id, p]))
const byName = new Map<string, PrefixRecord[]>()
const byKey = new Map<string, PrefixRecord>()
for (const p of PREFIXES) {
  const n = normalizeName(p.name)
  byName.set(n, [...(byName.get(n) ?? []), p])
  byKey.set(normalizeName(p.key), p)
}

export function prefixById(id: number): PrefixRecord | undefined {
  return byId.get(id)
}

/** What kind of item this is, for modifier and stack rules. */
export type ItemKind =
  | { kind: 'weapon'; weaponClass: WeaponClass }
  | { kind: 'accessory' }
  | { kind: 'armor' }
  | { kind: 'mount' }
  | { kind: 'other' }

export function itemKind(item: ItemRecord): ItemKind {
  const weaponClass = item.key ? WEAPON_CLASSES[item.key] : undefined
  if (weaponClass) return { kind: 'weapon', weaponClass }
  if (item.accessory) return { kind: 'accessory' }
  if (item.armor) return { kind: 'armor' }
  if (item.mount) return { kind: 'mount' }
  return { kind: 'other' }
}

/** Modifier IDs a mapped weapon class can take in a save version. */
export function allowedPrefixIds(weaponClass: WeaponClass, saveVersion: number): Set<number> {
  const ids = (cats: PrefixCategory[]): number[] => cats.flatMap((c) => CATEGORY_IDS[c])
  switch (weaponClass) {
    case 'melee':
    case 'whip':
      return new Set(ids(['melee', 'common', 'universal']))
    case 'melee-universal':
      return new Set(ids(['universal']))
    case 'terrarian':
      return new Set(ids(['universal', 'terrarian']))
    case 'ranged':
      return new Set(ids(['ranged', 'common', 'universal']))
    case 'magic':
      return new Set(ids(['magic', 'common', 'universal']))
    case 'summon':
      // 1.4.5 added the summon set and limited summon weapons to universal
      // modifiers without crit. Before 1.4.5 they rolled the magic pool
      // (magic + common + universal). Real saves confirm both: a 1.4.4.9 save
      // has staffs with Deadly (43) and Mythical (83), and after loading in
      // 1.4.5.8 the game reset or rerolled exactly those modifiers.
      return saveVersion >= FIRST_145_VERSION
        ? new Set([...ids(['summon']), ...ids(['universal']).filter((id) => !CRIT_UNIVERSAL.has(id))])
        : new Set(ids(['magic', 'common', 'universal']))
  }
}

export type PrefixCheck =
  | { ok: true }
  /** Not allowed: blocks the download. */
  | { ok: false; severity: 'error'; reason: 'too-new' | 'not-for-item' | 'no-prefix-allowed' | 'unknown-prefix'; message: string }
  /** Can't verify (weapon not in the class table): a warning only. */
  | { ok: false; severity: 'warning'; reason: 'unverified'; message: string }

/** Whether a modifier can go on an item in a save version. */
export function checkPrefix(prefixId: number, item: ItemRecord, saveVersion: number): PrefixCheck {
  if (prefixId === 0) return { ok: true }
  const prefix = byId.get(prefixId)
  const category = categoryOf.get(prefixId)
  if (!prefix || !category) {
    return { ok: false, severity: 'error', reason: 'unknown-prefix', message: `Modifier ${prefixId} doesn't exist.` }
  }
  const limit = maxPrefixId(saveVersion)
  if (prefixId > limit) {
    return {
      ok: false,
      severity: 'error',
      reason: 'too-new',
      message: `${prefix.name} is a 1.4.5 modifier and this save is older than 1.4.5.`,
    }
  }

  const kind = itemKind(item)
  const notFor = (): PrefixCheck => ({
    ok: false,
    severity: 'error',
    reason: 'not-for-item',
    message: `${prefix.name} can't go on ${item.name}.`,
  })
  switch (kind.kind) {
    case 'accessory':
      return category === 'accessory' ? { ok: true } : notFor()
    case 'armor':
    case 'mount':
      return { ok: false, severity: 'error', reason: 'no-prefix-allowed', message: `${item.name} can't have a modifier.` }
    case 'weapon':
      return allowedPrefixIds(kind.weaponClass, saveVersion).has(prefixId) ? { ok: true } : notFor()
    case 'other':
      if (category === 'accessory') return notFor()
      return {
        ok: false,
        severity: 'warning',
        reason: 'unverified',
        message: `Can't check whether ${prefix.name} fits ${item.name}; Loadsmith doesn't know its weapon type.`,
      }
  }
}

export type PrefixLookup =
  | { ok: true; prefix: PrefixRecord; note?: string }
  | { ok: false; reason: 'unknown'; input: string; suggestions: Suggestion<PrefixRecord>[] }
  | { ok: false; reason: 'too-new'; input: string; prefix: PrefixRecord; maxPrefixId: number }

/**
 * Finds a modifier by name, TEdit key or ID. Some names belong to two
 * modifiers (Hasty, Quick, Deadly, Legendary); the item decides which one.
 */
export function lookupPrefix(input: string | number, saveVersion: number, item?: ItemRecord): PrefixLookup {
  const raw = String(input).trim()
  const limit = maxPrefixId(saveVersion)
  let prefix: PrefixRecord | undefined
  let note: string | undefined

  if (/^\d+$/.test(raw)) {
    prefix = byId.get(Number(raw))
  } else {
    const n = normalizeName(raw)
    const named = byName.get(n)
    if (named && named.length > 1) [prefix, note] = pickSameName(named, item)
    else prefix = named?.[0] ?? byKey.get(n)
  }

  if (!prefix) {
    const candidates = PREFIXES.filter((p) => p.id <= limit).map((p) => ({ value: p, name: p.name }))
    return { ok: false, reason: 'unknown', input: raw, suggestions: suggest(raw, candidates) }
  }
  if (prefix.id > limit) return { ok: false, reason: 'too-new', input: raw, prefix, maxPrefixId: limit }
  return note ? { ok: true, prefix, note } : { ok: true, prefix }
}

/** Chooses between two modifiers that share a name, using the item. */
function pickSameName(named: PrefixRecord[], item: ItemRecord | undefined): [PrefixRecord, string | undefined] {
  const kind = item ? itemKind(item) : undefined
  const cats = named.map((p) => categoryOf.get(p.id))
  const pick = (cat: PrefixCategory): PrefixRecord | undefined => named[cats.indexOf(cat)]

  if (kind?.kind === 'accessory') {
    const acc = pick('accessory')
    if (acc) return [acc, undefined]
  }
  if (kind?.kind === 'weapon') {
    const cls = kind.weaponClass
    if (cls === 'terrarian' && pick('terrarian')) return [pick('terrarian')!, undefined]
    if (cls === 'ranged' && pick('ranged') && pick('common')) {
      // Deadly exists as a ranged modifier (20) and a common one (43); both fit guns and bows.
      return [pick('ranged')!, `Used the ranged ${named[0]!.name} (${pick('ranged')!.id}); the common one is ${pick('common')!.id}.`]
    }
    const allowed = allowedPrefixIds(cls, Number.MAX_SAFE_INTEGER)
    const fit = named.find((p) => allowed.has(p.id))
    if (fit) return [fit, undefined]
  }
  // No item, or nothing decides: prefer the weapon version over accessory or Terrarian variants.
  const fallback = named.find((p) => !['accessory', 'terrarian'].includes(categoryOf.get(p.id) ?? '')) ?? named[0]!
  return [fallback, `${named[0]!.name} is ambiguous (IDs ${named.map((p) => p.id).join(', ')}); used ${fallback.id}.`]
}
