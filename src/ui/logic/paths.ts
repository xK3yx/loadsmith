// Issue paths from the validator ("loadouts.2.accessories[0].prefix") turned
// into plain words ("Loadout 2, accessory 1: modifier") and into edits for
// the "did you mean" buttons.

import type { Issue, Loadout } from '../../loadout/index.ts'

export type PathPart = string | number

export function parsePath(path: string): PathPart[] {
  const out: PathPart[] = []
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (m[2] !== undefined) out.push(Number(m[2]))
    else if (m[1] !== undefined) out.push(m[1])
  }
  return out
}

const ARMOR_PIECES = ['helmet', 'chest piece', 'leggings']
const STORAGE_WORDS: Record<string, string> = {
  piggy_bank: 'Piggy bank',
  safe: 'Safe',
  defenders_forge: "Defender's Forge",
  void_vault: 'Void Vault',
}
const EQUIPMENT_WORDS: Record<string, string> = {
  hook: 'Hook',
  mount: 'Mount',
  minecart: 'Minecart',
  pet: 'Pet',
  light_pet: 'Light pet',
}
const CHARACTER_WORDS: Record<string, string> = {
  max_life: 'Max life',
  max_mana: 'Max mana',
  demon_heart: 'Demon Heart',
  minecart_upgrade: 'Minecart Upgrade Kit',
  journey_research: 'Full research',
  boosters: 'Boosters',
}
const TOP_WORDS: Record<string, string> = {
  schema: 'Format',
  game_version: 'Game version',
  target: 'Target',
  'target.mode': 'Mode',
  'target.world_difficulty': 'World difficulty',
  class: 'Class',
  goal: 'Goal',
  best_modifiers: 'Best modifiers',
  'save.version': 'Your character',
  notes: 'Notes',
  unsupported: 'Things to do in-game',
  coins: 'Coins',
}

/** "accessories" + 2 -> "Accessory 3"; armor slots are named. */
function listItem(section: string, index: number): string {
  switch (section) {
    case 'armor':
      return `Armor: ${ARMOR_PIECES[index] ?? `piece ${index + 1}`}`
    case 'accessories':
      return `Accessory ${index + 1}`
    case 'weapons':
      return `Weapon ${index + 1}`
    case 'hotbar':
      return `Hotbar slot ${index + 1}`
    case 'ammo':
      return `Ammo ${index + 1}`
    case 'items':
      return `Extra item ${index + 1}`
    case 'unsupported':
      return `In-game tip ${index + 1}`
    default:
      return `${section} ${index + 1}`
  }
}

/** Plain-words name for where an issue is, e.g. "Loadout 2, accessory 1: modifier". */
export function issueLabel(path: string): string {
  if (path === '(top level)' || path === '') return "The AI's answer"
  if (TOP_WORDS[path]) return TOP_WORDS[path]
  const parts = parsePath(path)
  let field: string | undefined
  const last = parts.at(-1)
  if (last === 'prefix' || last === 'stack' || last === 'item' || last === 'favorite' || last === 'mode') {
    parts.pop()
    field = { prefix: 'modifier', stack: 'amount', item: 'item', favorite: 'favorite', mode: 'mode' }[last]
  }
  let where: string
  const [a, b, c, d] = parts
  if (a === 'loadouts' && typeof b === 'string') {
    const inner = typeof c === 'string' && typeof d === 'number' ? listItem(c, d) : c ? String(c) : ''
    where = `Loadout ${b}${inner ? `, ${inner.charAt(0).toLowerCase()}${inner.slice(1)}` : ''}`
  } else if (a === 'storage' && typeof b === 'string') {
    const space = STORAGE_WORDS[b] ?? b
    where = c === 'items' && typeof d === 'number' ? `${space}, item ${d + 1}` : space
  } else if (a === 'equipment' && typeof b === 'string') {
    where = EQUIPMENT_WORDS[b] ?? b
  } else if (a === 'coins' && typeof b === 'string') {
    where = `${b.charAt(0).toUpperCase()}${b.slice(1)} coins`
  } else if (a === 'character' && typeof b === 'string') {
    where = CHARACTER_WORDS[b] ?? `Character setting "${b}"`
  } else if (typeof a === 'string' && typeof b === 'number') {
    where = listItem(a, b)
  } else {
    where = TOP_WORDS[String(a)] ?? path
  }
  return field ? `${where}: ${field}` : where
}

/** Whether an issue belongs to the row at `rowPath` (the row itself or one of its fields). */
export function isUnder(issuePath: string, rowPath: string): boolean {
  return issuePath === rowPath || issuePath.startsWith(`${rowPath}.`) || issuePath.startsWith(`${rowPath}[`)
}

export function issuesFor(issues: readonly Issue[], rowPath: string): Issue[] {
  return issues.filter((i) => isUnder(i.path, rowPath))
}

type Json = unknown
type Container = Record<string, Json> | Json[]

function isContainer(x: Json): x is Container {
  return typeof x === 'object' && x !== null
}

/**
 * Applies a "did you mean" suggestion at an issue's path and returns a new
 * loadout. Item and modifier names are set in place (a plain-name entry
 * becomes an object when a modifier is set); an unknown character setting is
 * renamed. Returns undefined when the path doesn't lead anywhere.
 */
export function applyFix(loadout: Loadout, path: string, value: string): Loadout | undefined {
  const next = structuredClone(loadout) as Record<string, Json>
  const parts = parsePath(path)
  if (parts.length === 0) return undefined

  // Unknown character setting: rename the key, keep its value.
  if (parts.length === 2 && parts[0] === 'character' && typeof parts[1] === 'string') {
    const ch = next.character
    if (!isContainer(ch) || Array.isArray(ch) || !(parts[1] in ch)) return undefined
    const renamed: Record<string, Json> = {}
    for (const [k, v] of Object.entries(ch)) renamed[k === parts[1] ? value : k] = v
    next.character = renamed
    return next as Loadout
  }

  const last = parts.at(-1)!
  const field = last === 'prefix' || last === 'item' ? (parts.pop(), last) : 'item'
  let parent: Json = next
  for (const p of parts.slice(0, -1)) {
    if (!isContainer(parent)) return undefined
    parent = (parent as Record<string | number, Json>)[p]
  }
  if (!isContainer(parent)) return undefined
  const key = parts.at(-1)!
  const holder = parent as Record<string | number, Json>
  const entry = holder[key]
  if (entry === undefined) return undefined
  if (isContainer(entry) && !Array.isArray(entry)) {
    holder[key] = { ...entry, [field]: value }
  } else if (field === 'item') {
    holder[key] = value
  } else {
    holder[key] = { item: entry, [field]: value }
  }
  return next as Loadout
}

/** Validator wording, adjusted where a row is simply empty. */
export function friendlyMessage(i: Issue): string {
  if (i.message === 'Unknown item "".') return 'Pick an item or remove this row.'
  return i.message
}
