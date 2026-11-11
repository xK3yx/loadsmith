// The example loadout in PLAN.md must stay valid, so the doc can't drift away
// from the schema and validator.

import { describe, expect, it } from 'vitest'
import { createEmptyPlayer } from '../../src/format/index.ts'
import { applyLoadout, parseLoadoutText, validateLoadout } from '../../src/loadout/index.ts'
import { planExampleText } from './helpers.ts'

describe('PLAN.md example loadout', () => {
  it('parses', () => {
    expect(parseLoadoutText(planExampleText())).toMatchObject({ ok: true })
  })

  it('validates and applies on a blank 1.4.5.8 Journey character', () => {
    const r = parseLoadoutText(planExampleText())
    if (!r.ok) throw new Error('parse')
    const p = createEmptyPlayer(326)
    p.difficulty = 3
    p.buffs = Array.from({ length: 44 }, () => ({ type: 0, time: 0 }))
    const v = validateLoadout(r.loadout, p)
    expect(v.errors).toEqual([])
    // Expected warnings only: the example targets a Classic character, and research is unverified.
    expect(v.warnings.map((w) => w.path).sort()).toEqual(['character.journey_research', 'target.mode'])
    expect(applyLoadout(p, r.loadout).ok).toBe(true)
  })
})
