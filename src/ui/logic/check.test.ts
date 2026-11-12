import { describe, expect, it } from 'vitest'
import { itemByKey } from '../../data/index.ts'
import { createEmptyPlayer } from '../../format/index.ts'
import { check, listWarnings } from './check.ts'
import { applyFix } from './paths.ts'

describe('check', () => {
  const p = createEmptyPlayer(279)
  p.inventory[0] = { netId: itemByKey('Megashark')!.id, stack: 1, prefix: 0, favorited: false }

  it('offers the best modifier when one doesn\'t fit, and the fix passes', () => {
    const l = { schema: 'loadsmith/1' as const, weapons: [{ item: 'Megashark', prefix: 'Legendary' }], accessories: [{ item: 'Hermes Boots', prefix: 'Unreal' }] }
    const v = check(l, p)
    expect(v.errors.map((e) => [e.path, e.suggestions])).toEqual([
      ['accessories[0].prefix', ['Menacing']],
      ['weapons[0].prefix', ['Unreal']],
    ])
    let fixed = l
    for (const e of v.errors) fixed = applyFix(fixed, e.path, e.suggestions![0]!) as typeof l
    expect(check(fixed, p).errors).toEqual([])
  })

  it('puts the outdated message aside and survives odd shapes', () => {
    const v = check({ schema: 'loadsmith/1' }, p)
    expect(v.warnings[0]?.path).toBe('save.version')
    expect(listWarnings(v.warnings)).toEqual([])
    expect(() => check({ schema: 'loadsmith/1', storage: 5, weapons: 'x' } as never, p)).not.toThrow()
  })
})
