// Fills prompt/loadout-prompt.md with the player's step 2 choices.
// Plain text replacement only; the template is bundled at build time.

import template from '../../../prompt/loadout-prompt.md?raw'
import { gameVersionName } from '../../data/index.ts'
import type { PlayerCharacter } from '../../format/index.ts'
import { accessorySlotCount } from '../../loadout/index.ts'
import { isJourney } from './character.ts'

export const PROMPT_CLASSES = ['melee', 'ranged', 'magic', 'summon', 'all-rounder'] as const
export type PromptClass = (typeof PROMPT_CLASSES)[number]
export const PROMPT_WORLDS = ['classic', 'expert', 'master', 'journey'] as const
export type PromptWorld = (typeof PROMPT_WORLDS)[number]
export type PromptGoal = 'bosses' | 'general'

export interface PromptChoices {
  /** Unset until the player picks one. */
  class?: PromptClass
  goal: PromptGoal
  world?: PromptWorld
  bestModifiers: boolean
}

export const DEFAULT_CHOICES: PromptChoices = { goal: 'bosses', bestModifiers: true }

export const CLASS_LABELS: Record<PromptClass, string> = {
  melee: 'Melee',
  ranged: 'Ranged',
  magic: 'Magic',
  summon: 'Summon',
  'all-rounder': 'All-rounder',
}

export const WORLD_LABELS: Record<PromptWorld, string> = {
  classic: 'Classic',
  expert: 'Expert',
  master: 'Master',
  journey: 'Journey',
}

/** Accessory slots for a world, assuming the Demon Heart is used where it counts. */
export function slotText(world: PromptWorld): string {
  const n = accessorySlotCount(world, true)
  return n === undefined ? '5 to 7 accessory slots, depending on the difficulty slider' : `${n} accessory slots`
}

const CLASS_LINES: Record<PromptClass, string> = {
  melee: 'melee.',
  ranged: 'ranged.',
  magic: 'magic.',
  summon: 'summon.',
  'all-rounder':
    'all-rounder. Fill loadouts 1, 2 and 3 with three different class builds (write each one\'s class in its "class"), ' +
    'and stock storage with weapons, ammo and consumables for all three.',
}

const GOAL_LINES: Record<PromptGoal, string> = {
  bosses: 'bosses (single-target damage). This is the default.',
  general: 'general play (crowds, events and exploring).',
}

/** The missing choices, in the order the screen shows them. Empty when the prompt can be built. */
export function missingChoices(c: PromptChoices): ('class' | 'world')[] {
  const out: ('class' | 'world')[] = []
  if (!c.class) out.push('class')
  if (!c.world) out.push('world')
  return out
}

export function buildPrompt(c: PromptChoices, p: PlayerCharacter): string {
  if (!c.class || !c.world) throw new Error('Pick a class and a world difficulty first.')
  const journey = isJourney(p)
  const slots = accessorySlotCount(c.world, true)
  const worldLine =
    c.world === 'journey'
      ? 'World: a Journey world. Accessory slots depend on the difficulty slider: 5, a 6th with the Demon Heart at Expert difficulty or higher, and a 7th at Master.'
      : `World difficulty: ${WORLD_LABELS[c.world]} (${slots} accessory slots${c.world === 'classic' ? '' : ' with the Demon Heart'}).`
  const values: Record<string, string> = {
    GAME_VERSION: gameVersionName(p.version),
    MODE: journey ? 'Journey' : 'Classic',
    MODE_KEY: journey ? 'journey' : 'classic',
    WORLD_LINE: worldLine,
    WORLD_KEY: c.world,
    SLOTS: slots === undefined ? 'the number of' : String(slots),
    CLASS: c.class,
    CLASS_LINE: CLASS_LINES[c.class],
    GOAL: c.goal,
    GOAL_LINE: GOAL_LINES[c.goal],
    BEST_MODIFIERS: String(c.bestModifiers),
    BEST_MODIFIERS_NOTE: c.bestModifiers
      ? ' Loadsmith then gives every weapon and accessory the player owns its best modifier, so you only need to name modifiers for the items you pick.'
      : '',
    JOURNEY_RULE: journey ? ', and full research with "journey_research": "full"' : '',
    JOURNEY_FIELD: journey ? '"journey_research": "full",\n    ' : '',
  }
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => values[key] ?? m)
}

/** The loadout behind "Just make my gear perfect": reforge everything, change nothing else. */
export const PERFECT_GEAR_LOADOUT = { schema: 'loadsmith/1', best_modifiers: true } as const
