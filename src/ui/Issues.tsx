// The problem and note lists above the edit table, with "did you mean" buttons.

import type { Issue } from '../loadout/index.ts'
import { jumpTo } from './dom.ts'
import { friendlyMessage, issueLabel } from './logic/paths.ts'

export function IssueList({
  errors,
  warnings,
  onFix,
}: {
  errors: Issue[]
  warnings: Issue[]
  onFix?: (path: string, value: string) => void
}) {
  if (errors.length === 0 && warnings.length === 0) return null
  return (
    <div className="issues">
      {errors.length > 0 && (
        <div className="panel panel-error" role="alert">
          <p className="panel-title">
            {errors.length === 1 ? '1 thing to fix before you can download' : `${errors.length} things to fix before you can download`}
          </p>
          <ul>
            {errors.map((e, i) => (
              <IssueRow key={`${e.path}-${i}`} issue={e} onFix={onFix} />
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details className="panel panel-warning" open={errors.length === 0 || undefined}>
          <summary className="panel-title">{warnings.length === 1 ? '1 note' : `${warnings.length} notes`} (these don't stop the download)</summary>
          <ul>
            {warnings.map((w, i) => (
              <IssueRow key={`${w.path}-${i}`} issue={w} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function IssueRow({ issue, onFix }: { issue: Issue; onFix?: (path: string, value: string) => void }) {
  const fixes = onFix ? (issue.suggestions ?? []) : []
  return (
    <li>
      <button type="button" className="link where" onClick={() => jumpTo(issue.path)}>
        {issueLabel(issue.path)}
      </button>
      : {friendlyMessage(issue)}
      {fixes.length > 0 && (
        <span className="fixes">
          {' '}
          Did you mean{' '}
          {fixes.map((s) => (
            <button key={s} type="button" className="fix" onClick={() => onFix?.(issue.path, s)}>
              {s}
            </button>
          ))}
        </span>
      )}
    </li>
  )
}
