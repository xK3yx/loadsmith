// Choices for the searchable item and modifier dropdowns in the edit table.

import {
  ITEMS,
  PREFIXES,
  bestPrefixFor,
  checkPrefix,
  displayName,
  itemExistsIn,
  lookupItem,
  maxPrefixId,
  normalizeName,
  suggest,
} from '../../data/index.ts'
import type { ItemRecord } from '../../data/index.ts'

/** Which items a row accepts. */
export type ItemFilter = 'any' | 'accessory' | 'head' | 'body' | 'legs' | 'mount'

export interface ItemOption {
  id: number
  name: string
  /** What goes in the loadout: the name, or the ID when two items share the name. */
  value: string | number
}

export const OPTION_LIMIT = 50

const byVersion = new Map<number, (ItemOption & { record: ItemRecord; norm: string })[]>()

function itemsFor(saveVersion: number) {
  let list = byVersion.get(saveVersion)
  if (!list) {
    list = ITEMS.filter((i) => i.id > 0 && itemExistsIn(i.id, saveVersion)).map((record) => {
      const name = displayName(record, saveVersion)
      const unique = lookupItem(name, saveVersion)
      const value = unique.ok && unique.item.id === record.id ? name : record.id
      return { id: record.id, name, value, record, norm: name.toLowerCase() }
    })
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
    byVersion.set(saveVersion, list)
  }
  return list
}

function accepts(filter: ItemFilter, r: ItemRecord): boolean {
  switch (filter) {
    case 'any':
      return true
    case 'accessory':
      return r.accessory === true
    case 'mount':
      return r.mount === true
    default:
      return r.armor === filter
  }
}

/**
 * Items matching what the player typed: names that start with it first,
 * then names with a word starting with it, then names containing it, then
 * close spellings. At most OPTION_LIMIT.
 */
export function itemOptions(query: string, saveVersion: number, filter: ItemFilter = 'any'): ItemOption[] {
  const all = itemsFor(saveVersion).filter((o) => accepts(filter, o.record))
  const q = query.trim().toLowerCase()
  const strip = ({ id, name, value }: ItemOption): ItemOption => ({ id, name, value })
  if (!q) return all.slice(0, OPTION_LIMIT).map(strip)
  const ranked: { o: (typeof all)[number]; rank: number }[] = []
  for (const o of all) {
    let rank = -1
    if (o.norm === q) rank = 0
    else if (o.norm.startsWith(q)) rank = 1
    else if (o.norm.split(/[^a-z0-9']+/).some((w) => w.startsWith(q))) rank = 2
    else if (o.norm.includes(q)) rank = 3
    if (rank >= 0) ranked.push({ o, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.o.name.length - b.o.name.length || a.o.name.localeCompare(b.o.name))
  const out = ranked.slice(0, OPTION_LIMIT).map((r) => strip(r.o))
  if (out.length < OPTION_LIMIT && normalizeName(q).length >= 3) {
    const seen = new Set(out.map((o) => o.id))
    const close = suggest(
      q,
      all.filter((o) => !seen.has(o.id)).map((o) => ({ value: o, name: o.name })),
      OPTION_LIMIT - out.length,
      0.6,
    )
    out.push(...close.map((s) => strip(s.value)))
  }
  return out
}

export interface ModifierOption {
  id: number
  name: string
  best: boolean
}

/**
 * Modifiers that fit an item in a save version, best first. Items whose
 * weapon type Loadsmith doesn't know get every non-accessory modifier (the
 * validator then warns that it can't check). Armor and mounts get none.
 */
export function modifierOptions(item: ItemRecord | undefined, saveVersion: number): ModifierOption[] {
  if (!item) return []
  const best = bestPrefixFor(item, saveVersion)
  const limit = maxPrefixId(saveVersion)
  const seen = new Set<string>()
  const out: ModifierOption[] = []
  for (const p of PREFIXES) {
    if (p.id === 0 || p.id > limit) continue
    const check = checkPrefix(p.id, item, saveVersion)
    if (!check.ok && check.severity === 'error') continue
    if (seen.has(p.name)) continue
    seen.add(p.name)
    out.push({ id: p.id, name: p.name, best: p.id === best })
  }
  return out.sort((a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name))
}

export function modifierMatches(options: ModifierOption[], query: string): ModifierOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.name.toLowerCase().includes(q))
}
