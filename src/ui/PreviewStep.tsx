// Step 4: every change before it happens, then the download.

import { useMemo, useState } from 'react'
import type { PlayerCharacter } from '../format/index.ts'
import { type ItemView, type Loadout, type Preview, applyLoadout } from '../loadout/index.ts'
import { listWarnings } from './logic/check.ts'
import { FolderList } from './LoadStep.tsx'
import { downloadName, prepareDownload, viewLabel } from './logic/download.ts'
import { friendlyMessage, issueLabel } from './logic/paths.ts'

function List({ title, count, tone, open, children }: { title: string; count: number; tone?: 'danger'; open?: boolean; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <details className={`change-list${tone === 'danger' ? ' danger' : ''}`} open={open || undefined}>
      <summary>
        {title} <span className="count">({count})</span>
      </summary>
      <ul>{children}</ul>
    </details>
  )
}

function shown(v: string | number | boolean): string {
  return typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)
}

function slotText(v: ItemView | null): string {
  return v ? viewLabel(v) : 'empty'
}

function hasChanges(p: Preview): boolean {
  return p.changes.length > 0 || p.character.length > 0 || p.research !== undefined
}

function triggerDownload(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function PreviewStep({
  character,
  loadout,
  fileName,
  quick,
  onBack,
}: {
  character: PlayerCharacter
  loadout: Loadout
  fileName?: string
  quick: boolean
  onBack: () => void
}) {
  const result = useMemo(() => applyLoadout(character, loadout), [character, loadout])
  const [agreed, setAgreed] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' | 'done' } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const name = downloadName(fileName, character.name)

  if (!result.ok) {
    return (
      <section aria-labelledby="step4">
        <h2 id="step4">Check and download</h2>
        <div className="panel panel-error" role="alert">
          <p className="panel-title">This loadout can't be applied yet</p>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i}>
                {issueLabel(e.path)}: {friendlyMessage(e)}
              </li>
            ))}
          </ul>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={onBack}>
            Go back and fix it
          </button>
        </div>
      </section>
    )
  }

  const p = result.preview
  const warnings = listWarnings(p.warnings)
  const loadoutReforges = p.reforged.filter((r) => r.reason === 'loadout')
  const bestReforges = p.reforged.filter((r) => r.reason === 'best')
  const changed = hasChanges(p)
  const needsAgree = p.removed.length > 0

  async function download() {
    if (needsAgree && !agreed) return
    setStatus({ kind: 'working' })
    const file = await prepareDownload(result.ok ? result.character : character)
    if (!file.ok) return setStatus({ kind: 'error', message: file.message })
    triggerDownload(file.bytes, name)
    setStatus({ kind: 'done' })
  }

  return (
    <section aria-labelledby="step4">
      <h2 id="step4">{quick ? 'Best modifiers for everything you own' : 'Check and download'}</h2>

      {!changed ? (
        <div className="panel panel-info">
          <p className="panel-title">{quick ? 'Your gear already has the best modifiers' : 'Nothing to change'}</p>
          <p>{quick ? 'Every weapon and accessory Loadsmith knows already has its best modifier.' : 'This loadout matches your character as it is.'}</p>
        </div>
      ) : (
        <div className="totals">
          <div className="total">
            <span className="total-label">New items</span>
            <span className="total-num">{p.added.length}</span>
          </div>
          <div className="total">
            <span className="total-label">Moved</span>
            <span className="total-num">{p.moved.length}</span>
          </div>
          <div className="total">
            <span className="total-label">New modifiers</span>
            <span className="total-num">{p.reforged.length}</span>
          </div>
          <div className={`total${p.removed.length ? ' danger' : ''}`}>
            <span className="total-label">Deleted</span>
            <span className="total-num">{p.removed.length}</span>
          </div>
        </div>
      )}

      <div className="card changes">
        <List title='Deleted because a storage space is set to "empty it first"' count={p.removed.length} tone="danger" open>
          {p.removed.map((r, i) => (
            <li key={i}>
              {viewLabel(r.item)} <span className="muted">from {r.from}</span>
            </li>
          ))}
        </List>
        <List title="Moved from where you had them" count={p.moved.length}>
          {p.moved.map((m, i) => (
            <li key={i}>
              {viewLabel(m.item)}: <span className="muted">{m.from} → {m.to}</span>
            </li>
          ))}
        </List>
        <List title="Didn't fit, so put somewhere else" count={p.redirected.length}>
          {p.redirected.map((r, i) => (
            <li key={i}>
              {viewLabel(r.item)}: <span className="muted">wanted the {r.wanted}, went to {r.to}</span>
            </li>
          ))}
        </List>
        <List title="New modifiers from the loadout" count={loadoutReforges.length}>
          {loadoutReforges.map((r, i) => (
            <li key={i}>
              {r.item.name}: {r.fromPrefixName ?? 'no modifier'} → {r.item.prefixName ?? 'no modifier'} <span className="muted">({r.where})</span>
            </li>
          ))}
        </List>
        <List title="Best modifiers" count={bestReforges.length} open={quick}>
          {bestReforges.map((r, i) => (
            <li key={i}>
              {r.item.name}: {r.fromPrefixName ?? 'no modifier'} → {r.item.prefixName ?? 'no modifier'} <span className="muted">({r.where})</span>
            </li>
          ))}
        </List>
        <List title="New items" count={p.added.length}>
          {p.added.map((a, i) => (
            <li key={i}>{viewLabel(a)}</li>
          ))}
        </List>
        <List title="Character" count={p.character.length + (p.research ? 1 : 0)}>
          {p.character.map((c, i) => (
            <li key={i}>
              {c.field.replace(/_/g, ' ')}: {shown(c.before)} → {shown(c.after)}
            </li>
          ))}
          {p.research && (
            <li>
              Research: {p.research.added} items researched, {p.research.raised} topped up.
              {p.research.unverified && <span className="warning-text"> These amounts haven't been checked in the game yet.</span>}
            </li>
          )}
        </List>
        <List title="Do these in the game" count={p.unsupported.length} open>
          {p.unsupported.map((u, i) => (
            <li key={i}>
              {u.recommendation}
              {u.reason && <span className="muted"> ({u.reason})</span>}
            </li>
          ))}
        </List>
        <List title="Notes" count={warnings.length}>
          {warnings.map((w, i) => (
            <li key={i}>
              {issueLabel(w.path)}: {friendlyMessage(w)}
            </li>
          ))}
        </List>
        {p.notes && (
          <details className="change-list">
            <summary>The AI's notes</summary>
            <p className="notes">{p.notes}</p>
          </details>
        )}
        {p.changes.length > 0 && (
          <details className="change-list">
            <summary>Show every slot</summary>
            <table className="grid slots">
              <thead>
                <tr>
                  <th scope="col">Where</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {p.changes.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.area} {c.slot}
                    </td>
                    <td>{slotText(c.before)}</td>
                    <td>{slotText(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {changed && (
        <div className="card download">
          {needsAgree && (
            <label className="check danger-text">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I understand the {p.removed.length === 1 ? 'item' : `${p.removed.length} items`} under "Deleted" will be gone
            </label>
          )}
          <div className="copy-row">
            <button type="button" className="primary" onClick={download} disabled={status.kind === 'working' || (needsAgree && !agreed)}>
              {status.kind === 'working' ? 'Building…' : 'Download new character'}
            </button>
            <p className="muted">Saves {name}. Your original file isn't touched.</p>
          </div>
          {status.kind === 'error' && (
            <p className="panel panel-error" role="alert">
              {status.message}
            </p>
          )}
          {status.kind === 'done' && (
            <p className="panel panel-success" role="status">
              Downloaded {name}. Now put it in your Players folder:
            </p>
          )}
          <ol className="steps-howto">
            <li>Close Terraria.</li>
            <li>Back up your old {name}: copy it somewhere safe, like your desktop.</li>
            <li>
              Move the downloaded {name} into your Players folder, replacing the old one:
              <FolderList />
            </li>
            <li>If the character uses Steam Cloud, put it in the Steam Cloud folder instead.</li>
            <li>Start Terraria and check your character.</li>
          </ol>
        </div>
      )}

      <div className="actions">
        <button type="button" onClick={onBack}>
          {quick ? 'Back to your character' : 'Back to editing'}
        </button>
      </div>
    </section>
  )
}
