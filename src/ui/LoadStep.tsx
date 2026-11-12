// Step 1: drop in a .plr file and see the character.

import { useRef, useState } from 'react'
import type { PlayerCharacter } from '../format/index.ts'
import { characterSummary } from './logic/character.ts'
import { PLAYERS_FOLDERS } from './logic/download.ts'

export function FolderList() {
  return (
    <ul className="folders">
      {PLAYERS_FOLDERS.map((f) => (
        <li key={f.system}>
          <span className="folder-os">{f.system}</span>
          <code>{f.path}</code>
        </li>
      ))}
    </ul>
  )
}

export function LoadStep({
  character,
  error,
  busy,
  onFile,
  onNext,
  onPerfect,
}: {
  character?: PlayerCharacter
  error?: string
  busy: boolean
  onFile: (file: File) => void
  onNext: () => void
  onPerfect: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const drop = (
    <div
      className={`dropzone${over ? ' over' : ''}${character ? ' small' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <p className="drop-title">{character ? 'Drop a different character here' : 'Drop your character file here'}</p>
      <p className="muted">A .plr file. It stays on your computer; nothing is uploaded.</p>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Reading…' : 'Choose file'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".plr"
        className="sr-only"
        aria-label="Character file"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )

  if (!character) {
    return (
      <section aria-labelledby="step1">
        <h2 id="step1">Load your character</h2>
        {drop}
        {error && (
          <p className="panel panel-error" role="alert">
            {error}
          </p>
        )}
        <details className="help">
          <summary>Where do I find my character file?</summary>
          <p>Characters are in the Players folder, one .plr file per character, named after it:</p>
          <FolderList />
          <p className="muted">
            If your character uses Steam Cloud (the cloud icon in the character list), its file is in the Steam Cloud folder. Close Terraria
            before copying files.
          </p>
        </details>
      </section>
    )
  }

  const s = characterSummary(character)
  return (
    <section aria-labelledby="step1">
      <h2 id="step1">Your character</h2>
      {s.outdatedNotice && (
        <div className="panel panel-warning" role="status">
          <p className="panel-title">Load and save this character in the latest Terraria first</p>
          <p>{s.outdatedNotice}</p>
        </div>
      )}
      {error && (
        <p className="panel panel-error" role="alert">
          {error}
        </p>
      )}
      <div className="card summary">
        <div>
          <p className="char-name">{s.name || 'Unnamed character'}</p>
          <p className="muted">
            {s.mode === 'Journey' ? 'Journey' : `Classic, ${s.difficulty}`} · Terraria {s.gameVersion} · {s.life} life, {s.mana} mana
          </p>
        </div>
        <dl className="gear">
          <dt>Armor</dt>
          <dd>{s.armor.join(', ') || 'None'}</dd>
          <dt>Accessories</dt>
          <dd>{s.accessories.join(', ') || 'None'}</dd>
          <dt>Hotbar</dt>
          <dd>{s.hotbar.join(', ') || 'Empty'}</dd>
          <dt>Storage</dt>
          <dd>{s.storage.map((b) => `${b.label} ${b.used}/${b.total}`).join(' · ')}</dd>
        </dl>
      </div>
      <div className="choices-row">
        <div className="choice-card">
          <p className="choice-title">Build a loadout with an AI</p>
          <p className="muted">Get a prompt for ChatGPT, Claude or Gemini, then paste back what it writes.</p>
          <button type="button" className="primary" onClick={onNext}>
            Next: get the prompt
          </button>
        </div>
        <div className="choice-card">
          <p className="choice-title">Just make my gear perfect</p>
          <p className="muted">Gives every weapon and accessory you own its best modifier. No AI needed, nothing else changes.</p>
          <button type="button" onClick={onPerfect}>
            Make my gear perfect
          </button>
        </div>
      </div>
      {drop}
    </section>
  )
}
