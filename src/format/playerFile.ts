// Ported from TEdit (https://github.com/TEdit/Terraria-Map-Editor),
// src/TEdit.Terraria/Player/PlayerFile.cs at commit 13110cec.
// Copyright (c) TEdit contributors. Licensed under the Microsoft Public License (MS-PL).
// This file remains under the MS-PL. See LICENSE.
//
// Every `version >= N` branch is ported as-is. Loadsmith changes, all so that
// parse -> serialize reproduces the original bytes exactly:
//  - The writer keeps the stored file revision and LastSaveTime. TEdit bumps
//    the revision and stamps the time; that decision belongs to the download step.
//  - The full 64-bit metadata flags are kept, not just the favorite bit.
//  - No value clamping or migration on read (hair >= 228, life/mana caps,
//    respawn timer, loadout index, skin variant 7, builder status[0]).
//  - Buffs keep every slot in order. TEdit drops empty slots and compacts.
//  - The v324 reserved flag and v282 sacrifice flag keep the value read.
//  - Hide-accessory, temporary-item and super cart bytes are kept raw.
//  - Item stacks are stored raw. TEdit zeroes the ID when stack <= 0 and
//    caps stacks at 32767.
//  - Journey sacrifices and powers are ordered lists, not dictionaries.
//  - Encryption uses PKCS7 like the game (TEdit pads with zeros).
//  - Parsing must consume the whole file; leftover bytes are an error.
//  - The writer refuses versions below 124, where TEdit's writer is incomplete.

import { BinaryReader, BinaryWriter, FormatError } from './binary.ts'
import {
  CurrentVersion,
  FileType,
  MaxArmorSlots,
  MaxBankSlots,
  MaxBuffSlots,
  MaxBuilderAccStatus,
  MaxDpadBindings,
  MaxDyeSlots,
  MaxHideInfoSlots,
  MaxInventorySlots,
  MaxLoadouts,
  MaxMiscEquipSlots,
  MaxSpawnPoints,
  MinWritableVersion,
  ReLogicMagic,
} from './constants.ts'
import { readCreativePowers, writeCreativePowers } from './creativePowers.ts'
import { decryptPlr, encryptPlr } from './crypto.ts'
import {
  type EquipmentLoadout,
  type PlayerCharacter,
  type PlayerItem,
  type Rgb,
  type TemporaryItemSlots,
  createEmptyPlayer,
  emptyItem,
  isMale,
} from './types.ts'

export class UnsupportedVersionError extends FormatError {
  readonly version: number
  constructor(version: number, message: string) {
    super(message)
    this.name = 'UnsupportedVersionError'
    this.version = version
  }
}

// ---------------------------------------------------------------------------
// Public API

/** Decrypts and parses an encrypted .plr file. */
export async function loadPlayer(fileBytes: Uint8Array): Promise<PlayerCharacter> {
  return parsePlayer(await decryptPlr(fileBytes))
}

/** Serializes and encrypts a character, in the version it was loaded as. */
export async function savePlayer(player: PlayerCharacter): Promise<Uint8Array> {
  return encryptPlr(serializePlayer(player))
}

/** Parses decrypted .plr bytes. TEdit PlayerFile.Load(Stream). */
export function parsePlayer(plain: Uint8Array): PlayerCharacter {
  const r = new BinaryReader(plain)
  const version = r.readInt32()
  if (version > CurrentVersion) {
    throw new UnsupportedVersionError(
      version,
      `Save version ${version} is newer than the newest supported version (${CurrentVersion}).`,
    )
  }
  if (version < 0) throw new FormatError(`Not a Terraria character file: bad version ${version}.`)

  let fileRevision = 0
  let fileFlags = 0n
  if (version >= 135) {
    const header = r.readUInt64()
    const magic = header & 0x00ffffffffffffffn
    if (magic !== ReLogicMagic) throw new FormatError('Not a valid Re-Logic file.')
    const type = Number((header >> 56n) & 0xffn)
    if (type !== FileType.Player) throw new FormatError(`Expected Player file type but found ${type}.`)
    fileRevision = r.readUInt32()
    fileFlags = r.readUInt64()
  }

  const p = deserialize(r, version)
  p.version = version
  p.fileRevision = fileRevision
  p.fileFlags = fileFlags

  if (r.remaining !== 0) {
    throw new FormatError(
      `Parsed version ${version} save but ${r.remaining} byte(s) were left over at offset ${r.position}.`,
    )
  }
  return p
}

/** Serializes to decrypted .plr bytes. TEdit PlayerFile.Save(Stream). */
export function serializePlayer(p: PlayerCharacter): Uint8Array {
  const v = p.version
  if (v > CurrentVersion) {
    throw new UnsupportedVersionError(v, `Cannot write save version ${v}; newest supported is ${CurrentVersion}.`)
  }
  if (v < MinWritableVersion) {
    throw new UnsupportedVersionError(v, `Cannot write save version ${v}; oldest writable is ${MinWritableVersion}.`)
  }
  const w = new BinaryWriter()
  w.writeInt32(v)
  if (v >= 135) {
    w.writeUInt64(ReLogicMagic | (BigInt(FileType.Player) << 56n))
    w.writeUInt32(p.fileRevision)
    w.writeUInt64(p.fileFlags)
  }
  serialize(w, p)
  return w.toBytes()
}

// ---------------------------------------------------------------------------
// Serialize (TEdit PlayerFile.Serialize)

function serialize(w: BinaryWriter, p: PlayerCharacter): void {
  const v = p.version
  const a = p.appearance

  // Core: always written
  w.writeString(p.name)
  if (v >= 17) w.writeByte(p.difficulty)
  if (v >= 138) w.writeInt64(p.playTimeTicks)
  w.writeInt32(a.hair)
  if (v >= 82) w.writeByte(a.hairDye)
  if (v >= 283) w.writeByte(p.team)

  // HideVisibleAccessory
  if (v >= 124) {
    w.writeByte(p.hideVisibleAccessoryBytes[0] ?? 0)
    w.writeByte(p.hideVisibleAccessoryBytes[1] ?? 0)
  } else if (v >= 83) {
    w.writeByte(p.hideVisibleAccessoryBytes[0] ?? 0)
  }

  if (v >= 119) w.writeByte(p.hideMisc)

  if (v >= 107) w.writeByte(a.skinVariant)
  else if (v > 17) w.writeBoolean(isMale(a))

  // Stats
  w.writeInt32(p.statLife)
  w.writeInt32(p.statLifeMax)
  w.writeInt32(p.statMana)
  w.writeInt32(p.statManaMax)
  if (v >= 125) w.writeBoolean(p.extraAccessory)

  // Flags
  if (v >= 229) {
    w.writeBoolean(p.unlockedBiomeTorches)
    w.writeBoolean(p.usingBiomeTorches)
    if (v >= 256) w.writeBoolean(p.ateArtisanBread)
    if (v >= 324) w.writeBoolean(p.reservedFlag324)
    if (v >= 260) {
      w.writeBoolean(p.usedAegisCrystal)
      w.writeBoolean(p.usedAegisFruit)
      w.writeBoolean(p.usedArcaneCrystal)
      w.writeBoolean(p.usedGalaxyPearl)
      w.writeBoolean(p.usedGummyWorm)
      w.writeBoolean(p.usedAmbrosia)
    }
  }
  if (v >= 182) w.writeBoolean(p.downedDD2EventAnyDifficulty)
  if (v >= 128) w.writeInt32(p.taxMoney)
  if (v >= 254) {
    w.writeInt32(p.numberOfDeathsPVE)
    w.writeInt32(p.numberOfDeathsPVP)
  }

  // Colors (RGB only, always written)
  writeColor(w, a.hairColor)
  writeColor(w, a.skinColor)
  writeColor(w, a.eyeColor)
  writeColor(w, a.shirtColor)
  writeColor(w, a.underShirtColor)
  writeColor(w, a.pantsColor)
  writeColor(w, a.shoeColor)

  // Equipment: v38+ uses int-based IDs
  if (v >= 38) {
    // Armor
    if (v >= 124) {
      for (let i = 0; i < MaxArmorSlots; i++) {
        const it = slot(p.armor, i)
        w.writeInt32(it.netId)
        w.writeByte(it.prefix)
        if (v >= 322) w.writeBoolean(it.favorited)
      }
    }

    // Dye
    if (v >= 47) {
      const dyeCount = v >= 124 ? MaxDyeSlots : v >= 81 ? 8 : 3
      for (let i = 0; i < dyeCount; i++) {
        const it = slot(p.dye, i)
        w.writeInt32(it.netId)
        w.writeByte(it.prefix)
        if (v >= 322) w.writeBoolean(it.favorited)
      }
    }

    // Inventory
    if (v >= 58) {
      for (let i = 0; i < MaxInventorySlots; i++) {
        const it = slot(p.inventory, i)
        w.writeInt32(it.netId)
        w.writeInt32(it.stack)
        w.writeByte(it.prefix)
        if (v >= 114) w.writeBoolean(it.favorited)
      }
    }

    // MiscEquips + MiscDyes
    if (v >= 117) {
      for (let i = 0; i < MaxMiscEquipSlots; i++) {
        if (v < 136 && i === 1) continue
        const e = slot(p.miscEquips, i)
        const d = slot(p.miscDyes, i)
        w.writeInt32(e.netId)
        w.writeByte(e.prefix)
        w.writeInt32(d.netId)
        w.writeByte(d.prefix)
      }
    }

    // Banks
    if (v >= 58) {
      writeBankItems(w, p.bank1)
      writeBankItems(w, p.bank2)
    }

    if (v >= 182) writeBankItems(w, p.bank3)

    if (v >= 198) {
      for (let i = 0; i < MaxBankSlots; i++) {
        const it = slot(p.bank4, i)
        w.writeInt32(it.netId)
        w.writeInt32(it.stack)
        w.writeByte(it.prefix)
        if (v >= 255) w.writeBoolean(it.favorited)
      }
    }

    if (v >= 199) w.writeByte(p.voidVaultInfo)
  }

  // Buffs
  if (v >= 11) {
    const buffCount = v >= 252 ? MaxBuffSlots : v >= 74 ? 22 : 10
    if (p.buffs.length > buffCount) {
      throw new FormatError(`Version ${v} saves hold ${buffCount} buffs, but the character has ${p.buffs.length}.`)
    }
    for (let i = 0; i < buffCount; i++) {
      const b = p.buffs[i] ?? { type: 0, time: 0 }
      w.writeInt32(b.type)
      w.writeInt32(b.time)
    }
  }

  // Spawn points
  for (const sp of p.spawnPoints) {
    w.writeInt32(sp.x)
    w.writeInt32(sp.y)
    w.writeInt32(sp.worldId)
    w.writeString(sp.worldName)
  }
  w.writeInt32(-1) // sentinel

  // Misc state
  if (v >= 16) w.writeBoolean(p.hbLocked)
  if (v >= 115) {
    for (let i = 0; i < MaxHideInfoSlots; i++) w.writeBoolean(p.hideInfo[i] ?? false)
  }
  if (v >= 98) w.writeInt32(p.anglerQuestsFinished)
  if (v >= 162) {
    for (let i = 0; i < MaxDpadBindings; i++) w.writeInt32(p.dpadRadialBindings[i] ?? 0)
  }
  if (v >= 164) {
    const count = v >= 230 ? 12 : v >= 197 ? 11 : v >= 167 ? 10 : 8
    for (let i = 0; i < count; i++) w.writeInt32(p.builderAccStatus[i] ?? 0)
  }
  if (v >= 181) w.writeInt32(p.bartenderQuestLog)
  if (v >= 200) {
    w.writeBoolean(p.dead)
    if (p.dead) w.writeInt32(p.respawnTimer)
  }
  if (v >= 202) w.writeInt64(p.lastSaveTime)
  if (v >= 206) w.writeInt32(p.golferScoreAccumulated)

  // Creative sacrifices
  if (v >= 218) {
    if (v >= 282) w.writeBoolean(p.creativeSacrificesFlag)
    w.writeInt32(p.creativeSacrifices.length)
    for (const s of p.creativeSacrifices) {
      w.writeString(s.key)
      w.writeInt32(s.value)
    }
  }

  // Temporary item slots
  if (v >= 214) writeTemporaryItems(w, p.temporaryItems)

  // Journey powers
  if (v >= 220) writeCreativePowers(w, p.journeyPowers)

  // Super cart
  if (v >= 253) w.writeByte(p.superCartFlags)

  // Loadouts
  if (v >= 262) {
    w.writeInt32(p.currentLoadoutIndex)
    for (let i = 0; i < MaxLoadouts; i++) {
      const l = p.loadouts[i]
      if (!l) throw new FormatError(`Missing equipment loadout ${i}.`)
      serializeLoadout(w, l, v)
    }
  }

  // Voice
  if (v >= 280) w.writeByte(p.voiceVariant)
  if (v >= 281) w.writeSingle(p.voicePitchOffset)

  // Crafting refunds
  if (v >= 300) {
    w.writeInt32(p.craftingRefundItems.length)
    for (const it of p.craftingRefundItems) {
      w.writeInt32(it.netId)
      w.writeInt32(it.stack)
      w.writeByte(it.prefix)
    }
  }

  // One-time dialogues
  if (v >= 310) {
    w.writeInt32(p.oneTimeDialoguesSeen.length)
    for (const d of p.oneTimeDialoguesSeen) w.writeString(d)
  }
}

// ---------------------------------------------------------------------------
// Deserialize (TEdit PlayerFile.Deserialize)

function deserialize(r: BinaryReader, version: number): PlayerCharacter {
  const p = createEmptyPlayer(version)
  const a = p.appearance

  // Name
  p.name = r.readString()

  // Difficulty
  if (version >= 10) {
    if (version >= 17) p.difficulty = r.readByte()
    else if (r.readBoolean()) p.difficulty = 2 // hardcore
  }

  // Play time
  if (version >= 138) p.playTimeTicks = r.readInt64()

  // Hair (TEdit resets hair >= MaxHairStyles to 0; kept raw here)
  a.hair = r.readInt32()

  if (version >= 82) a.hairDye = r.readByte()

  // Team (v283+)
  if (version >= 283) p.team = r.readByte()

  // Hide visible accessory
  if (version >= 124) p.hideVisibleAccessoryBytes = [r.readByte(), r.readByte()]
  else if (version >= 83) p.hideVisibleAccessoryBytes = [r.readByte()]

  if (version >= 119) p.hideMisc = r.readByte()

  // Skin variant / gender
  if (version <= 17) {
    // Derive from hair
    const male = a.hair !== 5 && a.hair !== 6 && a.hair !== 9 && a.hair !== 11
    a.skinVariant = male ? 0 : 4
  } else if (version < 107) {
    const male = r.readBoolean()
    a.skinVariant = male ? 0 : 4
  } else {
    a.skinVariant = r.readByte()
  }
  // (TEdit maps skin variant 7 to 9 for version < 161; kept raw here.)

  // Stats (TEdit caps life max 500, mana max 200, mana 400; kept raw here)
  p.statLife = r.readInt32()
  p.statLifeMax = r.readInt32()
  p.statMana = r.readInt32()
  p.statManaMax = r.readInt32()

  if (version >= 125) p.extraAccessory = r.readBoolean()

  // Biome torches and consumable flags
  if (version >= 229) {
    p.unlockedBiomeTorches = r.readBoolean()
    p.usingBiomeTorches = r.readBoolean()
    if (version >= 256) p.ateArtisanBread = r.readBoolean()
    if (version >= 324) p.reservedFlag324 = r.readBoolean()
    if (version >= 260) {
      p.usedAegisCrystal = r.readBoolean()
      p.usedAegisFruit = r.readBoolean()
      p.usedArcaneCrystal = r.readBoolean()
      p.usedGalaxyPearl = r.readBoolean()
      p.usedGummyWorm = r.readBoolean()
      p.usedAmbrosia = r.readBoolean()
    }
  }

  if (version >= 182) p.downedDD2EventAnyDifficulty = r.readBoolean()

  if (version >= 128) p.taxMoney = r.readInt32()

  if (version >= 254) {
    p.numberOfDeathsPVE = r.readInt32()
    p.numberOfDeathsPVP = r.readInt32()
  }

  // Colors
  a.hairColor = readColor(r)
  a.skinColor = readColor(r)
  a.eyeColor = readColor(r)
  a.shirtColor = readColor(r)
  a.underShirtColor = readColor(r)
  a.pantsColor = readColor(r)
  a.shoeColor = readColor(r)

  // Equipment
  if (version >= 38) {
    readArmorAndDye(r, p, version)
    readInventory(r, p, version)
    readMiscEquips(r, p, version)
    readBanks(r, p, version)
  } else {
    readLegacyEquipment(r, version)
  }

  // Fix old inventory layout
  if (version < 58) {
    for (let i = 40; i < 48; i++) {
      p.inventory[i + 10] = { ...slot(p.inventory, i) }
      p.inventory[i] = emptyItem()
    }
  }

  // Buffs (TEdit drops empty slots and compacts; every slot kept here)
  if (version >= 11) {
    let buffCount = 22
    if (version < 74) buffCount = 10
    if (version >= 252) buffCount = MaxBuffSlots
    p.buffs = []
    for (let i = 0; i < buffCount; i++) {
      const type = r.readInt32()
      const time = r.readInt32()
      p.buffs.push({ type, time })
    }
  }

  // Spawn points
  for (let i = 0; i < MaxSpawnPoints; i++) {
    const x = r.readInt32()
    if (x === -1) break
    const y = r.readInt32()
    const worldId = r.readInt32()
    const worldName = r.readString()
    p.spawnPoints.push({ x, y, worldId, worldName })
  }

  // Misc state
  if (version >= 16) p.hbLocked = r.readBoolean()

  if (version >= 115) {
    for (let i = 0; i < MaxHideInfoSlots; i++) p.hideInfo[i] = r.readBoolean()
  }

  if (version >= 98) p.anglerQuestsFinished = r.readInt32()

  if (version >= 162) {
    for (let i = 0; i < MaxDpadBindings; i++) p.dpadRadialBindings[i] = r.readInt32()
  }

  if (version >= 164) {
    let count = 8
    if (version >= 167) count = 10
    if (version >= 197) count = 11
    if (version >= 230) count = MaxBuilderAccStatus
    for (let i = 0; i < count; i++) p.builderAccStatus[i] = r.readInt32()
    // (TEdit forces builderAccStatus[0] = 1 for version < 210; kept raw here.)
  }

  if (version >= 181) p.bartenderQuestLog = r.readInt32()

  if (version >= 200) {
    p.dead = r.readBoolean()
    // (TEdit clamps to 0..60000; kept raw here.)
    if (p.dead) p.respawnTimer = r.readInt32()
  }

  p.lastSaveTime = 0n
  if (version >= 202) p.lastSaveTime = r.readInt64()

  if (version >= 206) p.golferScoreAccumulated = r.readInt32()

  // Creative sacrifices
  if (version >= 218) readCreativeSacrifices(r, p, version)

  // Temporary item slots
  if (version >= 214) p.temporaryItems = readTemporaryItems(r)

  // Journey powers
  if (version >= 220) p.journeyPowers = readCreativePowers(r)

  // Super cart
  if (version >= 253) p.superCartFlags = r.readByte()

  // Loadouts
  if (version >= 262) {
    // (TEdit clamps to 0..MaxLoadouts-1; kept raw here.)
    p.currentLoadoutIndex = r.readInt32()
    for (let i = 0; i < MaxLoadouts; i++) p.loadouts[i] = deserializeLoadout(r, version)
  }

  // Voice
  if (version >= 280) p.voiceVariant = r.readByte()
  else p.voiceVariant = isMale(a) ? 1 : 2

  if (version >= 281) p.voicePitchOffset = r.readSingle()

  // Crafting refunds
  if (version >= 300) {
    const refundCount = r.readInt32()
    checkCount(refundCount, r, 9, 'crafting refund')
    for (let i = 0; i < refundCount; i++) {
      const netId = r.readInt32()
      const stack = r.readInt32()
      const prefix = r.readByte()
      p.craftingRefundItems.push({ netId, stack, prefix, favorited: false })
    }
  }

  // One-time dialogues
  if (version >= 310) {
    const dialogueCount = r.readInt32()
    checkCount(dialogueCount, r, 1, 'dialogue')
    for (let i = 0; i < dialogueCount; i++) p.oneTimeDialoguesSeen.push(r.readString())
  }

  return p
}

function readArmorAndDye(r: BinaryReader, p: PlayerCharacter, version: number): void {
  if (version < 124) {
    const count = version >= 81 ? 16 : 11
    for (let i = 0; i < count; i++) {
      const idx = i >= 8 ? i + 2 : i
      const type = r.readInt32()
      const prefix = r.readByte()
      if (idx < MaxArmorSlots) p.armor[idx] = { netId: type, stack: type !== 0 ? 1 : 0, prefix, favorited: false }
    }
  } else {
    for (let i = 0; i < MaxArmorSlots; i++) {
      const type = r.readInt32()
      const prefix = r.readByte()
      const favorited = version >= 322 && r.readBoolean()
      p.armor[i] = { netId: type, stack: type !== 0 ? 1 : 0, prefix, favorited }
    }
  }

  if (version >= 47) {
    let dyeCount = 3
    if (version >= 81) dyeCount = 8
    if (version >= 124) dyeCount = MaxDyeSlots
    for (let i = 0; i < dyeCount; i++) {
      const type = r.readInt32()
      const prefix = r.readByte()
      const favorited = version >= 322 && r.readBoolean()
      p.dye[i] = { netId: type, stack: type !== 0 ? 1 : 0, prefix, favorited }
    }
  }
}

function readInventory(r: BinaryReader, p: PlayerCharacter, version: number): void {
  if (version >= 58) {
    for (let i = 0; i < MaxInventorySlots; i++) {
      const netId = r.readInt32()
      const stack = r.readInt32()
      const prefix = r.readByte()
      const favorited = version >= 114 && r.readBoolean()
      p.inventory[i] = { netId, stack, prefix, favorited }
    }
  } else {
    const count = version >= 15 ? 48 : 44
    for (let i = 0; i < count; i++) {
      const netId = r.readInt32()
      const stack = r.readInt32()
      const prefix = r.readByte()
      p.inventory[i] = { netId, stack, prefix, favorited: false }
    }
  }
}

function readMiscEquips(r: BinaryReader, p: PlayerCharacter, version: number): void {
  if (version < 117) return

  for (let i = 0; i < MaxMiscEquipSlots; i++) {
    if (version < 136 && i === 1) continue

    const eType = r.readInt32()
    const ePrefix = r.readByte()
    p.miscEquips[i] = { netId: eType, stack: eType !== 0 ? 1 : 0, prefix: ePrefix, favorited: false }

    const dType = r.readInt32()
    const dPrefix = r.readByte()
    p.miscDyes[i] = { netId: dType, stack: dType !== 0 ? 1 : 0, prefix: dPrefix, favorited: false }
  }
}

function readBanks(r: BinaryReader, p: PlayerCharacter, version: number): void {
  const bankSize = version >= 58 ? MaxBankSlots : 20

  for (let i = 0; i < bankSize; i++) p.bank1[i] = readBankItem(r)
  for (let i = 0; i < bankSize; i++) p.bank2[i] = readBankItem(r)

  if (version >= 182) {
    for (let i = 0; i < MaxBankSlots; i++) p.bank3[i] = readBankItem(r)
  }

  if (version >= 198) {
    for (let i = 0; i < MaxBankSlots; i++) {
      const netId = r.readInt32()
      const stack = r.readInt32()
      const prefix = r.readByte()
      const favorited = version >= 255 && r.readBoolean()
      p.bank4[i] = { netId, stack, prefix, favorited }
    }
  }

  if (version >= 199) p.voidVaultInfo = r.readByte()
}

function readLegacyEquipment(r: BinaryReader, version: number): void {
  // Pre-v38: string-based item names. TEdit reads them only to keep the
  // stream aligned and cannot resolve them, so neither can we.
  for (let i = 0; i < 8; i++) {
    r.readString()
    if (version >= 36) r.readByte()
  }

  if (version >= 6) {
    for (let i = 10; i < 13; i++) {
      r.readString()
      if (version >= 36) r.readByte()
    }
  }

  const invCount = version >= 15 ? 48 : 44
  for (let i = 0; i < invCount; i++) {
    r.readString()
    r.readInt32()
    if (version >= 36) r.readByte()
  }

  for (let i = 0; i < 20; i++) {
    r.readString()
    r.readInt32()
    if (version >= 36) r.readByte()
  }

  if (version >= 20) {
    for (let i = 0; i < 20; i++) {
      r.readString()
      r.readInt32()
      if (version >= 36) r.readByte()
    }
  }
}

function readCreativeSacrifices(r: BinaryReader, p: PlayerCharacter, version: number): void {
  // v282+ has a leading bool
  if (version >= 282) p.creativeSacrificesFlag = r.readBoolean()

  const count = r.readInt32()
  checkCount(count, r, 5, 'Journey research')
  for (let i = 0; i < count; i++) {
    const key = r.readString()
    const value = r.readInt32()
    p.creativeSacrifices.push({ key, value })
  }
}

function readTemporaryItems(r: BinaryReader): TemporaryItemSlots {
  const flags = r.readByte()
  return {
    flags,
    mouseItem: flags & 1 ? readItemSavingAndLoading(r) : null,
    creativeMenuItem: flags & 2 ? readItemSavingAndLoading(r) : null,
    guideItem: flags & 4 ? readItemSavingAndLoading(r) : null,
    reforgeItem: flags & 8 ? readItemSavingAndLoading(r) : null,
  }
}

function writeTemporaryItems(w: BinaryWriter, slots: TemporaryItemSlots): void {
  w.writeByte(slots.flags)
  const ordered = [slots.mouseItem, slots.creativeMenuItem, slots.guideItem, slots.reforgeItem]
  for (let bit = 0; bit < 4; bit++) {
    if ((slots.flags & (1 << bit)) === 0) continue
    const it = ordered[bit]
    if (!it) throw new FormatError(`Temporary item slot ${bit} is flagged but empty.`)
    writeItemSavingAndLoading(w, it)
  }
}

function readItemSavingAndLoading(r: BinaryReader): PlayerItem {
  const netId = r.readInt32()
  const stack = r.readInt32()
  const prefix = r.readByte()
  return { netId, stack, prefix, favorited: false }
}

function writeItemSavingAndLoading(w: BinaryWriter, it: PlayerItem): void {
  w.writeInt32(it.netId)
  w.writeInt32(it.stack)
  w.writeByte(it.prefix)
}

function readBankItem(r: BinaryReader): PlayerItem {
  return readItemSavingAndLoading(r)
}

function writeBankItems(w: BinaryWriter, items: PlayerItem[]): void {
  for (let i = 0; i < MaxBankSlots; i++) writeItemSavingAndLoading(w, slot(items, i))
}

function serializeLoadout(w: BinaryWriter, loadout: EquipmentLoadout, version: number): void {
  for (let i = 0; i < MaxArmorSlots; i++) {
    const it = slot(loadout.armor, i)
    w.writeInt32(it.netId)
    w.writeInt32(it.stack)
    w.writeByte(it.prefix)
    if (version >= 322) w.writeBoolean(it.favorited)
  }
  for (let i = 0; i < MaxDyeSlots; i++) {
    const it = slot(loadout.dye, i)
    w.writeInt32(it.netId)
    w.writeInt32(it.stack)
    w.writeByte(it.prefix)
    if (version >= 322) w.writeBoolean(it.favorited)
  }
  for (let i = 0; i < MaxDyeSlots; i++) w.writeBoolean(loadout.hide[i] ?? false)
}

function deserializeLoadout(r: BinaryReader, version: number): EquipmentLoadout {
  const readItem = (): PlayerItem => {
    const netId = r.readInt32()
    const stack = r.readInt32()
    const prefix = r.readByte()
    const favorited = version >= 322 && r.readBoolean()
    return { netId, stack, prefix, favorited }
  }
  const armor: PlayerItem[] = []
  for (let i = 0; i < MaxArmorSlots; i++) armor.push(readItem())
  const dye: PlayerItem[] = []
  for (let i = 0; i < MaxDyeSlots; i++) dye.push(readItem())
  const hide: boolean[] = []
  for (let i = 0; i < MaxDyeSlots; i++) hide.push(r.readBoolean())
  return { armor, dye, hide }
}

function readColor(r: BinaryReader): Rgb {
  const red = r.readByte()
  const green = r.readByte()
  const blue = r.readByte()
  return { r: red, g: green, b: blue }
}

function writeColor(w: BinaryWriter, c: Rgb): void {
  w.writeByte(c.r)
  w.writeByte(c.g)
  w.writeByte(c.b)
}

// ---------------------------------------------------------------------------
// Loadsmith helpers

function slot(list: PlayerItem[], i: number): PlayerItem {
  const it = list[i]
  if (!it) throw new FormatError(`Missing item slot ${i}.`)
  return it
}

/** Rejects counts that are negative or could not fit in the remaining bytes. */
function checkCount(count: number, r: BinaryReader, minBytesEach: number, what: string): void {
  if (count < 0 || count * minBytesEach > r.remaining) {
    throw new FormatError(`Bad ${what} count ${count} at offset ${r.position - 4}.`)
  }
}
