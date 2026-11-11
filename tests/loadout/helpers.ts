// Shared helpers for loadout tests.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PlayerCharacter, PlayerItem } from '../../src/format/index.ts'
import type { Preview } from '../../src/loadout/index.ts'

/** The example loadout JSON block from PLAN.md, so the doc and code can't drift apart. */
export function planExampleText(): string {
  const plan = readFileSync(join(import.meta.dirname, '..', '..', 'PLAN.md'), 'utf8')
  const m = /```json\r?\n([\s\S]*?)\r?\n```/.exec(plan)
  if (!m?.[1]) throw new Error('PLAN.md has no json example')
  return m[1]
}

/** Every item slot in a character, for counting. */
export function allItems(p: PlayerCharacter): PlayerItem[] {
  const t = p.temporaryItems
  return [
    ...p.armor,
    ...p.dye,
    ...p.miscEquips,
    ...p.miscDyes,
    ...p.inventory,
    ...p.bank1,
    ...p.bank2,
    ...p.bank3,
    ...p.bank4,
    ...p.loadouts.flatMap((l) => [...l.armor, ...l.dye]),
    ...p.craftingRefundItems,
    ...[t.mouseItem, t.creativeMenuItem, t.guideItem, t.reforgeItem].filter((x): x is PlayerItem => x !== null),
  ]
}

/** Total stack per item+modifier. */
export function itemCounts(p: PlayerCharacter): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of allItems(p)) {
    if (it.netId === 0) continue
    const k = `${it.netId}:${it.prefix}`
    m.set(k, (m.get(k) ?? 0) + it.stack)
  }
  return m
}

/**
 * Checks that nothing was lost or invented: items after = items before +
 * items the preview says were added - items removed by "replace".
 * Returns a list of mismatches (empty when everything adds up).
 */
export function conservationErrors(before: PlayerCharacter, after: PlayerCharacter, preview: Preview): string[] {
  const expected = itemCounts(before)
  for (const a of preview.added) expected.set(`${a.id}:${a.prefix}`, (expected.get(`${a.id}:${a.prefix}`) ?? 0) + a.stack)
  for (const r of preview.removed) {
    const k = `${r.item.id}:${r.item.prefix}`
    expected.set(k, (expected.get(k) ?? 0) - r.item.stack)
  }
  const actual = itemCounts(after)
  const out: string[] = []
  for (const k of new Set([...expected.keys(), ...actual.keys()])) {
    const e = expected.get(k) ?? 0
    const a = actual.get(k) ?? 0
    if (e !== a) out.push(`${k}: expected ${e}, found ${a}`)
  }
  return out
}
