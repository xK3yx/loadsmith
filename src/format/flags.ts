// Player flags Loadsmith may set by name. Loadsmith's own file (not ported
// from TEdit); it names the boolean player fields that are safe to edit and
// the save version each one first appears in, following the version checks in
// playerFile.ts. When a TEdit update adds a new booster flag, port the field
// into types.ts/playerFile.ts and add one line here; the loadout format
// accepts it by name with no schema change.
//
// Not listed on purpose: dead, hbLocked, hideInfo, reservedFlag324 and the
// raw bit fields, which are UI state or not player progress.

import type { PlayerCharacter } from './types.ts'

export interface PlayerFlag {
  /** snake_case name used in loadsmith/1's "character" section. */
  name: string
  /** First save version that stores this flag. */
  since: number
  get(p: PlayerCharacter): boolean
  set(p: PlayerCharacter, value: boolean): void
}

type BoolField = {
  [K in keyof PlayerCharacter]: PlayerCharacter[K] extends boolean ? K : never
}[keyof PlayerCharacter]

function field(name: string, since: number, key: BoolField): PlayerFlag {
  return {
    name,
    since,
    get: (p) => p[key],
    set: (p, v) => {
      p[key] = v
    },
  }
}

function superCartBit(name: string, bit: number): PlayerFlag {
  return {
    name,
    since: 253,
    get: (p) => (p.superCartFlags & bit) !== 0,
    set: (p, v) => {
      p.superCartFlags = v ? p.superCartFlags | bit : p.superCartFlags & ~bit
    },
  }
}

export const PLAYER_FLAGS: readonly PlayerFlag[] = [
  field('extra_accessory', 125, 'extraAccessory'), // Demon Heart
  field('unlocked_biome_torches', 229, 'unlockedBiomeTorches'), // Torch God's Favor
  field('using_biome_torches', 229, 'usingBiomeTorches'),
  field('ate_artisan_bread', 256, 'ateArtisanBread'), // Artisan Loaf
  field('used_aegis_crystal', 260, 'usedAegisCrystal'), // Vital Crystal
  field('used_aegis_fruit', 260, 'usedAegisFruit'), // Aegis Fruit
  field('used_arcane_crystal', 260, 'usedArcaneCrystal'), // Arcane Crystal
  field('used_galaxy_pearl', 260, 'usedGalaxyPearl'), // Galaxy Pearl
  field('used_gummy_worm', 260, 'usedGummyWorm'), // Gummy Worm
  field('used_ambrosia', 260, 'usedAmbrosia'), // Ambrosia
  field('downed_dd2_event_any_difficulty', 182, 'downedDD2EventAnyDifficulty'), // Old One's Army beaten
  superCartBit('unlocked_super_cart', 1), // Minecart Upgrade Kit
  superCartBit('enabled_super_cart', 2),
]

export function playerFlag(name: string): PlayerFlag | undefined {
  return PLAYER_FLAGS.find((f) => f.name === name)
}
