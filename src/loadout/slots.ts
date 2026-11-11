// Slot layout of a Terraria character, checked against real 1.4.4.9 and
// 1.4.5.8 saves.

import type { EquipmentSlot, StorageName } from './schema.ts'
import type { PlayerCharacter, PlayerItem } from '../format/index.ts'

// Inventory (58 slots)
export const HOTBAR = { start: 0, end: 9 } // slots 1-10 in game
export const MAIN = { start: 10, end: 49 }
export const COINS = { start: 50, end: 53 }
export const AMMO = { start: 54, end: 57 }

// Armor array (20 slots), per loadout
export const ARMOR_SLOTS = [0, 1, 2] as const // head, body, legs
export const ARMOR_KINDS = ['head', 'body', 'legs'] as const
export const ACCESSORY = { start: 3, end: 9 } // 7 functional accessory slots
// 10-12 vanity armor, 13-19 vanity accessories: Loadsmith never touches them.

/** Misc equipment slot order (p.miscEquips). */
export const EQUIPMENT_INDEX: Record<EquipmentSlot, number> = {
  pet: 0,
  light_pet: 1,
  minecart: 2,
  mount: 3,
  hook: 4,
}

export const STORAGE_FIELD: Record<StorageName, 'bank1' | 'bank2' | 'bank3' | 'bank4'> = {
  piggy_bank: 'bank1',
  safe: 'bank2',
  defenders_forge: 'bank3',
  void_vault: 'bank4',
}

export const STORAGE_LABEL: Record<StorageName, string> = {
  piggy_bank: 'Piggy Bank',
  safe: 'Safe',
  defenders_forge: "Defender's Forge",
  void_vault: 'Void Vault',
}

/** Coin item keys in coin-slot order. */
export const COIN_KEYS = { platinum: 'PlatinumCoin', gold: 'GoldCoin', silver: 'SilverCoin', copper: 'CopperCoin' } as const

/** Base accessory slots, plus Demon Heart (Expert/Master) and Master. */
export function accessorySlotCount(worldDifficulty: string | undefined, demonHeart: boolean): number | undefined {
  switch (worldDifficulty) {
    case 'classic':
    case 'normal':
      return 5
    case 'expert':
      return demonHeart ? 6 : 5
    case 'master':
      return demonHeart ? 7 : 6
    default:
      return undefined
  }
}

/**
 * Where loadout N's armor and accessories live. Terraria keeps the active
 * loadout's gear in the main armor slots (its own loadout entry is saved
 * empty) and the other two in p.loadouts.
 */
export function loadoutArmor(p: PlayerCharacter, loadoutNumber: 1 | 2 | 3): PlayerItem[] {
  const index = loadoutNumber - 1
  if (index === p.currentLoadoutIndex) return p.armor
  const l = p.loadouts[index]
  if (!l) throw new Error(`Character has no equipment loadout ${loadoutNumber}.`)
  return l.armor
}
