// Ported from TEdit (https://github.com/TEdit/Terraria-Map-Editor),
// src/TEdit.Terraria/Player/{PlayerCharacter,PlayerItem,PlayerAppearance,
// PlayerBuff,SpawnPoint,EquipmentLoadout,TemporaryItemSlots}.cs at commit 13110cec.
// Copyright (c) TEdit contributors. Licensed under the Microsoft Public License (MS-PL).
// This file remains under the MS-PL. See LICENSE.
//
// Loadsmith changes: plain data objects instead of reactive classes, and the
// model is lossless. Values are stored exactly as read (no clamping, no buff
// compaction, raw bit-field bytes, ordered lists instead of dictionaries) so
// that parse -> serialize reproduces the original bytes.

import {
  MaxArmorSlots,
  MaxBankSlots,
  MaxBuilderAccStatus,
  MaxDpadBindings,
  MaxDyeSlots,
  MaxHideInfoSlots,
  MaxInventorySlots,
  MaxLoadouts,
  MaxMiscEquipSlots,
  CurrentVersion,
} from './constants.ts'

export interface PlayerItem {
  netId: number
  /** Not stored in the file for armor, dye and misc slots (derived as netId !== 0 ? 1 : 0). */
  stack: number
  prefix: number
  favorited: boolean
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface PlayerAppearance {
  hair: number
  hairDye: number
  skinVariant: number
  hairColor: Rgb
  skinColor: Rgb
  eyeColor: Rgb
  shirtColor: Rgb
  underShirtColor: Rgb
  pantsColor: Rgb
  shoeColor: Rgb
}

export interface PlayerBuff {
  type: number
  time: number
}

export interface SpawnPoint {
  x: number
  y: number
  worldId: number
  worldName: string
}

export interface EquipmentLoadout {
  armor: PlayerItem[]
  dye: PlayerItem[]
  hide: boolean[]
}

export interface TemporaryItemSlots {
  /** Raw presence byte. Bits 0-3 say which of the four items follow. */
  flags: number
  mouseItem: PlayerItem | null
  creativeMenuItem: PlayerItem | null
  guideItem: PlayerItem | null
  reforgeItem: PlayerItem | null
}

export interface CreativeSacrifice {
  key: string
  value: number
}

export interface JourneyPower {
  id: number
  /** boolean for toggle powers, float32 for slider powers. */
  value: boolean | number
}

export interface PlayerCharacter {
  // File metadata
  version: number
  fileRevision: number
  /** Full 64-bit metadata flags. Bit 0 = favorite. */
  fileFlags: bigint

  // Header
  name: string
  difficulty: number
  playTimeTicks: bigint
  team: number

  appearance: PlayerAppearance

  /** Raw HideVisibleAccessory bytes: 2 bytes for v124+, 1 for v83-123, none before. */
  hideVisibleAccessoryBytes: number[]
  hideMisc: number

  // Stats
  statLife: number
  statLifeMax: number
  statMana: number
  statManaMax: number
  extraAccessory: boolean

  // Flags
  unlockedBiomeTorches: boolean
  usingBiomeTorches: boolean
  ateArtisanBread: boolean
  /** Reserved flag present from v324. Terraria writes false. */
  reservedFlag324: boolean
  usedAegisCrystal: boolean
  usedAegisFruit: boolean
  usedArcaneCrystal: boolean
  usedGalaxyPearl: boolean
  usedGummyWorm: boolean
  usedAmbrosia: boolean
  downedDD2EventAnyDifficulty: boolean
  taxMoney: number
  numberOfDeathsPVE: number
  numberOfDeathsPVP: number

  // Equipment
  armor: PlayerItem[]
  dye: PlayerItem[]
  miscEquips: PlayerItem[]
  miscDyes: PlayerItem[]
  inventory: PlayerItem[]
  bank1: PlayerItem[]
  bank2: PlayerItem[]
  bank3: PlayerItem[]
  bank4: PlayerItem[]
  voidVaultInfo: number

  /** Every buff slot as stored, including empty ones (10, 22 or 44 by version). */
  buffs: PlayerBuff[]
  spawnPoints: SpawnPoint[]

  // Misc state
  hbLocked: boolean
  hideInfo: boolean[]
  anglerQuestsFinished: number
  dpadRadialBindings: number[]
  builderAccStatus: number[]
  bartenderQuestLog: number
  dead: boolean
  respawnTimer: number
  lastSaveTime: bigint
  golferScoreAccumulated: number

  // Journey mode
  /** Leading flag before the sacrifice list, present from v282. Terraria writes false. */
  creativeSacrificesFlag: boolean
  creativeSacrifices: CreativeSacrifice[]
  temporaryItems: TemporaryItemSlots
  journeyPowers: JourneyPower[]

  /** Raw super cart byte. Bit 0 = unlocked, bit 1 = enabled. */
  superCartFlags: number

  // Loadouts (v262+)
  currentLoadoutIndex: number
  loadouts: EquipmentLoadout[]

  // Voice (v280+)
  voiceVariant: number
  voicePitchOffset: number

  // v300+, v310+
  craftingRefundItems: PlayerItem[]
  oneTimeDialoguesSeen: string[]
}

export function emptyItem(): PlayerItem {
  return { netId: 0, stack: 0, prefix: 0, favorited: false }
}

function items(n: number): PlayerItem[] {
  return Array.from({ length: n }, emptyItem)
}

export function createEmptyLoadout(): EquipmentLoadout {
  return {
    armor: items(MaxArmorSlots),
    dye: items(MaxDyeSlots),
    hide: new Array<boolean>(MaxDyeSlots).fill(false),
  }
}

/** A blank character with TEdit's defaults. Used by the parser and by tests. */
export function createEmptyPlayer(version: number = CurrentVersion): PlayerCharacter {
  return {
    version,
    fileRevision: 0,
    fileFlags: 0n,
    name: '',
    difficulty: 0,
    playTimeTicks: 0n,
    team: 0,
    appearance: {
      hair: 0,
      hairDye: 0,
      skinVariant: 0,
      hairColor: { r: 151, g: 100, b: 69 },
      skinColor: { r: 255, g: 125, b: 90 },
      eyeColor: { r: 105, g: 90, b: 75 },
      shirtColor: { r: 175, g: 165, b: 140 },
      underShirtColor: { r: 160, g: 180, b: 215 },
      pantsColor: { r: 255, g: 230, b: 175 },
      shoeColor: { r: 160, g: 105, b: 60 },
    },
    // As many bytes as the file holds for this version (see playerFile.ts).
    hideVisibleAccessoryBytes: version >= 124 ? [0, 0] : version >= 83 ? [0] : [],
    hideMisc: 0,
    statLife: 100,
    statLifeMax: 100,
    statMana: 20,
    statManaMax: 20,
    extraAccessory: false,
    unlockedBiomeTorches: false,
    usingBiomeTorches: false,
    ateArtisanBread: false,
    reservedFlag324: false,
    usedAegisCrystal: false,
    usedAegisFruit: false,
    usedArcaneCrystal: false,
    usedGalaxyPearl: false,
    usedGummyWorm: false,
    usedAmbrosia: false,
    downedDD2EventAnyDifficulty: false,
    taxMoney: 0,
    numberOfDeathsPVE: 0,
    numberOfDeathsPVP: 0,
    armor: items(MaxArmorSlots),
    dye: items(MaxDyeSlots),
    miscEquips: items(MaxMiscEquipSlots),
    miscDyes: items(MaxMiscEquipSlots),
    inventory: items(MaxInventorySlots),
    bank1: items(MaxBankSlots),
    bank2: items(MaxBankSlots),
    bank3: items(MaxBankSlots),
    bank4: items(MaxBankSlots),
    voidVaultInfo: 0,
    buffs: [],
    spawnPoints: [],
    hbLocked: false,
    hideInfo: new Array<boolean>(MaxHideInfoSlots).fill(false),
    anglerQuestsFinished: 0,
    dpadRadialBindings: new Array<number>(MaxDpadBindings).fill(0),
    builderAccStatus: new Array<number>(MaxBuilderAccStatus).fill(0),
    bartenderQuestLog: 0,
    dead: false,
    respawnTimer: 0,
    lastSaveTime: 0n,
    golferScoreAccumulated: 0,
    creativeSacrificesFlag: false,
    creativeSacrifices: [],
    temporaryItems: { flags: 0, mouseItem: null, creativeMenuItem: null, guideItem: null, reforgeItem: null },
    journeyPowers: [],
    superCartFlags: 0,
    currentLoadoutIndex: 0,
    loadouts: Array.from({ length: MaxLoadouts }, createEmptyLoadout),
    voiceVariant: 0,
    voicePitchOffset: 0,
    craftingRefundItems: [],
    oneTimeDialoguesSeen: [],
  }
}

// Convenience accessors mirroring TEdit's derived properties.

/** TEdit PlayerAppearance.Male. */
export function isMale(a: PlayerAppearance): boolean {
  return a.skinVariant < 4
}

/** TEdit PlayerCharacter.IsFavorite. */
export function isFavorite(p: PlayerCharacter): boolean {
  return (p.fileFlags & 1n) === 1n
}

/** TEdit HideVisibleAccessory[i], read from the raw bytes. */
export function isAccessoryHidden(p: PlayerCharacter, slot: number): boolean {
  const byte = p.hideVisibleAccessoryBytes[slot >> 3] ?? 0
  return (byte & (1 << (slot & 7))) !== 0
}

export function isSuperCartUnlocked(p: PlayerCharacter): boolean {
  return (p.superCartFlags & 1) !== 0
}

export function isSuperCartEnabled(p: PlayerCharacter): boolean {
  return (p.superCartFlags & 2) !== 0
}
