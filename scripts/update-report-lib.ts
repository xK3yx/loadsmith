// Builds the weekly update pull request description from the game data
// before and after `npm run sync-data -- --ref master`. Pure functions, so
// tests can run them on made-up data; update-report.ts does the reading and
// the GitHub API call.

import type { ItemRecord, PrefixRecord } from '../src/data/types.ts'
import { type Rename, findRenames } from './sync-data-lib.ts'

/** TEdit's player save code, which src/format/ is ported from. */
export const PLAYER_CODE_PATHS = ['src/TEdit.Terraria/Player/', 'src/TEdit.Terraria/CreativePowers.cs']
/** GitHub limits a pull request description to 65,536 characters; keep room for the rest. */
export const MAX_DIFF_CHARS = 40_000

/**
 * New items that look like weapons (TEdit marks weapons and tools as
 * rackable) but aren't in weapon-classes.json. A best guess: TEdit has no
 * weapon flag, so a person checks the list.
 */
export function unclassedWeapons(before: readonly ItemRecord[], after: readonly ItemRecord[], classKeys: ReadonlySet<string>): ItemRecord[] {
  const old = new Set(before.map((i) => i.id))
  return after.filter(
    (i) => !old.has(i.id) && i.rackable && !i.accessory && !i.armor && !i.mount && !i.placeable && !classKeys.has(i.key ?? ''),
  )
}

/** Modifiers in the data that no rule table covers. */
export function unruledPrefixes(prefixes: readonly PrefixRecord[], ruledIds: ReadonlySet<number>): PrefixRecord[] {
  return prefixes.filter((p) => p.id !== 0 && !ruledIds.has(p.id))
}

export interface ChangedFile {
  filename: string
  status: string
  patch?: string
}

export interface PlayerCodeDiff {
  from: string
  to: string
  url: string
  files: ChangedFile[]
}

export function isPlayerCode(path: string): boolean {
  return PLAYER_CODE_PATHS.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p))
}

export interface ReportInput {
  before: { items: ItemRecord[] }
  after: { items: ItemRecord[]; prefixes: PrefixRecord[] }
  classKeys: ReadonlySet<string>
  ruledPrefixIds: ReadonlySet<number>
  data: { from: string; to: string }
  /** undefined when the comparison couldn't be fetched. */
  playerCode?: PlayerCodeDiff
  playerCodeError?: string
  tests: { ok: boolean; output: string }
}

const short = (sha: string) => sha.slice(0, 7)

function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const f = '`'.repeat(longest + 1)
  return `${f}diff\n${text}\n${f}`
}

export function buildReport(r: ReportInput): string {
  const weapons = unclassedWeapons(r.before.items, r.after.items, r.classKeys)
  const prefixes = unruledPrefixes(r.after.prefixes, r.ruledPrefixIds)
  const renames: Rename[] = findRenames(r.before.items, r.after.items)
  const out: string[] = []

  out.push(`Weekly sync of TEdit's game data: \`${short(r.data.from)}\` → \`${short(r.data.to)}\`.`, '')
  out.push(
    r.tests.ok ? '**Tests pass** with the new data.' : '**Tests fail** with the new data. Fix the rule tables (not the tests) before merging.',
    '',
  )

  out.push('## New weapons with no class', '')
  if (weapons.length === 0) out.push('None.')
  else {
    out.push('Add each real weapon to `src/data/rules/weapon-classes.json` (tools can be ignored):', '')
    for (const i of weapons) out.push(`- ${i.name} (\`${i.key ?? '?'}\`, ID ${i.id})`)
  }
  out.push('')

  out.push('## Modifiers with no rule', '')
  if (prefixes.length === 0) out.push('None.')
  else {
    out.push('Add them to `src/data/rules/prefix-groups.json`, and to `best-prefixes.json` if one beats the current pick:', '')
    for (const p of prefixes) out.push(`- ${p.name} (\`${p.key}\`, ID ${p.id})`)
  }
  out.push('')

  out.push('## Renamed items', '')
  if (renames.length === 0) out.push('None.')
  else {
    out.push('Kept automatically as aliases for older saves in `src/data/rules/aliases.json`:', '')
    for (const n of renames) out.push(`- ${n.oldName} → ${n.newName} (\`${n.key}\`)`)
  }
  out.push('')

  out.push("## TEdit's player save code", '')
  if (!r.playerCode) {
    out.push(`Couldn't compare: ${r.playerCodeError ?? 'unknown error'}. Check it by hand.`)
  } else {
    const changed = r.playerCode.files.filter((f) => isPlayerCode(f.filename))
    if (changed.length === 0) {
      out.push(`No changes since \`${short(r.playerCode.from)}\`, the commit \`src/format/\` is ported from.`)
    } else {
      out.push(
        `**Changed** since \`${short(r.playerCode.from)}\`, the commit \`src/format/\` is ported from. Port the diff to \`src/format/\` ` +
          '(same structure, line for line), update `docs/save-format.md`, then set `playerCode` in `scripts/tedit-source.json`. ' +
          `[Full comparison](${r.playerCode.url})`,
        '',
      )
      let budget = MAX_DIFF_CHARS
      for (const f of changed) {
        out.push(`### \`${f.filename}\` (${f.status})`, '')
        if (!f.patch) out.push('No diff shown by GitHub (binary or too large); see the full comparison.')
        else if (f.patch.length > budget) out.push('Diff left out to keep this description within GitHub\'s limit; see the full comparison.')
        else {
          out.push(fence(f.patch))
          budget -= f.patch.length
        }
        out.push('')
      }
    }
  }
  out.push('')

  out.push('## Test results', '')
  out.push('<details><summary>Output</summary>', '', '```', r.tests.output.trim().slice(-8000), '```', '', '</details>')
  return `${out.join('\n')}\n`
}
