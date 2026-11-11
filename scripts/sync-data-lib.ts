// Pure transforms for `npm run sync-data`: validate TEdit's raw data JSON with
// zod and trim it to the fields Loadsmith uses. Kept separate from the CLI so
// it can be tested without the network.

import { z } from 'zod'
import type { ItemRecord, PrefixRecord, VersionsRecord } from '../src/data/types.ts'

export const TEDIT_REPO = 'TEdit/Terraria-Map-Editor'
export const TEDIT_DATA_PATH = 'src/TEdit.Terraria/Data'
export const DATA_FILES = ['items.json', 'prefixes.json', 'versions.json'] as const
export type DataFile = (typeof DATA_FILES)[number]

// --- Source schemas (TEdit's format). Unknown fields are allowed and dropped.

const RawItem = z.looseObject({
  id: z.number().int().positive(),
  name: z.string().min(1),
  key: z.string().min(1).optional(),
  maxStackSize: z.number().int().positive(),
  isAccessory: z.boolean().optional(),
  isRackable: z.boolean().optional(),
  isMount: z.boolean().optional(),
  isFood: z.boolean().optional(),
  head: z.number().int().optional(),
  body: z.number().int().optional(),
  legs: z.number().int().optional(),
  createTile: z.number().int().optional(),
  createWall: z.number().int().optional(),
})

const RawPrefix = z.looseObject({
  id: z.number().int().positive().optional(),
  name: z.string(),
  key: z.string().optional(),
})

const RawVersions = z.looseObject({
  gameVersionToSaveVersion: z.record(z.string(), z.number().int()),
  saveVersions: z.array(
    z.looseObject({
      saveVersion: z.number().int(),
      gameVersion: z.string(),
      maxItemId: z.number().int().positive(),
    }),
  ),
})

// Output shapes live in src/data/types.ts.

export function transformItems(raw: unknown): ItemRecord[] {
  const items = z.array(RawItem).min(1).parse(raw)
  const seen = new Set<number>()
  const out = items.map((i): ItemRecord => {
    if (seen.has(i.id)) throw new Error(`items.json: duplicate id ${i.id}`)
    seen.add(i.id)
    const r: ItemRecord = { id: i.id, name: i.name.trim(), maxStack: i.maxStackSize }
    if (i.key) r.key = i.key
    if (i.isAccessory) r.accessory = true
    if (i.head !== undefined) r.armor = 'head'
    else if (i.body !== undefined) r.armor = 'body'
    else if (i.legs !== undefined) r.armor = 'legs'
    if (i.isRackable) r.rackable = true
    if (i.isMount) r.mount = true
    if (i.isFood) r.food = true
    if (i.createTile !== undefined || i.createWall !== undefined) r.placeable = true
    return r
  })
  return out.sort((a, b) => a.id - b.id)
}

export function transformPrefixes(raw: unknown): PrefixRecord[] {
  const prefixes = z.array(RawPrefix).min(1).parse(raw)
  const out: PrefixRecord[] = []
  for (const [index, p] of prefixes.entries()) {
    const id = p.id ?? 0
    if (id !== index) throw new Error(`prefixes.json: entry ${index} has id ${id}; expected ids in order`)
    if (id === 0) continue // "no modifier"
    if (!p.key || !p.name.trim()) throw new Error(`prefixes.json: prefix ${id} has no name or key`)
    out.push({ id, name: p.name.trim(), key: p.key })
  }
  return out
}

export function transformVersions(raw: unknown): VersionsRecord {
  const v = RawVersions.parse(raw)
  return {
    gameToSave: v.gameVersionToSaveVersion,
    saveVersions: v.saveVersions.map((s) => ({
      saveVersion: s.saveVersion,
      gameVersion: s.gameVersion.replace(/^v/, ''),
      maxItemId: s.maxItemId,
    })),
  }
}

/** Stable JSON: one record per line for arrays, so diffs stay readable. */
export function formatJson(value: unknown): string {
  if (Array.isArray(value)) return `[\n${value.map((v) => `  ${JSON.stringify(v)}`).join(',\n')}\n]\n`
  return `${JSON.stringify(value, null, 2)}\n`
}

export function transform(file: DataFile, raw: unknown): unknown {
  switch (file) {
    case 'items.json':
      return transformItems(raw)
    case 'prefixes.json':
      return transformPrefixes(raw)
    case 'versions.json':
      return transformVersions(raw)
  }
}
