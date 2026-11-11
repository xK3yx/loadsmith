// Synthetic tests for the player format. They don't need any save files, so
// they also run in CI. Real-save tests live in tests/format/.

import { describe, expect, it } from 'vitest'
import { BinaryWriter, FormatError } from './binary.ts'
import { CurrentVersion, MaxBuffSlots } from './constants.ts'
import { UnsupportedVersionError, loadPlayer, parsePlayer, savePlayer, serializePlayer } from './playerFile.ts'
import { type PlayerCharacter, createEmptyPlayer, isAccessoryHidden, isFavorite } from './types.ts'

function sample(version: number): PlayerCharacter {
  const p = createEmptyPlayer(version)
  p.name = 'Tester'
  p.difficulty = 3
  p.playTimeTicks = 123_456_789_012n
  p.fileRevision = 7
  p.fileFlags = 1n
  p.statLifeMax = 500
  p.statManaMax = 200
  p.hideVisibleAccessoryBytes = [0b0000_0101, 0b10]
  p.armor[3] = { netId: 4954, stack: 1, prefix: 72, favorited: false }
  p.inventory[0] = { netId: 4956, stack: 1, prefix: 81, favorited: true }
  p.bank2[5] = { netId: 2347, stack: 999, prefix: 0, favorited: false }
  p.buffs = Array.from({ length: MaxBuffSlots }, () => ({ type: 0, time: 0 }))
  p.buffs[0] = { type: 0, time: 0 }
  p.buffs[1] = { type: 26, time: 3600 } // a gap before it, which TEdit would compact
  p.spawnPoints = [{ x: 100, y: 200, worldId: 42, worldName: 'Test World' }]
  p.dead = true
  p.respawnTimer = 99_999 // above TEdit's clamp, must survive
  p.creativeSacrifices = [
    { key: 'Wood', value: 100 },
    { key: 'Gel', value: 99 },
  ]
  p.journeyPowers = [
    { id: 5, value: false },
    { id: 11, value: true },
    { id: 14, value: 0.5 },
  ]
  p.temporaryItems = {
    flags: 0b1001,
    mouseItem: { netId: 1, stack: 1, prefix: 0, favorited: false },
    creativeMenuItem: null,
    guideItem: null,
    reforgeItem: { netId: 2, stack: 1, prefix: 3, favorited: false },
  }
  p.superCartFlags = 0b11
  p.loadouts[1]!.armor[0] = { netId: 3, stack: 1, prefix: 0, favorited: version >= 322 }
  p.voiceVariant = 1
  if (version >= 281) p.voicePitchOffset = Math.fround(-0.25)
  if (version >= 300) p.craftingRefundItems = [{ netId: 9, stack: 5, prefix: 0, favorited: false }]
  if (version >= 310) p.oneTimeDialoguesSeen = ['Guide.Intro', 'Merchant.Hello']
  if (version >= 322) p.armor[3]!.favorited = true
  if (version >= 324) p.reservedFlag324 = true
  if (version >= 282) p.creativeSacrificesFlag = true
  if (version >= 283) p.team = 2
  return p
}

describe('parsePlayer / serializePlayer', () => {
  it.each([279, 300, 310, 322, 324, CurrentVersion])('round-trips a synthetic version %i character', (v) => {
    const p = sample(v)
    const bytes = serializePlayer(p)
    const parsed = parsePlayer(bytes)
    expect(parsed).toEqual(p)
    expect([...serializePlayer(parsed)]).toEqual([...bytes])
  })

  it('round-trips through encryption', async () => {
    const p = sample(CurrentVersion)
    expect(await loadPlayer(await savePlayer(p))).toEqual(p)
  })

  it('keeps values TEdit would clamp or drop', () => {
    const p = parsePlayer(serializePlayer(sample(CurrentVersion)))
    expect(p.respawnTimer).toBe(99_999)
    expect(p.buffs[0]).toEqual({ type: 0, time: 0 })
    expect(p.buffs[1]).toEqual({ type: 26, time: 3600 })
    expect(p.reservedFlag324).toBe(true)
    expect(p.creativeSacrificesFlag).toBe(true)
    expect(p.fileRevision).toBe(7) // not bumped
    expect(isFavorite(p)).toBe(true)
    expect(isAccessoryHidden(p, 0)).toBe(true)
    expect(isAccessoryHidden(p, 1)).toBe(false)
    expect(isAccessoryHidden(p, 9)).toBe(true)
  })

  it('adds exactly the 1.4.5 fields between versions 279 and 326', () => {
    const a = createEmptyPlayer(279)
    const b = createEmptyPlayer(326)
    a.name = b.name = 'Same'
    const delta = serializePlayer(b).byteLength - serializePlayer(a).byteLength
    const expected =
      1 + // v280 voice variant
      4 + // v281 voice pitch
      1 + // v282 sacrifice flag
      1 + // v283 team
      4 + // v300 crafting refund count
      4 + // v310 dialogue count
      (20 + 10) + // v322 armor and dye favorites
      3 * (20 + 10) + // v322 loadout favorites
      1 // v324 reserved flag
    expect(delta).toBe(expected)
  })

  it('writes fields only for versions that have them', () => {
    const p = sample(279)
    p.team = 5
    p.reservedFlag324 = true
    p.craftingRefundItems = [{ netId: 1, stack: 1, prefix: 0, favorited: false }]
    const parsed = parsePlayer(serializePlayer(p))
    expect(parsed.team).toBe(0)
    expect(parsed.reservedFlag324).toBe(false)
    expect(parsed.craftingRefundItems).toEqual([])
  })
})

describe('errors', () => {
  it('rejects versions newer than supported', () => {
    const w = new BinaryWriter()
    w.writeInt32(CurrentVersion + 1)
    expect(() => parsePlayer(w.toBytes())).toThrow(UnsupportedVersionError)
    expect(() => serializePlayer(createEmptyPlayer(CurrentVersion + 1))).toThrow(UnsupportedVersionError)
  })

  it('refuses to write versions TEdit cannot fully write', () => {
    expect(() => serializePlayer(createEmptyPlayer(123))).toThrow(UnsupportedVersionError)
  })

  it('rejects leftover bytes after the last field', () => {
    const bytes = serializePlayer(sample(CurrentVersion))
    const longer = new Uint8Array(bytes.byteLength + 1)
    longer.set(bytes)
    expect(() => parsePlayer(longer)).toThrow(/left over/)
  })

  it('rejects truncated files', () => {
    const bytes = serializePlayer(sample(CurrentVersion))
    expect(() => parsePlayer(bytes.subarray(0, bytes.byteLength - 1))).toThrow(FormatError)
  })

  it('rejects a bad Re-Logic header', () => {
    const bytes = serializePlayer(sample(CurrentVersion))
    bytes[4] = bytes[4]! ^ 0xff
    expect(() => parsePlayer(bytes)).toThrow(/Re-Logic/)
  })

  it('rejects a non-player file type', () => {
    const bytes = serializePlayer(sample(CurrentVersion))
    bytes[11] = 2 // World
    expect(() => parsePlayer(bytes)).toThrow(/Player file type/)
  })

  it('rejects unknown Journey power IDs instead of misreading', () => {
    const p = sample(CurrentVersion)
    p.journeyPowers = [{ id: 1, value: true }]
    expect(() => serializePlayer(p)).toThrow(/Unknown Journey power/)
  })

  it('rejects more buffs than the version holds', () => {
    const p = sample(CurrentVersion)
    p.buffs.push({ type: 1, time: 1 })
    expect(() => serializePlayer(p)).toThrow(FormatError)
  })

  it('rejects a flagged temporary item that is missing', () => {
    const p = sample(CurrentVersion)
    p.temporaryItems.flags = 0b0100
    expect(() => serializePlayer(p)).toThrow(/flagged but empty/)
  })
})
