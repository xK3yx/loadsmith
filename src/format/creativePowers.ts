// Ported from TEdit (https://github.com/TEdit/Terraria-Map-Editor),
// src/TEdit.Terraria/CreativePowers.cs (Load and Save only) at commit 13110cec.
// Copyright (c) TEdit contributors. Licensed under the Microsoft Public License (MS-PL).
// This file remains under the MS-PL. See LICENSE.
//
// Loadsmith changes: powers are an ordered list (TEdit uses a dictionary, which
// would collapse duplicates and reorder), values are written back unclamped,
// and an unknown power ID is an error. TEdit silently skips it, which leaves
// the reader misaligned for the rest of the file.

import { type BinaryReader, type BinaryWriter, FormatError } from './binary.ts'
import type { JourneyPower } from './types.ts'

export const CreativePowerId = {
  time_setfrozen: 0,
  godmode: 5,
  time_setspeed: 8,
  rain_setfrozen: 9,
  wind_setfrozen: 10,
  increaseplacementrange: 11,
  setdifficulty: 12,
  biomespread_setfrozen: 13,
  setspawnrate: 14,
} as const

const BOOL_POWERS = new Set<number>([
  CreativePowerId.time_setfrozen,
  CreativePowerId.godmode,
  CreativePowerId.rain_setfrozen,
  CreativePowerId.wind_setfrozen,
  CreativePowerId.increaseplacementrange,
  CreativePowerId.biomespread_setfrozen,
])

const FLOAT_POWERS = new Set<number>([
  CreativePowerId.time_setspeed,
  CreativePowerId.setdifficulty,
  CreativePowerId.setspawnrate,
])

export function readCreativePowers(r: BinaryReader): JourneyPower[] {
  const powers: JourneyPower[] = []
  while (r.readBoolean()) {
    const at = r.position
    // TEdit reads Int16 and casts to the ushort enum.
    const id = r.readInt16() & 0xffff
    if (BOOL_POWERS.has(id)) powers.push({ id, value: r.readBoolean() })
    else if (FLOAT_POWERS.has(id)) powers.push({ id, value: r.readSingle() })
    else throw new FormatError(`Unknown Journey power ${id} at offset ${at}.`)
  }
  return powers
}

export function writeCreativePowers(w: BinaryWriter, powers: JourneyPower[]): void {
  for (const power of powers) {
    w.writeBoolean(true)
    w.writeUInt16(power.id)
    if (BOOL_POWERS.has(power.id)) {
      if (typeof power.value !== 'boolean') throw new TypeError(`Journey power ${power.id} needs a boolean.`)
      w.writeBoolean(power.value)
    } else if (FLOAT_POWERS.has(power.id)) {
      if (typeof power.value !== 'number') throw new TypeError(`Journey power ${power.id} needs a number.`)
      w.writeSingle(power.value)
    } else {
      throw new FormatError(`Unknown Journey power ${power.id}.`)
    }
  }
  w.writeBoolean(false)
}
