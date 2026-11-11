// Stack limits. TEdit's maxStackSize is 9999 for almost every item, including
// weapons, armor and accessories, so Loadsmith uses its own rule:
//
//   single      armor, accessories, mounts, mapped weapons, and the pickups
//               TEdit lists with a max of 1          -> 1
//   coin        copper/silver/gold 100, platinum 9999  (platinum confirmed
//               by real 1.4.5.8 saves)
//   stackable   food, placeables, potions, ammo and other clearly stackable
//               names, consumable thrown weapons     -> 9999, no warning
//   unclear     everything else                      -> 9999, with a warning
//
// `rackable` is not used: thrown weapons are rackable but stack.

import { itemKind } from './prefixes.ts'
import { THROWN_CONSUMABLES } from './thrown.ts'
import type { ItemRecord } from './types.ts'

export const MAX_STACK = 9999

const COIN_LIMITS: Readonly<Record<string, number>> = {
  CopperCoin: 100,
  SilverCoin: 100,
  GoldCoin: 100,
  PlatinumCoin: 9999,
}

const STACKABLE_NAME =
  /\b(potion|flask|arrows?|bullets?|darts?|rockets?|solution|bait|seeds?|ore|bar|fragment|dye|gel|bomb|grenade|torch|ammo|feather|scale|essence|soul|shard)\b/i

export type StackBasis = 'single' | 'coin' | 'stackable' | 'unclear'

export interface StackLimit {
  max: number
  basis: StackBasis
}

export function maxStackFor(item: ItemRecord): StackLimit {
  const coin = item.key ? COIN_LIMITS[item.key] : undefined
  if (coin !== undefined) return { max: coin, basis: 'coin' }
  if (itemKind(item).kind !== 'other' || item.maxStack === 1) return { max: 1, basis: 'single' }
  if (
    item.food ||
    item.placeable ||
    (item.key !== undefined && THROWN_CONSUMABLES.has(item.key)) ||
    STACKABLE_NAME.test(item.name)
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
