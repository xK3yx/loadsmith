// Weapon classes and thrown consumables, from rules/weapon-classes.json and
// rules/thrown.json.

import { THROWN_RULES, type WeaponClass, WEAPON_RULES, appliesTo } from './rules/index.ts'

export type { WeaponClass } from './rules/index.ts'

/** Weapon class for a TEdit item key in a save version, or undefined if unmapped. */
export function weaponClassOf(key: string | undefined, saveVersion = Number.MAX_SAFE_INTEGER): WeaponClass | undefined {
  if (!key) return undefined
  return WEAPON_RULES.find((w) => w.key === key && appliesTo(w, saveVersion))?.class
}

/** Every mapped weapon key with its class (ignoring version tags). */
export const WEAPON_CLASSES: Readonly<Record<string, WeaponClass>> = Object.fromEntries(
  WEAPON_RULES.map((w) => [w.key, w.class]),
)

export const THROWN_CONSUMABLES: ReadonlySet<string> = new Set(THROWN_RULES.map((t) => t.key))
