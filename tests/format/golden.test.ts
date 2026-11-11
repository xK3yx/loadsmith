// Golden round-trip tests: decrypt -> parse -> serialize -> encrypt must give
// back the original file byte for byte, for every save we have.

import { describe, expect, it } from 'vitest'
import {
  CurrentVersion,
  decryptPlr,
  loadPlayer,
  parsePlayer,
  savePlayer,
  serializePlayer,
} from '../../src/format/index.ts'
import { bytesEqual, findSaves, firstDiff, readExpected } from './saves.ts'

const saves = findSaves()

describe.skipIf(saves.length === 0)('golden round trip', () => {
  describe.each(saves)('$label', (save) => {
    it('round-trips the decrypted bytes exactly', async () => {
      const plain = await decryptPlr(save.bytes)
      const out = serializePlayer(parsePlayer(plain))
      expect(firstDiff(out, plain), 'first differing offset').toBe(-1)
    })

    it('round-trips the encrypted file exactly', async () => {
      const out = await savePlayer(await loadPlayer(save.bytes))
      expect(out.byteLength).toBe(save.bytes.byteLength)
      expect(bytesEqual(out, save.bytes)).toBe(true)
    })

    it('parses its own output to an identical model', async () => {
      const first = await loadPlayer(save.bytes)
      const second = parsePlayer(serializePlayer(first))
      expect(second).toEqual(first)
    })

    it('is a supported version with the expected facts', async () => {
      const p = await loadPlayer(save.bytes)
      expect(p.version).toBeLessThanOrEqual(CurrentVersion)
      const facts = readExpected(save.dir)[save.name]
      if (facts) {
        expect(p.version).toBe(facts.version)
        expect(p.name).toBe(facts.name)
        expect(p.difficulty).toBe(facts.difficulty)
      }
    })

    it('changes exactly one slot when one inventory item is edited', async () => {
      const p = await loadPlayer(save.bytes)
      const before = serializePlayer(p)
      const slot = p.inventory.findIndex((it) => it.netId === 0)
      const index = slot === -1 ? 0 : slot
      p.inventory[index] = { netId: 29, stack: 3, prefix: 0, favorited: false } // Life Crystal
      const after = serializePlayer(p)
      expect(after.byteLength).toBe(before.byteLength)
      expect(bytesEqual(after, before)).toBe(false)

      const reparsed = parsePlayer(after)
      expect(reparsed.inventory[index]).toEqual({ netId: 29, stack: 3, prefix: 0, favorited: false })
      expect(reparsed).toEqual(p)
    })
  })
})

describe.skipIf(saves.length > 0)('golden round trip', () => {
  it.skip('no .plr files in tests/fixtures or tests/local', () => {})
})
