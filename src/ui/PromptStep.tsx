// Step 2: pick class, goal and world, then copy the prompt.

import { useState } from 'react'
import type { PlayerCharacter } from '../format/index.ts'
import {
  CLASS_LABELS,
  PROMPT_CLASSES,
  PROMPT_WORLDS,
  type PromptChoices,
  WORLD_LABELS,
  buildPrompt,
  missingChoices,
  slotText,
} from './logic/prompt.ts'

const CLASS_HINTS: Record<string, string> = {
  'all-rounder': 'Three builds, one per loadout',
}

function Pills<T extends string>({
  name,
  options,
  value,
  labels,
  hints,
  onChange,
  invalid,
}: {
  name: string
  options: readonly T[]
  value?: T
  labels: Record<T, string>
  hints?: Partial<Record<T, string>>
  onChange: (v: T) => void
  invalid?: boolean
}) {
  return (
    <div className={`pills${invalid ? ' invalid' : ''}`} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o} className={`pill${value === o ? ' on' : ''}`}>
          <input type="radio" name={name} className="sr-only" checked={value === o} onChange={() => onChange(o)} />
          {labels[o]}
          {hints?.[o] && <span className="pill-hint">{hints[o]}</span>}
        </label>
      ))}
    </div>
  )
}

export function PromptStep({
  character,
  choices,
  onChoices,
  onNext,
}: {
  character: PlayerCharacter
  choices: PromptChoices
  onChoices: (c: PromptChoices) => void
  onNext: () => void
}) {
  const [tried, setTried] = useState(false)
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no')
  const missing = missingChoices(choices)
  const show = tried ? missing : []
  const prompt = missing.length === 0 ? buildPrompt(choices, character) : ''
  const set = (c: Partial<PromptChoices>) => {
    onChoices({ ...choices, ...c })
    setCopied('no')
  }

  async function copy() {
    setTried(true)
    if (missing.length > 0) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section aria-labelledby="step2">
      <h2 id="step2">Get the prompt</h2>
      <div className="card form">
        <div className="form-row">
          <p className="label" id="class-label">
            Class
          </p>
          <Pills
            name="Class"
            options={PROMPT_CLASSES}
            value={choices.class}
            labels={CLASS_LABELS}
            hints={CLASS_HINTS}
            onChange={(v) => set({ class: v })}
            invalid={show.includes('class')}
          />
          {show.includes('class') && <p className="field-error">Pick a class first.</p>}
        </div>
        <div className="form-row">
          <p className="label">What is it for?</p>
          <Pills
            name="Goal"
            options={['bosses', 'general'] as const}
            value={choices.goal}
            labels={{ bosses: 'Bosses', general: 'General play' }}
            hints={{ bosses: 'One big target', general: 'Crowds, events, exploring' }}
            onChange={(v) => set({ goal: v })}
          />
        </div>
        <div className="form-row">
          <p className="label">World difficulty</p>
          <Pills
            name="World difficulty"
            options={PROMPT_WORLDS}
            value={choices.world}
            labels={WORLD_LABELS}
            onChange={(v) => set({ world: v })}
            invalid={show.includes('world')}
          />
          {choices.world && <p className="muted">{slotText(choices.world)}</p>}
          {show.includes('world') && <p className="field-error">Pick the difficulty of the world you play in.</p>}
        </div>
        <label className="check">
          <input type="checkbox" checked={choices.bestModifiers} onChange={(e) => set({ bestModifiers: e.target.checked })} />
          <span>
            Best modifiers for everything I own
            <span className="muted"> (weapons and accessories in your inventory, storage and all loadouts)</span>
          </span>
        </label>
        <div className="copy-row">
          <button type="button" className="primary" onClick={copy}>
            {copied === 'yes' ? 'Copied' : 'Copy prompt'}
          </button>
          <p className="muted">Paste it into ChatGPT, Claude or Gemini (one that can search the web works best), then copy its whole answer.</p>
        </div>
        {copied === 'failed' && (
          <div className="panel panel-warning">
            <p>Your browser blocked copying. Select the prompt below and press Ctrl+C (Cmd+C on a Mac).</p>
          </div>
        )}
        {prompt && (
          <details className="help" open={copied === 'failed' || undefined}>
            <summary>Show the prompt</summary>
            <textarea className="prompt-text" readOnly value={prompt} aria-label="Prompt" onFocus={(e) => e.currentTarget.select()} />
          </details>
        )}
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={onNext}>
          Next: paste the answer
        </button>
      </div>
    </section>
  )
}
