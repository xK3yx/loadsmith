// zod schema for the loadsmith/1 loadout format (see PLAN.md, "Loadout JSON").
// Pasted JSON is only ever parsed and validated, never executed.
//
// The schema checks shape and bounds. Whether items, modifiers, stacks and
// flags are valid for a particular character is the validator's job.

import { z } from 'zod'

export const SCHEMA_ID = 'loadsmith/1'
/** Pasted text larger than this is rejected before parsing. */
export const MAX_INPUT_BYTES = 256 * 1024

const MAX_NAME = 100

export const ItemRef = z.union([z.string().trim().min(1).max(MAX_NAME), z.number().int().nonnegative().max(100_000)])
export type ItemRef = z.infer<typeof ItemRef>

const PrefixRef = z.union([z.string().trim().max(MAX_NAME), z.number().int().nonnegative().max(1000)])

export const EntryObject = z.looseObject({
  item: ItemRef,
  prefix: PrefixRef.optional(),
  stack: z.number().int().max(1_000_000).optional(),
  favorite: z.boolean().optional(),
  note: z.string().max(2000).optional(),
})
/** An item: a name or ID, or an object with prefix, stack and favorite. */
export const Entry = z.union([ItemRef, EntryObject])
export type Entry = z.infer<typeof Entry>

export const CLASSES = ['melee', 'ranged', 'magic', 'summon', 'all-rounder'] as const
/** The prompt's goal choice: "bosses" (single-target, the default) or "general". */
export const GOALS = ['bosses', 'general'] as const
export const WORLD_DIFFICULTIES =['classic', 'normal', 'expert', 'master', 'journey'] as const

const GearSet = z.looseObject({
  class: z.string().max(40).optional(),
  /** Head, body, legs. null leaves that slot as it is. */
  armor: z.array(Entry.nullable()).max(3).optional(),
  accessories: z.array(Entry).max(7).optional(),
})
export type GearSet = z.infer<typeof GearSet>

export const STORAGE_NAMES = ['piggy_bank', 'safe', 'defenders_forge', 'void_vault'] as const
export type StorageName = (typeof STORAGE_NAMES)[number]

const Storage = z.looseObject({
  mode: z.enum(['add', 'replace']).optional(),
  items: z.array(Entry).max(40).default([]),
})

export const EQUIPMENT_SLOTS = ['pet', 'light_pet', 'minecart', 'mount', 'hook'] as const
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

export const BOOSTERS = [
  'vital_crystal',
  'aegis_fruit',
  'arcane_crystal',
  'galaxy_pearl',
  'gummy_worm',
  'ambrosia',
  'artisan_loaf',
  'torch_god',
] as const

const coin = z.number().int().nonnegative().max(1_000_000)

/** Named keys of the character section. Any other key is a player flag name. */
export const CHARACTER_KEYS = ['max_life', 'max_mana', 'demon_heart', 'minecart_upgrade', 'journey_research', 'boosters'] as const

const Character = z.looseObject({
  max_life: z.number().int().min(1).max(100_000).optional(),
  max_mana: z.number().int().min(0).max(100_000).optional(),
  demon_heart: z.boolean().optional(),
  minecart_upgrade: z.boolean().optional(),
  journey_research: z.literal('full').optional(),
  boosters: z.union([z.literal('all'), z.array(z.enum(BOOSTERS)).max(BOOSTERS.length)]).optional(),
})

const Unsupported = z.union([
  z.string().max(2000),
  z.looseObject({ recommendation: z.string().max(2000), reason: z.string().max(2000).optional() }),
])

export const LoadoutSchema = z.looseObject({
  schema: z.literal(SCHEMA_ID),
  game_version: z.string().max(20).optional(),
  class: z.string().max(40).optional(),
  /** What the loadout is for: bosses (single-target, the default) or general play. Informational. */
  goal: z.enum(GOALS).optional(),
  target: z
    .looseObject({
      mode: z.enum(['classic', 'journey']).optional(),
      world_difficulty: z.enum(WORLD_DIFFICULTIES).optional(),
    })
    .optional(),
  armor: GearSet.shape.armor,
  accessories: GearSet.shape.accessories,
  weapons: z.array(Entry).max(10).optional(),
  /** Hotbar slots 1-10 in order. null leaves a slot as it is. */
  hotbar: z.array(ItemRef.nullable()).max(10).optional(),
  ammo: z.array(Entry).max(4).optional(),
  coins: z
    .looseObject({ platinum: coin.optional(), gold: coin.optional(), silver: coin.optional(), copper: coin.optional() })
    .optional(),
  equipment: z
    .looseObject(Object.fromEntries(EQUIPMENT_SLOTS.map((s) => [s, Entry.optional()])) as Record<EquipmentSlot, z.ZodOptional<typeof Entry>>)
    .optional(),
  loadouts: z.looseObject({ '1': GearSet.optional(), '2': GearSet.optional(), '3': GearSet.optional() }).optional(),
  items: z.array(Entry).max(200).optional(),
  storage: z
    .looseObject(Object.fromEntries(STORAGE_NAMES.map((s) => [s, Storage.optional()])) as Record<StorageName, z.ZodOptional<typeof Storage>>)
    .optional(),
  character: Character.optional(),
  /**
   * Reforge every weapon and accessory the character owns (inventory, storage,
   * all loadouts) to the best modifier for its type and save version.
   * Modifiers the loadout names itself are kept.
   */
  best_modifiers: z.boolean().optional(),
  unsupported: z.array(Unsupported).max(100).optional(),
  notes: z.string().max(50_000).optional(),
})
export type Loadout = z.infer<typeof LoadoutSchema>

/** Keys the schema knows at each level, for "ignored key" warnings. */
export const KNOWN_KEYS = {
  top: Object.keys(LoadoutSchema.shape),
  entry: Object.keys(EntryObject.shape),
  gearSet: Object.keys(GearSet.shape),
  storage: Object.keys(Storage.shape),
  target: ['mode', 'world_difficulty'],
  coins: ['platinum', 'gold', 'silver', 'copper'],
  unsupported: ['recommendation', 'reason'],
}

export interface SchemaIssue {
  path: string
  message: string
}

export type ParseResult = { ok: true; loadout: Loadout; raw: unknown } | { ok: false; issues: SchemaIssue[] }

/** Takes pasted text: plain JSON, or AI output with the JSON in a ``` code block. */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text)
  if (fenced?.[1]) return fenced[1]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : text
}

export function formatPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p)
  return out || '(top level)'
}

/** Parses pasted text into a loadout. Never evaluates anything. */
export function parseLoadoutText(text: string): ParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) {
    return { ok: false, issues: [{ path: '(top level)', message: `Loadout is larger than ${MAX_INPUT_BYTES / 1024} KB.` }] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(extractJson(text))
  } catch (err) {
    return { ok: false, issues: [{ path: '(top level)', message: `Not valid JSON: ${(err as Error).message}` }] }
  }
  return parseLoadout(raw)
}

export function parseLoadout(raw: unknown): ParseResult {
  const result = LoadoutSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })) }
  }
  return { ok: true, loadout: result.data, raw }
}
