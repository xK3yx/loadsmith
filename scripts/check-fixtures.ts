// node scripts/check-fixtures.ts
//
// CI step: fails unless tests/fixtures/ holds a throwaway Classic and a
// throwaway Journey character saved in Terraria 1.4.5.8, so the save round
// trip is never skipped in CI. Writes a note to the GitHub run summary
// (GITHUB_STEP_SUMMARY) when it's set, including that 1.4.4.9 round trips are
// covered only by tests/local/ on the maintainer's machine.

import { appendFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadPlayer } from '../src/format/index.ts'
import { type FixtureInfo, fixtureReport } from './check-fixtures-lib.ts'

const DIR = join(import.meta.dirname, '..', 'tests', 'fixtures')

const names = (await readdir(DIR, { recursive: true, encoding: 'utf8' })).filter((f) => f.toLowerCase().endsWith('.plr')).sort()
const fixtures: FixtureInfo[] = []
const unreadable: string[] = []
for (const name of names) {
  try {
    const p = await loadPlayer(new Uint8Array(await readFile(join(DIR, name))))
    fixtures.push({ name, version: p.version, difficulty: p.difficulty })
  } catch {
    unreadable.push(name)
  }
}

const report = fixtureReport(fixtures, unreadable)
const text = report.lines.join('\n')
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
if (!report.ok) {
  console.error('\nAdd the missing throwaway characters to tests/fixtures/ (never a personal character).')
  process.exit(1)
}
