// Stack limits, from rules/stacks.json. TEdit's maxStackSize is 9999 for
// almost every item, so Loadsmith uses its own rule:
//
//   single      armor, accessories, mounts, mapped weapons, and the pickups
//               TEdit lists with a max of 1          -> 1
//   coin        fixed per coin (platinum 9999 is confirmed by real saves)
//   stackable   food, placeables, clearly stackable names, thrown
//               consumables, and the safe-stackable list (treasure bags,
//               materials, medals, boss summons)    -> 9999, no warning
//   unclear     everything else                      -> 9999, with a warning
//
// `rackable` is not used: thrown weapons are rackable but stack.

import { itemKind } from './prefixes.ts'
import { STACK_RULES } from './rules/index.ts'
import type { ItemRecord } from './types.ts'
import { THROWN_CONSUMABLES } from './weapons.ts'

export const MAX_STACK = STACK_RULES.maxStack

const STACKABLE_NAME = new RegExp(STACK_RULES.stackableNamePattern, 'i')
const SAFE_KEYS = new Set(STACK_RULES.safeStackable.items.map((i) => i.key))
const SAFE_NAMES = STACK_RULES.safeStackable.namePatterns.map((p) => new RegExp(p))

export type StackBasis = 'single' | 'coin' | 'stackable' | 'unclear'

export interface StackLimit {
  max: number
  basis: StackBasis
}

export function maxStackFor(item: ItemRecord): StackLimit {
  const coin = item.key ? STACK_RULES.coins[item.key] : undefined
  if (coin !== undefined) return { max: coin, basis: 'coin' }
  if (itemKind(item).kind !== 'other' || item.maxStack === 1) return { max: 1, basis: 'single' }
  if (
    item.food ||
    item.placeable ||
    (item.key !== undefined && (THROWN_CONSUMABLES.has(item.key) || SAFE_KEYS.has(item.key))) ||
    STACKABLE_NAME.test(item.name) ||
    SAFE_NAMES.some((re) => re.test(item.name))
  ) {
    return { max: MAX_STACK, basis: 'stackable' }
  }
  return { max: MAX_STACK, basis: 'unclear' }
}

export type StackCheck =
  | { ok: true; stack: number }
  | { ok: false; severity: 'error'; message: string }
  | { ok: false; severity: 'warning'; stack: number; message: string }

/** Checks a requested stack. Errors block the download; warnings don't. */
export function checkStack(item: ItemRecord, stack: number): StackCheck {
  if (!Number.isInteger(stack) || stack < 1) {
    return { ok: false, severity: 'error', message: `Stack for ${item.name} must be a whole number of at least 1.` }
  }
  const limit = maxStackFor(item)
  if (stack > limit.max) {
    return { ok: false, severity: 'error', message: `${item.name} stacks to ${limit.max}, not ${stack}.` }
  }
  if (limit.basis === 'unclear' && stack > 1) {
    return {
      ok: false,
      severity: 'warning',
      stack,
      message: `Not sure ${item.name} stacks; it may need to be 1.`,
    }
  }
  return { ok: true, stack }
}
