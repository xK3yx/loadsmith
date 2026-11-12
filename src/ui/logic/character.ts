// Loading a character file and summarizing it in plain words for step 1.
// Everything here runs in the browser; the file never leaves the computer.

import {
  MAX_SUPPORTED_VERSION,
  MIN_SUPPORTED_VERSION,
  displayName,
  gameVersionName,
  isSupportedVersion,
  itemById,
  outdatedSaveNotice,
  prefixById,
} from '../../data/index.ts'
import { type PlayerCharacter, type PlayerItem, UnsupportedVersionError, loadPlayer } from '../../format/index.ts'
import { ACCESSORY, HOTBAR, STORAGE_FIELD, STORAGE_LABEL, loadoutArmor } from '../../loadout/index.ts'
import { STORAGE_NAMES } from '../../loadout/schema.ts'

export type LoadResult = { ok: true; character: PlayerCharacter } | { ok: false; message: string }

/** Largest file we'll try to read. Real characters are well under 1 MB. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024

const NOT_A_CHARACTER =
  "This doesn't look like a Terraria character file. Pick the .plr file named after your character from the Players folder."

/** Decrypts and reads a .plr file, turning every failure into a sentence a player can act on. */
export async function loadCharacterFile(fileName: string, bytes: Uint8Array): Promise<LoadResult> {
  if (!/\.plr$/i.test(fileName)) {
    if (/\.tplr$/i.test(fileName)) {
      return { ok: false, message: 'That is a tModLoader file (.tplr). Loadsmith only edits regular Terraria characters (.plr).' }
    }
    if (/\.bak$/i.test(fileName)) {
      return { ok: false, message: 'That is a backup file (.bak). Pick the .plr file with the same name instead.' }
    }
    return { ok: false, message: NOT_A_CHARACTER }
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) return { ok: false, message: NOT_A_CHARACTER }
  let character: PlayerCharacter
  try {
    character = await loadPlayer(bytes)
  } catch (err) {
    if (err instanceof UnsupportedVersionError) return { ok: false, message: tooNewMessage() }
    return { ok: false, message: NOT_A_CHARACTER }
  }
  if (character.version < MIN_SUPPORTED_VERSION) {
    return {
      ok: false,
      message:
        `This character was saved in an older version of Terraria (${gameVersionName(character.version)}). ` +
        `Load it in Terraria ${gameVersionName(MAX_SUPPORTED_VERSION)}, save and quit once, then try again.`,
    }
  }
  if (character.version > MAX_SUPPORTED_VERSION || !isSupportedVersion(character.version)) {
    return { ok: false, message: tooNewMessage() }
  }
  return { ok: true, character }
}

function tooNewMessage(): string {
  return (
    `This character was saved in a newer version of Terraria than Loadsmith supports yet ` +
    `(it supports up to ${gameVersionName(MAX_SUPPORTED_VERSION)}). Check back after the next Loadsmith update.`
  )
}

export function isJourney(p: PlayerCharacter): boolean {
  return p.difficulty === 3
}

const DIFFICULTY_NAMES = ['Softcore', 'Mediumcore', 'Hardcore', 'Journey']

export interface StorageSummary {
  label: string
  used: number
  total: number
}

export interface CharacterSummary {
  name: string
  /** "Classic" or "Journey". */
  mode: string
  /** Softcore, Mediumcore, Hardcore or Journey. */
  difficulty: string
  gameVersion: string
  saveVersion: number
  outdatedNotice?: string
  life: number
  mana: number
  armor: string[]
  accessories: string[]
  hotbar: string[]
  storage: StorageSummary[]
}

/** In-game style name: "Menacing Celestial Starboard", "Torch ×99". */
export function itemLabel(it: { netId: number; stack: number; prefix: number }, saveVersion: number): string {
  const record = itemById(it.netId)
  const name = record ? displayName(record, saveVersion) : `Unknown item ${it.netId}`
  const prefix = it.prefix ? prefixById(it.prefix)?.name : undefined
  return `${prefix ? `${prefix} ` : ''}${name}${it.stack > 1 ? ` ×${it.stack}` : ''}`
}

function names(items: PlayerItem[], v: number): string[] {
  return items.filter((i) => i.netId !== 0).map((i) => itemLabel(i, v))
}

export function characterSummary(p: PlayerCharacter): CharacterSummary {
  const v = p.version
  const gear = loadoutArmor(p, 1)
  const notice = outdatedSaveNotice(v)
  return {
    name: p.name,
    mode: isJourney(p) ? 'Journey' : 'Classic',
    difficulty: DIFFICULTY_NAMES[p.difficulty] ?? 'Unknown',
    gameVersion: gameVersionName(v),
    saveVersion: v,
    ...(notice ? { outdatedNotice: notice } : {}),
    life: p.statLifeMax,
    mana: p.statManaMax,
    armor: names(gear.slice(0, 3), v),
    accessories: names(gear.slice(ACCESSORY.start, ACCESSORY.end + 1), v),
    hotbar: names(p.inventory.slice(HOTBAR.start, HOTBAR.end + 1), v),
    storage: STORAGE_NAMES.map((s) => {
      const bank = p[STORAGE_FIELD[s]]
      return { label: STORAGE_LABEL[s], used: bank.filter((i) => i.netId !== 0).length, total: bank.length }
    }),
  }
}
