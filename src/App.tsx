// Loadsmith: load a character, get a prompt, paste and edit the AI's
// loadout, then preview and download. Everything runs in this browser tab;
// nothing is uploaded and there are no analytics.

import { useReducer, useState } from 'react'
import { EditStep } from './ui/EditStep.tsx'
import { LoadStep } from './ui/LoadStep.tsx'
import { PreviewStep } from './ui/PreviewStep.tsx'
import { PromptStep } from './ui/PromptStep.tsx'
import { characterSummary, loadCharacterFile } from './ui/logic/character.ts'
import { type State, type Step, initialState, reducer } from './ui/state.ts'

const STEP_NAMES: Record<Step, string> = { 1: 'Your character', 2: 'Get the prompt', 3: 'Paste and edit', 4: 'Check and download' }

function canOpen(s: State, step: Step): boolean {
  if (step === 1) return true
  if (step === 4) return !!s.file && !!s.loadout
  return !!s.file
}

export default function App() {
  const [s, dispatch] = useReducer(reducer, initialState)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const character = s.file?.character

  async function onFile(file: File) {
    setBusy(true)
    try {
      const r = await loadCharacterFile(file.name, new Uint8Array(await file.arrayBuffer()))
      if (r.ok) dispatch({ type: 'loaded', name: file.name, character: r.character })
      else dispatch({ type: 'loadFailed', message: r.message })
    } catch {
      dispatch({ type: 'loadFailed', message: "Loadsmith couldn't read that file. Try choosing it again." })
    } finally {
      setBusy(false)
    }
  }

  const go = (step: Step) => {
    dispatch({ type: 'go', step })
    window.scrollTo?.({ top: 0 })
  }
  const notice = character ? characterSummary(character).outdatedNotice : undefined

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Loadsmith</h1>
          <p className="muted">Upgrade your Terraria character with a loadout from any AI.</p>
        </div>
        {character && (
          <div className="top-actions">
            <span className="muted who">{character.name}</span>
            {confirming ? (
              <span className="confirm" role="group" aria-label="Start over">
                Clear the loadout and your edits?
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                    dispatch({ type: 'startOver' })
                  }}
                >
                  Yes, start over
                </button>
                <button type="button" className="link" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="link" onClick={() => (s.loadout ? setConfirming(true) : dispatch({ type: 'startOver' }))}>
                Start over
              </button>
            )}
            <button
              type="button"
              className="link"
              onClick={() => {
                setConfirming(false)
                dispatch({ type: 'loadAnother' })
              }}
            >
              Load another character
            </button>
          </div>
        )}
      </header>

      <nav className="steps" aria-label="Steps">
        <ol>
          {([1, 2, 3, 4] as const).map((n) => (
            <li key={n}>
              <button
                type="button"
                className={`step${s.step === n ? ' current' : ''}${n < s.step && !(s.quick && n > 1) ? ' done' : ''}`}
                aria-current={s.step === n ? 'step' : undefined}
                disabled={!canOpen(s, n)}
                onClick={() => go(n)}
              >
                <span className="step-num">{n}</span> {STEP_NAMES[n]}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main>
        {notice && s.step > 1 && (
          <p className="panel panel-warning compact" role="status">
            This character was last saved in an older Terraria. For the newest items and modifiers, load and save it once in the latest
            game first.
          </p>
        )}
        {s.step === 1 && (
          <LoadStep
            character={character}
            error={s.loadError}
            busy={busy}
            onFile={onFile}
            onNext={() => go(2)}
            onPerfect={() => dispatch({ type: 'perfect' })}
          />
        )}
        {s.step === 2 && character && (
          <PromptStep character={character} choices={s.choices} onChoices={(c) => dispatch({ type: 'choices', choices: c })} onNext={() => go(3)} />
        )}
        {s.step === 3 && character && (
          <EditStep
            character={character}
            pasted={s.pasted}
            loadout={s.loadout}
            parseIssues={s.parseIssues}
            onPaste={(text) => dispatch({ type: 'paste', text })}
            onLoadout={(loadout) => dispatch({ type: 'loadout', loadout })}
            onBestModifiers={(on) => dispatch({ type: 'bestModifiers', on })}
            onNext={() => go(4)}
          />
        )}
        {s.step === 4 && character && s.loadout && (
          <PreviewStep character={character} loadout={s.loadout} fileName={s.file?.name} quick={s.quick} onBack={() => go(s.quick ? 1 : 3)} />
        )}
      </main>

      <footer className="foot">
        <p>
          Your character file never leaves your computer: nothing is uploaded and there are no analytics. Not affiliated with Re-Logic.
          Single-player and friends' worlds only; tModLoader characters aren't supported.
        </p>
        <p>
          Save format from <a href="https://github.com/TEdit/Terraria-Map-Editor">TEdit</a> (MS-PL). Item research amounts from the{' '}
          <a href="https://terraria.wiki.gg/">Terraria Wiki</a>. Keep a backup of your characters.
        </p>
      </footer>
    </div>
  )
}
