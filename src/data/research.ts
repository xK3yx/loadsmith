// Journey Mode research amounts, from rules/research.json (Terraria Wiki,
// via `npm run sync-research`) and rules/research-overrides.json (hand fixes
// for items the wiki leaves blank).
//
// UNVERIFIED: these amounts haven't been checked in-game yet. They match a
// fully researched 1.4.4.9 and 1.4.5.8 Journey save almost exactly (Life
// Crystal is the known difference), but which counts the game treats as
// "fully researched" still needs the in-game check described in PLAN.md.
// Loadsmith writes exactly the required amount, never more.

import { RESEARCH_OVERRIDES, RESEARCH_RULES, appliesTo } from './rules/index.ts'
import { itemByKey } from './items.ts'
import { maxItemId } from './versions.ts'

export const RESEARCH_UNVERIFIED = true

export interface ResearchAmount {
  key: string
  amount: number
  source: 'wiki' | 'override'
}

/** Research amount for an item key in a save version, or undefined if it can't be researched. */
export function researchAmount(key: string, saveVersion: number): ResearchAmount | undefined {
  const override = RESEARCH_OVERRIDES.find((e) => e.key === key && appliesTo(e, saveVersion))
  if (override) return { key, amount: override.amount, source: 'override' }
  const wiki = RESEARCH_RULES.entries.find((e) => e.key === key && appliesTo(e, saveVersion))
  return wiki ? { key, amount: wiki.amount, source: 'wiki' } : undefined
}

/** Every researchable item that exists in a save version, with its amount. */
export function fullResearch(saveVersion: number): ResearchAmount[] {
  const limit = maxItemId(saveVersion)
  const keys = new Set([...RESEARCH_RULES.entries.map((e) => e.key), ...RESEARCH_OVERRIDES.map((e) => e.key)])
  const out: ResearchAmount[] = []
  for (const key of keys) {
    const item = itemByKey(key)
    if (!item || item.id > limit) continue
    const amount = researchAmount(key, saveVersion)
    if (amount) out.push(amount)
  }
  return out
}
