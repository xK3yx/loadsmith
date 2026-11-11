// Modifier (prefix) lookup and eligibility. The groups and per-class rules
// live in rules/prefix-groups.json (from the Terraria Wiki's Modifiers page).

import { type Suggestion, normalizeName, suggest } from './fuzzy.ts'
import { BEST_PREFIX_RULES, PREFIX_RULES, appliesTo } from './rules/index.ts'
import prefixesJson from './tedit/prefixes.json'
import type { ItemRecord, PrefixRecord } from './types.ts'
import { maxPrefixId } from './versions.ts'
import { type WeaponClass, weaponClassOf } from './weapons.ts'

export const PREFIXES: readonly PrefixRecord[] = prefixesJson as PrefixRecord[]

/** Group name from prefix-groups.json, e.g. "melee", "accessory", "summon". */
export type PrefixCategory = string

/** Groups that are subsets of another group and don't define a category. */
const SUBSET_GROUPS = new Set(['universal-no-crit'])

const categoryOf = new Map<number, PrefixCategory>()
for (const [group, ids] of Object.entries(PREFIX_RULES.groups)) {
  if (SUBSET_GROUPS.has(group)) continue
  for (const id of ids) {
    if (categoryOf.has(id)) throw new Error(`prefix-groups.json: modifier ${id} is in ${categoryOf.get(id)} and ${group}`)
    categoryOf.set(id, group)
  }
}

/** The modifier's group, or undefined if the rule tables don't cover it yet. */
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

export function itemKind(item: ItemRecord, saveVersion?: number): ItemKind {
  const weaponClass = weaponClassOf(item.key, saveVersion)
  if (weaponClass) return { kind: 'weapon', weaponClass }
  if (item.accessory) return { kind: 'accessory' }
  if (item.armor) return { kind: 'armor' }
  if (item.mount) return { kind: 'mount' }
  return { kind: 'other' }
}

/** Modifier IDs a mapped weapon class can take in a save version. */
export function allowedPrefixIds(weaponClass: WeaponClass, saveVersion: number): Set<number> {
  const rule = PREFIX_RULES.classes[weaponClass]?.find((r) => appliesTo(r, saveVersion))
  if (!rule) return new Set()
  return new Set(rule.groups.flatMap((g) => PREFIX_RULES.groups[g] ?? []))
}

/**
 * The best modifier for an item in a save version (rules/best-prefixes.json),
 * or undefined when it can't take one or its weapon type isn't mapped.
 */
export function bestPrefixFor(item: ItemRecord, saveVersion: number): number | undefined {
  const kind = itemKind(item, saveVersion)
  const key = kind.kind === 'weapon' ? kind.weaponClass : kind.kind === 'accessory' ? 'accessory' : undefined
  if (!key) return undefined
  const rule = BEST_PREFIX_RULES[key]?.find((r) => appliesTo(r, saveVersion))
  return rule && rule.prefix <= maxPrefixId(saveVersion) ? rule.prefix : undefined
}

export type PrefixCheck =
  | { ok: true }
  /** Not allowed: blocks the download. */
  | { ok: false; severity: 'error'; reason: 'too-new' | 'not-for-item' | 'no-prefix-allowed' | 'unknown-prefix'; message: string }
  /** Can't verify (weapon not in the class table, or modifier with no rule yet): a warning only. */
  | { ok: false; severity: 'warning'; reason: 'unverified'; message: string }

/** Whether a modifier can go on an item in a save version. */
export function checkPrefix(prefixId: number, item: ItemRecord, saveVersion: number): PrefixCheck {
  if (prefixId === 0) return { ok: true }
  const prefix = byId.get(prefixId)
  if (!prefix) {
    return { ok: false, severity: 'error', reason: 'unknown-prefix', message: `Modifier ${prefixId} doesn't exist.` }
  }
  if (prefixId > maxPrefixId(saveVersion)) {
    return {
      ok: false,
      severity: 'error',
      reason: 'too-new',
      message: `${prefix.name} is newer than this save's version of Terraria.`,
    }
  }
  const category = categoryOf.get(prefixId)
  if (!category) {
    return {
      ok: false,
      severity: 'warning',
      reason: 'unverified',
      message: `${prefix.name} is new and Loadsmith has no rule for it yet, so it can't check that it fits ${item.name}.`,
    }
  }

  const kind = itemKind(item, saveVersion)
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
    if (named && named.length > 1) [prefix, note] = pickSameName(named, item, saveVersion)
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
function pickSameName(
  named: PrefixRecord[],
  item: ItemRecord | undefined,
  saveVersion: number,
): [PrefixRecord, string | undefined] {
  const kind = item ? itemKind(item, saveVersion) : undefined
  const pick = (cat: PrefixCategory): PrefixRecord | undefined => named.find((p) => categoryOf.get(p.id) === cat)

  if (kind?.kind === 'accessory') {
    const acc = pick('accessory')
    if (acc) return [acc, undefined]
  }
  if (kind?.kind === 'weapon') {
    const cls = kind.weaponClass
    const terrarian = pick('terrarian')
    if (cls === 'terrarian' && terrarian) return [terrarian, undefined]
    const ranged = pick('ranged')
    const common = pick('common')
    if (cls === 'ranged' && ranged && common) {
      // Deadly exists as a ranged modifier (20) and a common one (43); both fit guns and bows.
      return [ranged, `Used the ranged ${ranged.name} (${ranged.id}); the common one is ${common.id}.`]
    }
    const allowed = allowedPrefixIds(cls, saveVersion)
    const fit = named.find((p) => allowed.has(p.id))
    if (fit) return [fit, undefined]
  }
  // No item, or nothing decides: prefer the weapon version over accessory or Terrarian variants.
  const fallback = named.find((p) => !['accessory', 'terrarian'].includes(categoryOf.get(p.id) ?? '')) ?? named[0]!
  return [fallback, `${named[0]!.name} is ambiguous (IDs ${named.map((p) => p.id).join(', ')}); used ${fallback.id}.`]
}
