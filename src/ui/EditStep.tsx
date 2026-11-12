// Step 3: paste the AI's answer, fix problems, edit the loadout.

import { useEffect, useMemo, useState } from 'react'
import type { PlayerCharacter } from '../format/index.ts'
import { type Issue, type Loadout, type SchemaIssue, parseLoadoutText } from '../loadout/index.ts'
import { EditTable } from './EditTable.tsx'
import { jumpTo } from './dom.ts'
import { IssueList } from './Issues.tsx'
import { check, listWarnings } from './logic/check.ts'
import { isJourney } from './logic/character.ts'
import { applyFix } from './logic/paths.ts'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function schemaIssues(issues: SchemaIssue[]): Issue[] {
  return issues.map((i) => ({ severity: 'error', path: i.path, message: i.message }))
}

export function EditStep({
  character,
  pasted,
  loadout,
  parseIssues,
  onPaste,
  onLoadout,
  onBestModifiers,
  onNext,
}: {
  character: PlayerCharacter
  pasted: string
  loadout?: Loadout
  parseIssues: SchemaIssue[]
  onPaste: (text: string) => void
  onLoadout: (l: Loadout) => void
  onBestModifiers: (on: boolean) => void
  onNext: () => void
}) {
  const [textMode, setTextMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftIssues, setDraftIssues] = useState<SchemaIssue[]>([])
  const [replacing, setReplacing] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const checked = useDebounced(loadout, 200)
  const validation = useMemo(() => (checked ? check(checked, character) : undefined), [checked, character])
  const errors = validation?.errors ?? []
  const warnings = listWarnings(validation?.warnings ?? [])
  const showPaste = !loadout || replacing

  function next() {
    if (!loadout) return
    const now = check(loadout, character)
    if (now.errors.length > 0) {
      setBlocked(true)
      jumpTo(now.errors[0]!.path)
      return
    }
    onNext()
  }

  return (
    <section aria-labelledby="step3">
      <h2 id="step3">Paste and edit</h2>
      {showPaste ? (
        <div className="card">
          <label className="label" htmlFor="paste">
            Paste the AI's whole answer here
          </label>
          <textarea
            key={replacing ? 'replace' : 'first'}
            id="paste"
            className="paste"
            spellCheck={false}
            placeholder={'{\n  "schema": "loadsmith/1",\n  …\n}'}
            defaultValue={replacing ? '' : pasted}
            onChange={(e) => {
              onPaste(e.target.value)
              setReplacing(false)
              setTextMode(false)
            }}
          />
          <p className="muted">It's only read and checked, never run. Nothing leaves your computer.</p>
          {parseIssues.length > 0 && <IssueList errors={schemaIssues(parseIssues)} warnings={[]} />}
          {replacing && (
            <button type="button" className="link" onClick={() => setReplacing(false)}>
              Keep the current loadout
            </button>
          )}
        </div>
      ) : (
        <div className="loaded-bar">
          <span>Loadout loaded{loadout?.class ? ` (${String(loadout.class)})` : ''}.</span>
          <button type="button" className="link" onClick={() => setReplacing(true)}>
            Paste a different answer
          </button>
        </div>
      )}

      {loadout && !replacing && (
        <>
          <IssueList
            errors={errors}
            warnings={warnings}
            onFix={(path, value) => {
              const fixed = applyFix(loadout, path, value)
              if (fixed) onLoadout(fixed)
            }}
          />
          <div className="toolbar">
            <label className="check">
              <input type="checkbox" checked={loadout.best_modifiers === true} onChange={(e) => onBestModifiers(e.target.checked)} />
              <span>
                Best modifiers for everything
                <span className="muted"> (every weapon and accessory you own)</span>
              </span>
            </label>
            <button
              type="button"
              className="link"
              onClick={() => {
                setDraft(JSON.stringify(loadout, null, 2))
                setDraftIssues([])
                setTextMode((t) => !t)
              }}
            >
              {textMode ? 'Back to the table' : 'Edit as text'}
            </button>
          </div>
          {textMode ? (
            <div className="card">
              <textarea
                className="paste tall"
                aria-label="Loadout as text"
                spellCheck={false}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  const r = parseLoadoutText(e.target.value)
                  if (r.ok) {
                    setDraftIssues([])
                    onLoadout(r.loadout)
                  } else setDraftIssues(r.issues)
                }}
              />
              {draftIssues.length > 0 && <IssueList errors={schemaIssues(draftIssues)} warnings={[]} />}
            </div>
          ) : (
            <EditTable loadout={loadout} version={character.version} journey={isJourney(character)} issues={[...errors, ...warnings]} onChange={onLoadout} />
          )}
        </>
      )}

      <div className="actions">
        {blocked && errors.length > 0 && <p className="field-error">Fix the problems above first.</p>}
        <button type="button" className="primary" onClick={next} disabled={!loadout}>
          Next: check the changes
        </button>
      </div>
    </section>
  )
}
