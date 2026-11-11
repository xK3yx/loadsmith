// Ported from TEdit (https://github.com/TEdit/Terraria-Map-Editor),
// src/TEdit.Terraria/Player/PlayerConstants.cs and FileType.cs at commit 13110cec.
// Copyright (c) TEdit contributors. Licensed under the Microsoft Public License (MS-PL).
// This file remains under the MS-PL. See LICENSE.

export const MaxInventorySlots = 58
export const MaxArmorSlots = 20
export const MaxDyeSlots = 10
export const MaxMiscEquipSlots = 5
export const MaxBankSlots = 40
export const MaxBuffSlots = 44
export const MaxSpawnPoints = 200
export const MaxLoadouts = 3
export const MaxNameLength = 20
export const MaxHairStyles = 228
export const MaxHideInfoSlots = 13
export const MaxHideVisibleAccessory = 10
export const MaxDpadBindings = 4
export const MaxBuilderAccStatus = 12
/** Newest save version TEdit (and Loadsmith) understands: Terraria 1.4.5.8. */
export const CurrentVersion = 326

/** Re-Logic file header magic ("relogic" in the low 7 bytes). */
export const ReLogicMagic = 27981915666277746n

/** Re-Logic FileType enum. */
export const FileType = { None: 0, Map: 1, World: 2, Player: 3 } as const

// Loadsmith additions (not in TEdit):

/**
 * Oldest version the serializer accepts. TEdit's writer omits armor for
 * versions below 124 and inventory below 58, so older files can be read but
 * never written.
 */
export const MinWritableVersion = 124
