// Locates test saves. tests/fixtures/ holds committed throwaway characters;
// tests/local/ holds personal saves that are gitignored and never committed.
// Tests must not write snapshots or other files derived from tests/local/.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
export const FIXTURES_DIR = join(ROOT, 'fixtures')
export const LOCAL_DIR = join(ROOT, 'local')

export interface SaveFile {
  /** e.g. "fixtures/classic-1458.plr" */
  label: string
  name: string
  dir: string
  bytes: Uint8Array
}

function listPlr(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.toLowerCase().endsWith('.plr'))
    .sort()
}

export function findSaves(): SaveFile[] {
  const out: SaveFile[] = []
  for (const [dir, tag] of [
    [FIXTURES_DIR, 'fixtures'],
    [LOCAL_DIR, 'local'],
  ] as const) {
    for (const name of listPlr(dir)) {
      out.push({ label: `${tag}/${name}`, name, dir, bytes: new Uint8Array(readFileSync(join(dir, name))) })
    }
  }
  return out
}

export function readSave(dir: string, name: string): Uint8Array | null {
  const path = join(dir, name)
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
}

export interface ExpectedFacts {
  version: number
  name: string
  difficulty: number
}

/** Optional expected.json next to the saves: { "<file>.plr": { version, name, difficulty } }. */
export function readExpected(dir: string): Record<string, ExpectedFacts> {
  const path = join(dir, 'expected.json')
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, ExpectedFacts>
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

/** First differing offset, or -1. Used for readable failure messages. */
export function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.byteLength, b.byteLength)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.byteLength === b.byteLength ? -1 : n
}

/** Paths of every leaf value that differs between two plain objects. */
export function diffPaths(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((k) =>
      diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k),
    )
  }
  return Object.is(a, b) ? [] : [path]
}
