// npm run sync-research [-- --check]
//
// Downloads Journey Mode research amounts from the Terraria Wiki's Cargo API
// and writes src/data/rules/research.json, keyed by TEdit item key. Run it
// after `npm run sync-data`, since it matches wiki rows to the synced items.
// Development-time only: the app never contacts the wiki.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ItemRecord } from '../src/data/types.ts'
import { CargoPage, WIKI_API, type WikiRow, formatResearch, transformResearch } from './sync-research-lib.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ITEMS_FILE = join(ROOT, 'src', 'data', 'tedit', 'items.json')
const OUT_FILE = join(ROOT, 'src', 'data', 'rules', 'research.json')
const PAGE = 500

async function fetchRows(): Promise<WikiRow[]> {
  const rows: WikiRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      action: 'cargoquery',
      tables: 'Items',
      fields: 'Items.itemid=itemid,Items.name=name,Items.research=research',
      order_by: 'Items._ID',
      limit: String(PAGE),
      offset: String(offset),
      format: 'json',
    })
    const res = await fetch(`${WIKI_API}?${params}`, { headers: { 'User-Agent': 'loadsmith-sync-research' } })
    if (!res.ok) throw new Error(`Wiki API failed: ${res.status} ${res.statusText}`)
    const page = CargoPage.parse(await res.json()).cargoquery.map((r) => r.title)
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const items = JSON.parse(await readFile(ITEMS_FILE, 'utf8')) as ItemRecord[]
  const rows = await fetchRows()
  const { entries, skipped } = transformResearch(rows, items)

  const old = await readFile(OUT_FILE, 'utf8').catch(() => null)
  const oldRetrieved = old ? (JSON.parse(old) as { retrieved?: string }).retrieved : undefined
  const sameEntries = old !== null && JSON.stringify((JSON.parse(old) as { entries: unknown }).entries) === JSON.stringify(entries)
  const retrieved = sameEntries && oldRetrieved ? oldRetrieved : new Date().toISOString().slice(0, 10)

  console.log(`${rows.length} wiki rows, ${entries.length} research amounts, ${skipped.length} rows skipped.`)
  for (const s of skipped.slice(0, 20)) console.log(`  skipped ${s.itemid} "${s.name}": ${s.reason}`)
  if (sameEntries) {
    console.log('research.json is up to date.')
    return
  }
  if (check) {
    console.log('research.json would change.')
    process.exit(1)
  }
  await writeFile(OUT_FILE, formatResearch(entries, retrieved))
  console.log('updated src/data/rules/research.json')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
