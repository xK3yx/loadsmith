import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureReport } from '../../scripts/check-fixtures-lib.ts'
import { MAX_DIFF_CHARS, buildReport, isPlayerCode, unclassedWeapons, unruledPrefixes } from '../../scripts/update-report-lib.ts'
import type { ItemRecord } from '../../src/data/types.ts'

const ROOT = join(import.meta.dirname, '..', '..')

describe('check-fixtures', () => {
  it('needs a 1.4.5.8 Classic and Journey character', () => {
    expect(fixtureReport([]).ok).toBe(false)
    expect(fixtureReport([{ name: 'c.plr', version: 326, difficulty: 0 }]).ok).toBe(false)
    expect(fixtureReport([{ name: 'j.plr', version: 326, difficulty: 3 }, { name: 'c.plr', version: 279, difficulty: 0 }]).ok).toBe(false)
    const ok = fixtureReport([
      { name: 'c.plr', version: 326, difficulty: 2 },
      { name: 'j.plr', version: 326, difficulty: 3 },
    ])
    expect(ok.ok).toBe(true)
    expect(ok.lines.join('\n')).toMatch(/1\.4\.4\.9 .*\*\*not checked in CI\*\*/)
  })

  it('only warns in warn-only mode, saying the round trip is not checked', () => {
    const r = fixtureReport([], [], true)
    expect(r.ok).toBe(true)
    expect(r.lines[2]).toBe('**No fixtures: save round trip not checked in CI.**')
    expect(r.lines.join('\n')).toMatch(/Missing:.*Classic/)
    const full = fixtureReport(
      [
        { name: 'c.plr', version: 326, difficulty: 0 },
        { name: 'j.plr', version: 326, difficulty: 3 },
      ],
      [],
      true,
    )
    expect(full.lines.join('\n')).not.toContain('No fixtures')
  })

  it('fails on an unreadable file and says what is missing', () => {
    const r = fixtureReport(
      [
        { name: 'c.plr', version: 326, difficulty: 0 },
        { name: 'j.plr', version: 326, difficulty: 3 },
      ],
      ['broken.plr'],
    )
    expect(r.ok).toBe(false)
    expect(fixtureReport([]).lines.join('\n')).toMatch(/Missing:.*Classic[\s\S]*Missing:.*Journey/)
  })
})

describe('update report', () => {
  const item = (id: number, name: string, extra: Partial<ItemRecord> = {}): ItemRecord => ({ id, name, key: name.replace(/\W/g, ''), maxStack: 9999, ...extra })
  const before = [item(1, 'Old Sword', { rackable: true }), item(2, 'Flairon', { key: 'Flairon' })]
  const after = [
    item(1, 'Old Sword', { rackable: true }),
    item(2, 'Flairoon', { key: 'Flairon' }),
    item(3, 'New Whip', { rackable: true }),
    item(4, 'Known Gun', { rackable: true }),
    item(5, 'New Wings', { rackable: true, accessory: true }),
    item(6, 'New Painting', { rackable: true, placeable: true }),
    item(7, 'New Ore'),
  ]
  const prefixes = [
    { id: 0, name: 'None', key: 'None' },
    { id: 81, name: 'Legendary', key: 'Legendary' },
    { id: 98, name: 'Brand New', key: 'BrandNew' },
  ]

  it('finds new unclassed weapons and unruled modifiers', () => {
    expect(unclassedWeapons(before, after, new Set(['KnownGun'])).map((i) => i.name)).toEqual(['New Whip'])
    expect(unruledPrefixes(prefixes, new Set([81])).map((p) => p.name)).toEqual(['Brand New'])
    expect(isPlayerCode('src/TEdit.Terraria/Player/PlayerFile.cs')).toBe(true)
    expect(isPlayerCode('src/TEdit.Terraria/CreativePowers.cs')).toBe(true)
    expect(isPlayerCode('src/TEdit.Terraria/CreativePowersHelper.cs')).toBe(false)
    expect(isPlayerCode('src/TEdit.Terraria/World/WorldFile.cs')).toBe(false)
  })

  it('writes every section, with player code diffs', () => {
    const md = buildReport({
      before: { items: before },
      after: { items: after, prefixes },
      classKeys: new Set(['KnownGun']),
      ruledPrefixIds: new Set([81]),
      data: { from: 'a'.repeat(40), to: 'b'.repeat(40) },
      playerCode: {
        from: 'a'.repeat(40),
        to: 'b'.repeat(40),
        url: 'https://github.com/TEdit/Terraria-Map-Editor/compare/x...y',
        files: [
          { filename: 'src/TEdit.Terraria/Player/PlayerFile.cs', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' },
          { filename: 'src/TEdit.Terraria/World/WorldFile.cs', status: 'modified', patch: 'ignored' },
          { filename: 'src/TEdit.Terraria/Player/Big.cs', status: 'modified', patch: 'x'.repeat(MAX_DIFF_CHARS + 1) },
        ],
      },
      tests: { ok: false, output: 'FAIL something' },
    })
    expect(md).toContain('`aaaaaaa` → `bbbbbbb`')
    expect(md).toContain('**Tests fail**')
    expect(md).toContain('- New Whip (`NewWhip`, ID 3)')
    expect(md).not.toContain('Known Gun')
    expect(md).not.toContain('New Wings')
    expect(md).toContain('- Brand New (`BrandNew`, ID 98)')
    expect(md).toContain('- Flairon → Flairoon (`Flairon`)')
    expect(md).toContain('### `src/TEdit.Terraria/Player/PlayerFile.cs` (modified)')
    expect(md).toContain('+b')
    expect(md).not.toContain('WorldFile.cs')
    expect(md).toMatch(/Big\.cs[\s\S]*Diff left out/)
    expect(md.length).toBeLessThan(65_536)
  })

  it('says when nothing needs doing, and when the comparison failed', () => {
    const md = buildReport({
      before: { items: after },
      after: { items: after, prefixes: [] },
      classKeys: new Set(),
      ruledPrefixIds: new Set(),
      data: { from: 'a'.repeat(40), to: 'b'.repeat(40) },
      playerCodeError: 'GitHub compare failed: 403',
      tests: { ok: true, output: 'ok' },
    })
    expect(md).toContain('**Tests pass**')
    expect(md.match(/^None\.$/gm)).toHaveLength(3)
    expect(md).toContain("Couldn't compare: GitHub compare failed: 403")
  })

  it('pins the commit src/format/ is ported from', () => {
    const pin = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tedit-source.json'), 'utf8')) as { playerCode?: string }
    expect(pin.playerCode).toMatch(/^[0-9a-f]{40}$/)
    const header = readFileSync(join(ROOT, 'src', 'format', 'playerFile.ts'), 'utf8')
    expect(header).toContain(`at commit ${pin.playerCode!.slice(0, 8)}`)
  })
})

describe('site', () => {
  it('builds for xk3yx.github.io/loadsmith/', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toContain("base: '/loadsmith/'")
  })
})
