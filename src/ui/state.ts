// App state for the four steps. Pure, so it's tested without a browser.

import type { PlayerCharacter } from '../format/index.ts'
import { type Loadout, type SchemaIssue, parseLoadoutText } from '../loadout/index.ts'
import { DEFAULT_CHOICES, PERFECT_GEAR_LOADOUT, type PromptChoices } from './logic/prompt.ts'

export type Step = 1 | 2 | 3 | 4

export interface State {
  step: Step
  file?: { name: string; character: PlayerCharacter }
  loadError?: string
  choices: PromptChoices
  pasted: string
  loadout?: Loadout
  parseIssues: SchemaIssue[]
  /** True when step 4 came from "Just make my gear perfect". */
  quick: boolean
}

export type Action =
  | { type: 'loaded'; name: string; character: PlayerCharacter }
  | { type: 'loadFailed'; message: string }
  | { type: 'choices'; choices: PromptChoices }
  | { type: 'go'; step: Step }
  | { type: 'paste'; text: string }
  | { type: 'loadout'; loadout: Loadout }
  | { type: 'bestModifiers'; on: boolean }
  | { type: 'perfect' }
  | { type: 'startOver' }
  | { type: 'loadAnother' }

export const initialState: State = { step: 1, choices: DEFAULT_CHOICES, pasted: '', parseIssues: [], quick: false }

/** Clears the loadout but keeps the prompt settings (and the character, unless told otherwise). */
function cleared(s: State): State {
  return { ...s, pasted: '', loadout: undefined, parseIssues: [], quick: false }
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'loaded':
      return { ...cleared(s), step: 1, file: { name: a.name, character: a.character }, loadError: undefined }
    case 'loadFailed':
      return { ...s, loadError: a.message }
    case 'choices':
      return { ...s, choices: a.choices }
    case 'go':
      // Leaving the "make my gear perfect" preview drops its loadout, so step 3 starts empty.
      return s.quick && a.step !== 4 ? { ...cleared(s), step: a.step } : { ...s, step: a.step }
    case 'paste': {
      if (!a.text.trim()) return { ...s, pasted: a.text, loadout: undefined, parseIssues: [] }
      const r = parseLoadoutText(a.text)
      if (!r.ok) return { ...s, pasted: a.text, loadout: undefined, parseIssues: r.issues }
      // The answer's own best_modifiers wins; otherwise the step 2 toggle applies.
      const best = typeof r.loadout.best_modifiers === 'boolean' ? r.loadout.best_modifiers : s.choices.bestModifiers
      return {
        ...s,
        pasted: a.text,
        loadout: { ...r.loadout, best_modifiers: best },
        parseIssues: [],
        choices: { ...s.choices, bestModifiers: best },
      }
    }
    case 'loadout':
      return { ...s, loadout: a.loadout }
    case 'bestModifiers':
      return {
        ...s,
        choices: { ...s.choices, bestModifiers: a.on },
        loadout: s.loadout ? { ...s.loadout, best_modifiers: a.on } : s.loadout,
      }
    case 'perfect':
      return { ...cleared(s), loadout: structuredClone(PERFECT_GEAR_LOADOUT) as unknown as Loadout, quick: true, step: 4 }
    case 'startOver':
      return { ...cleared(s), step: s.file ? 2 : 1 }
    case 'loadAnother':
      return { ...cleared(s), file: undefined, loadError: undefined, step: 1 }
  }
}
