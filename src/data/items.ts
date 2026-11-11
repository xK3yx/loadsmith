// Item lookup by English name, TEdit key or numeric ID, version-aware.
// Name fixes (shared names, renamed items) come from rules/aliases.json.

import { type Suggestion, normalizeName, suggest } from './fuzzy.ts'
import { ALIAS_RULES } from './rules/index.ts'
import itemsJson from './tedit/items.json'
import type { ItemRecord } from './types.ts'
import { maxItemId } from './versions.ts'

export const ITEMS: readonly ItemRecord[] = itemsJson as ItemRecord[]

const byId = new Map<number, ItemRecord>()
const byKey = new Map<string, ItemRecord>()
const byName = new Map<string, ItemRecord[]>()
for (const item of ITEMS) {
  byId.set(item.id, item)
  if (item.key) byKey.set(normalizeName(item.key), item)
  const n = normalizeName(item.name)
  const list = byName.get(n)
  if (list) list.push(item)
  else byName.set(n, [item])
}

const AMBIGUOUS = new Set(ALIAS_RULES.ambiguous)

export function itemById(id: number): ItemRecord | undefined {
  return byId.get(id)
}

export function itemByKey(key: string): ItemRecord | undefined {
  return byKey.get(normalizeName(key))
}

/** Old name of an item in a save version, if it was renamed after that version. */
function oldNameIn(item: ItemRecord, saveVersion: number): string | undefined {
  const matches = ALIAS_RULES.renamed.filter((a) => a.key === item.key && saveVersion <= a.until)
  // The earliest rename that still applies is the name this save version used.
  return matches.sort((a, b) => a.until - b.until)[0]?.name
}

/** Name to show for an item in a given save version (renamed items show their old name). */
export function displayName(item: ItemRecord, saveVersion: number): string {
  return oldNameIn(item, saveVersion) ?? item.name
}

export function itemExistsIn(id: number, saveVersion: number): boolean {
  return byId.has(id) && id <= maxItemId(saveVersion)
}

export type ItemLookup =
  | { ok: true; item: ItemRecord; matchedBy: 'id' | 'name' | 'key' | 'alias' }
  | { ok: false; reason: 'unknown'; input: string; suggestions: Suggestion<ItemRecord>[] }
  | { ok: false; reason: 'ambiguous'; input: string; candidates: ItemRecord[] }
  | { ok: false; reason: 'too-new'; input: string; item: ItemRecord; maxItemId: number }

/**
 * Finds an item for a loadout entry. Accepts the English name (case,
 * spacing and punctuation don't matter), TEdit's internal key, or an ID as
 * a number or numeric string. Items newer than the save version are rejected.
 */
export function lookupItem(input: string | number, saveVersion: number): ItemLookup {
  const limit = maxItemId(saveVersion)
  const raw = String(input).trim()
  const found = resolve(raw, saveVersion)

  if (found.kind === 'ambiguous') return { ok: false, reason: 'ambiguous', input: raw, candidates: found.items }
  if (found.kind === 'none') {
    const candidates = ITEMS.filter((i) => i.id <= limit).map((i) => ({ value: i, name: displayName(i, saveVersion) }))
    return { ok: false, reason: 'unknown', input: raw, suggestions: suggest(raw, candidates) }
  }
  if (found.item.id > limit) return { ok: false, reason: 'too-new', input: raw, item: found.item, maxItemId: limit }
  return { ok: true, item: found.item, matchedBy: found.matchedBy }
}

type Resolved =
  | { kind: 'item'; item: ItemRecord; matchedBy: 'id' | 'name' | 'key' | 'alias' }
  | { kind: 'ambiguous'; items: ItemRecord[] }
  | { kind: 'none' }

function resolve(raw: string, saveVersion: number): Resolved {
  if (/^\d+$/.test(raw)) {
    const item = byId.get(Number(raw))
    return item ? { kind: 'item', item, matchedBy: 'id' } : { kind: 'none' }
  }
  const n = normalizeName(raw)
  if (!n) return { kind: 'none' }

  // An old name wins in saves from before the rename (1.4.4.9 "Flairon").
  const renamed = ALIAS_RULES.renamed
    .filter((a) => normalizeName(a.name) === n && saveVersion <= a.until)
    .sort((a, b) => a.until - b.until)[0]
  const renamedItem = renamed && itemByKey(renamed.key)
  if (renamedItem) return { kind: 'item', item: renamedItem, matchedBy: 'alias' }

  const named = byName.get(n)
  if (named?.length === 1) return { kind: 'item', item: named[0]!, matchedBy: 'name' }
  if (named && named.length > 1) {
    const pick = ALIAS_RULES.duplicatePicks[n]
    const item = pick ? itemByKey(pick) : undefined
    if (item && !AMBIGUOUS.has(n)) return { kind: 'item', item, matchedBy: 'alias' }
    return { kind: 'ambiguous', items: named }
  }

  const keyed = byKey.get(n)
  if (keyed) return { kind: 'item', item: keyed, matchedBy: 'key' }
  return { kind: 'none' }
}
