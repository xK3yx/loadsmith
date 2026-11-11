// Name normalization and "did you mean" scoring. Suggestions are only ever
// offered to the player; nothing is replaced automatically.

/** Lowercase, fold curly quotes and accents, drop everything but letters and digits. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** Normalized words, sorted, so word order doesn't matter. */
function tokenKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join('')
}

/** Optimal string alignment distance (Levenshtein plus adjacent swaps). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev2 = new Array<number>(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  let cur = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1)
      cur[j] = v
    }
    ;[prev2, prev, cur] = [prev, cur, prev2]
  }
  return prev[b.length]!
}

/** Similarity from 0 to 1 between two raw names. */
export function similarity(query: string, candidate: string): number {
  const a = normalizeName(query)
  const b = normalizeName(candidate)
  if (!a || !b) return 0
  const direct = 1 - editDistance(a, b) / Math.max(a.length, b.length)
  const ta = tokenKey(query)
  const tb = tokenKey(candidate)
  const reordered = 1 - editDistance(ta, tb) / Math.max(ta.length, tb.length)
  return Math.max(direct, reordered)
}

export interface Suggestion<T> {
  value: T
  name: string
  score: number
}

/** Best matches at or above `threshold`, highest first, unique by name. */
export function suggest<T>(
  query: string,
  candidates: Iterable<{ value: T; name: string }>,
  limit = 3,
  threshold = 0.6,
): Suggestion<T>[] {
  const best = new Map<string, Suggestion<T>>()
  for (const c of candidates) {
    const score = similarity(query, c.name)
    if (score < threshold) continue
    const prev = best.get(c.name)
    if (!prev || score > prev.score) best.set(c.name, { value: c.value, name: c.name, score })
  }
  return [...best.values()].sort((x, y) => y.score - x.score || x.name.localeCompare(y.name)).slice(0, limit)
}
