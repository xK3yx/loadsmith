import { describe, expect, it } from 'vitest'
import { formatJson, transformItems, transformPrefixes, transformVersions } from '../../scripts/sync-data-lib.ts'

describe('sync-data transforms', () => {
  it('trims items to the fields Loadsmith uses', () => {
    const out = transformItems([
      { id: 2, scale: 1, maxStackSize: 9999, name: 'Dirt Block', key: 'DirtBlock', createTile: 0 },
      { id: 1, scale: 1, maxStackSize: 9999, name: 'Iron Pickaxe', key: 'IronPickaxe', isRackable: true, rack: 'True' },
      { id: 3, maxStackSize: 9999, name: 'Solar Flare Helmet', key: 'SolarFlareHelmet', head: 171, rarity: 'Red' },
      { id: 4, maxStackSize: 9999, name: 'Ankh Shield ', key: 'AnkhShield', isAccessory: true, shieldSlot: 4 },
    ])
    expect(out).toEqual([
      { id: 1, name: 'Iron Pickaxe', key: 'IronPickaxe', maxStack: 9999, rackable: true },
      { id: 2, name: 'Dirt Block', key: 'DirtBlock', maxStack: 9999, placeable: true },
      { id: 3, name: 'Solar Flare Helmet', key: 'SolarFlareHelmet', maxStack: 9999, armor: 'head' },
      { id: 4, name: 'Ankh Shield', key: 'AnkhShield', maxStack: 9999, accessory: true },
    ])
  })

  it('fails loudly when TEdit changes its item format', () => {
    expect(() => transformItems([{ id: 1, name: 'X', stack: 5 }])).toThrow()
    expect(() => transformItems([{ id: '1', name: 'X', maxStackSize: 1 }])).toThrow()
    expect(() => transformItems({ items: [] })).toThrow()
    expect(() =>
      transformItems([
        { id: 1, name: 'A', maxStackSize: 1 },
        { id: 1, name: 'B', maxStackSize: 1 },
      ]),
    ).toThrow(/duplicate id/)
  })

  it('trims prefix names and drops the empty entry 0', () => {
    expect(
      transformPrefixes([{ name: '' }, { id: 1, name: 'Large ', key: 'Large' }, { id: 2, name: 'Massive ', key: 'Massive' }]),
    ).toEqual([
      { id: 1, name: 'Large', key: 'Large' },
      { id: 2, name: 'Massive', key: 'Massive' },
    ])
  })

  it('rejects prefixes out of order', () => {
    expect(() => transformPrefixes([{ name: '' }, { id: 2, name: 'Massive ', key: 'Massive' }])).toThrow(/in order/)
  })

  it('keeps the version map and per-version item limits', () => {
    const out = transformVersions({
      gameVersionToSaveVersion: { '1.4.4.9': 279, '1.4.5.8': 326 },
      saveVersions: [
        { saveVersion: 279, gameVersion: 'v1.4.4.9', maxItemId: 5455, maxTileId: 692, framedTileIds: [3] },
        { saveVersion: 326, gameVersion: '1.4.5.8', maxItemId: 6195 },
      ],
    })
    expect(out).toEqual({
      gameToSave: { '1.4.4.9': 279, '1.4.5.8': 326 },
      saveVersions: [
        { saveVersion: 279, gameVersion: '1.4.4.9', maxItemId: 5455 },
        { saveVersion: 326, gameVersion: '1.4.5.8', maxItemId: 6195 },
      ],
    })
    expect(() => transformVersions({ saveVersions: [] })).toThrow()
  })

  it('formats arrays one record per line', () => {
    expect(formatJson([{ a: 1 }, { b: 2 }])).toBe('[\n  {"a":1},\n  {"b":2}\n]\n')
  })
})
