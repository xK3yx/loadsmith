// Running the checker from the UI.

import { bestPrefixFor, prefixById } from '../../data/index.ts'
import type { PlayerCharacter } from '../../format/index.ts'
import { type Entry, type Issue, type Loadout, type Validation, validateLoadout } from '../../loadout/index.ts'
import { entryParts, getAt, resolveItem } from './entries.ts'

/**
 * A modifier that doesn't fit its item ("Legendary can't go on Megashark")
 * gets the item's best modifier as a "did you mean" fix. The checker only
 * suggests names for misspellings.
 */
function withModifierFixes(errors: Issue[], loadout: Loadout, saveVersion: number): Issue[] {
  return errors.map((e) => {
    if (e.suggestions?.length || !e.path.endsWith('.prefix')) return e
    const parts = entryParts(getAt(loadout, e.path.slice(0, -'.prefix'.length)) as Entry | undefined)
    const item = resolveItem(parts?.item, saveVersion)
    const best = item ? bestPrefixFor(item, saveVersion) : undefined
    const name = best !== undefined ? prefixById(best)?.name : undefined
    return name && name !== parts?.prefix ? { ...e, suggestions: [name] } : e
  })
}

/** Runs the checker; a shape it can't handle becomes one problem instead of a crash. */
export function check(loadout: Loadout, character: PlayerCharacter): Validation {
  try {
    const v = validateLoadout(loadout, character)
    return { ...v, errors: withModifierFixes(v.errors, loadout, character.version) }
  } catch {
    return {
      errors: [{ severity: 'error', path: '(top level)', message: "Loadsmith couldn't read part of this loadout. Try pasting the AI's answer again." }],
      warnings: [],
    }
  }
}

/** The outdated-save message is shown on its own at the top, so it's left out of the lists. */
export function listWarnings(warnings: Issue[]): Issue[] {
  return warnings.filter((w) => w.path !== 'save.version')
}
