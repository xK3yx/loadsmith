// Decides whether tests/fixtures/ has what CI needs. Kept apart from the
// file reading so it can be tested with made-up entries.

/** Save version CI requires fixtures for (Terraria 1.4.5.8). */
export const REQUIRED_VERSION = 326
/** Older supported save version: no new saves can be made without an old game install. */
export const OLD_VERSION = 279

export interface FixtureInfo {
  name: string
  version: number
  /** 0-2 Classic (Softcore, Mediumcore, Hardcore), 3 Journey. */
  difficulty: number
}

export interface FixtureReport {
  ok: boolean
  /** Markdown for the run summary. */
  lines: string[]
}

export function fixtureReport(fixtures: readonly FixtureInfo[], unreadable: readonly string[] = []): FixtureReport {
  const current = fixtures.filter((f) => f.version === REQUIRED_VERSION)
  const classic = current.some((f) => f.difficulty !== 3)
  const journey = current.some((f) => f.difficulty === 3)
  const old = fixtures.filter((f) => f.version === OLD_VERSION)
  const ok = classic && journey && unreadable.length === 0

  const lines = ['## Test fixtures', '']
  if (fixtures.length === 0) lines.push('No characters in `tests/fixtures/`.')
  for (const f of fixtures) lines.push(`- \`${f.name}\`: save version ${f.version}, ${f.difficulty === 3 ? 'Journey' : 'Classic'}`)
  for (const u of unreadable) lines.push(`- \`${u}\`: **can't be read as a character**`)
  lines.push('')
  if (!classic) lines.push(`**Missing:** a throwaway Classic character saved in Terraria 1.4.5.8 (save version ${REQUIRED_VERSION}).`)
  if (!journey) lines.push(`**Missing:** a throwaway Journey character saved in Terraria 1.4.5.8 (save version ${REQUIRED_VERSION}).`)
  if (unreadable.length) lines.push('**Every file in `tests/fixtures/` must be a readable character.**')
  if (ok) lines.push('1.4.5.8 Classic and Journey fixtures are present; the save round trip is checked on them.')
  lines.push(
    old.length > 0
      ? `1.4.4.9 (save version ${OLD_VERSION}) fixtures are present and checked too.`
      : `Note: 1.4.4.9 (save version ${OLD_VERSION}) round trips are **not checked in CI**. New 1.4.4.9 saves need an old game install, so they're covered by the personal saves in \`tests/local/\` on the maintainer's machine.`,
  )
  return { ok, lines }
}
