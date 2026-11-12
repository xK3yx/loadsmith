// Reading and editing a loadout by path, for the edit table. The table edits
// the loadsmith/1 object directly, so the table and "Edit as text" always
// show the same thing. Every edit returns a new object.

import { type ItemRecord, lookupItem } from '../../data/index.ts'
import type { Entry, ItemRef, Loadout } from '../../loadout/index.ts'
import { type PathPart, parsePath } from './paths.ts'

type Obj = Record<string | number, unknown>

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null
}

export function getAt(root: unknown, path: string | PathPart[]): unknown {
  let cur: unknown = root
  for (const p of typeof path === 'string' ? parsePath(path) : path) {
    if (!isObj(cur)) return undefined
    cur = cur[p]
  }
  return cur
}

/** Sets a value, creating objects and arrays along the way. undefined deletes an object key. */
export function setAt<T>(root: T, path: string | PathPart[], value: unknown): T {
  const parts = typeof path === 'string' ? parsePath(path) : path
  const next = structuredClone(root) as Obj
  let cur: Obj = next
  parts.forEach((p, i) => {
    if (i === parts.length - 1) {
      if (value === undefined && !Array.isArray(cur)) delete cur[p]
      else cur[p] = value
      return
    }
    if (!isObj(cur[p])) cur[p] = typeof parts[i + 1] === 'number' ? [] : {}
    cur = cur[p] as Obj
  })
  return next as T
}

/** Removes one element from the array at `arrayPath`. */
export function removeAt<T>(root: T, arrayPath: string, index: number): T {
  const arr = getAt(root, arrayPath)
  if (!Array.isArray(arr)) return root
  return setAt(root, arrayPath, arr.filter((_, i) => i !== index))
}

export function appendAt<T>(root: T, arrayPath: string, value: unknown): T {
  const arr = getAt(root, arrayPath)
  return setAt(root, arrayPath, [...(Array.isArray(arr) ? arr : []), value])
}

export interface EntryParts {
  item: ItemRef
  prefix?: string | number
  stack?: number
  favorite?: boolean
}

export function entryParts(e: Entry | null | undefined): EntryParts | undefined {
  if (e === null || e === undefined) return undefined
  if (typeof e === 'string' || typeof e === 'number') return { item: e }
  const out: EntryParts = { item: e.item }
  if (e.prefix !== undefined) out.prefix = e.prefix
  if (e.stack !== undefined) out.stack = e.stack
  if (e.favorite !== undefined) out.favorite = e.favorite
  return out
}

/**
 * Changes one field of an entry. A plain name becomes an object when it needs
 * a modifier, amount or favorite, and an object with only an item becomes a
 * plain name again. Other keys (such as "note") are kept.
 */
export function withField(e: Entry, field: 'item' | 'prefix' | 'stack' | 'favorite', value: unknown): Entry {
  const obj: Obj = typeof e === 'object' && e !== null ? { ...e } : { item: e }
  if (value === undefined || value === '' || (field === 'favorite' && value === false)) delete obj[field]
  else obj[field] = value
  const keys = Object.keys(obj)
  if (keys.length === 1 && keys[0] === 'item') return obj.item as ItemRef
  return obj as Entry
}

/** The item an entry names, if the name resolves in this save version. */
export function resolveItem(ref: ItemRef | undefined, saveVersion: number): ItemRecord | undefined {
  if (ref === undefined || ref === '') return undefined
  const r = lookupItem(ref, saveVersion)
  return r.ok ? r.item : undefined
}

/** Where loadout 1's gear lives in this loadout: top level, or loadouts."1" if the AI used that. */
export function gearBase(l: Loadout, n: 1 | 2 | 3): string {
  if (n === 1) return isObj(l.loadouts) && isObj(l.loadouts['1']) ? 'loadouts.1.' : ''
  return `loadouts.${n}.`
}
