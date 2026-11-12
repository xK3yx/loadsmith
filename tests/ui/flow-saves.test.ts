// The UI's path through every real save: load the file, summarize it, apply
// "Just make my gear perfect" and the PLAN.md example, build the download,
// and read it back. Skipped when no saves are present.

import { describe, expect, it } from 'vitest'
import { MAX_SUPPORTED_VERSION } from '../../src/data/index.ts'
import { loadPlayer } from '../../src/format/index.ts'
import { type Loadout, applyLoadout, parseLoadoutText } from '../../src/loadout/index.ts'
import { characterSummary, isJourney, loadCharacterFile } from '../../src/ui/logic/character.ts'
import { prepareDownload } from '../../src/ui/logic/download.ts'
import { PERFECT_GEAR_LOADOUT, buildPrompt } from '../../src/ui/logic/prompt.ts'
import { findSaves } from '../format/saves.ts'
import { conservationErrors, planExampleText } from '../loadout/helpers.ts'

const saves = findSaves()

describe.skipIf(saves.length === 0)('UI flow on real saves', () => {
  describe.each(saves)('$label', (save) => {
    it('loads, previews, downloads and reads back', async () => {
      const loaded = await loadCharacterFile(save.name, save.bytes)
      expect(loaded.ok).toBe(true)
      if (!loaded.ok) return
      const p = loaded.character
      const summary = characterSummary(p)
      expect(summary.outdatedNotice === undefined).toBe(p.version >= MAX_SUPPORTED_VERSION)
      expect(buildPrompt({ class: 'all-rounder', goal: 'bosses', world: 'master', bestModifiers: true }, p)).not.toMatch(/\{\{/)

      const plan = parseLoadoutText(planExampleText())
      if (!plan.ok) throw new Error('PLAN.md example does not parse')
      const example = structuredClone(plan.loadout)
      if (p.version < 315) example.weapons = [{ item: 'Zenith', prefix: 'Legendary', favorite: true }]
      if (!isJourney(p)) delete example.character!.journey_research

      for (const l of [structuredClone(PERFECT_GEAR_LOADOUT) as unknown as Loadout, example]) {
        const r = applyLoadout(p, l)
        if (!r.ok) throw new Error(r.errors.map((e) => `${e.path}: ${e.message}`).join('\n'))
        expect(conservationErrors(p, r.character, r.preview)).toEqual([])
        const file = await prepareDownload(r.character)
        expect(file.ok).toBe(true)
        if (file.ok) expect(await loadPlayer(file.bytes)).toEqual(r.character)
      }
    })
  })
})
