// npm run update-report -- --before <dir> --tests-output <file> --tests-ok <true|false> --out <file>
//
// Writes the weekly update pull request description. <dir> holds copies of
// src/data/tedit/items.json and the old scripts/tedit-source.json taken
// before `npm run sync-data -- --ref master`; the new data is read from the
// repo. Compares TEdit's player save code between the commit src/format/ is
// ported from (playerCode in scripts/tedit-source.json) and the new data
// commit through GitHub's API, using GITHUB_TOKEN when set.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ItemRecord, PrefixRecord } from '../src/data/types.ts'
import { TEDIT_REPO } from './sync-data-lib.ts'
import { type PlayerCodeDiff, buildReport } from './update-report-lib.ts'

const ROOT = join(import.meta.dirname, '..')

function arg(name: string): string {
  const i = process.argv.indexOf(name)
  const v = i === -1 ? undefined : process.argv[i + 1]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

interface Pin {
  commit: string
  playerCode?: string
}

async function comparePlayerCode(from: string, to: string): Promise<PlayerCodeDiff> {
  const headers: Record<string, string> = { 'User-Agent': 'loadsmith-update-report', Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/repos/${TEDIT_REPO}/compare/${from}...${to}`, { headers })
  if (!res.ok) throw new Error(`GitHub compare failed: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { html_url: string; files?: { filename: string; status: string; patch?: string }[] }
  return { from, to, url: data.html_url, files: data.files ?? [] }
}

const before = arg('--before')
const oldPin = await json<Pin>(join(before, 'tedit-source.json'))
const newPin = await json<Pin>(join(ROOT, 'scripts', 'tedit-source.json'))
const groups = await json<{ groups: Record<string, number[]> }>(join(ROOT, 'src', 'data', 'rules', 'prefix-groups.json'))
const classes = await json<{ weapons: { key: string }[] }>(join(ROOT, 'src', 'data', 'rules', 'weapon-classes.json'))

const portedFrom = newPin.playerCode ?? oldPin.playerCode ?? oldPin.commit
let playerCode: PlayerCodeDiff | undefined
let playerCodeError: string | undefined
try {
  playerCode = await comparePlayerCode(portedFrom, newPin.commit)
} catch (err) {
  playerCodeError = err instanceof Error ? err.message : String(err)
}

const report = buildReport({
  before: { items: await json<ItemRecord[]>(join(before, 'items.json')) },
  after: {
    items: await json<ItemRecord[]>(join(ROOT, 'src', 'data', 'tedit', 'items.json')),
    prefixes: await json<PrefixRecord[]>(join(ROOT, 'src', 'data', 'tedit', 'prefixes.json')),
  },
  classKeys: new Set(classes.weapons.map((w) => w.key)),
  ruledPrefixIds: new Set(Object.values(groups.groups).flat()),
  data: { from: oldPin.commit, to: newPin.commit },
  ...(playerCode ? { playerCode } : {}),
  ...(playerCodeError ? { playerCodeError } : {}),
  tests: { ok: arg('--tests-ok') === 'true', output: await readFile(arg('--tests-output'), 'utf8').catch(() => '(no output)') },
})
await writeFile(arg('--out'), report)
console.log(`Wrote ${arg('--out')} (${report.length} characters).`)
