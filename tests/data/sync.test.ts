import { describe, expect, it } from 'vitest'
import {
  findRenames,
  formatJson,
  mergeRenames,
  transformItems,
  transformPrefixes,
  transformVersions,
} from '../../scripts/sync-data-lib.ts'
import { formatResearch, transformResearch } from '../../scripts/sync-research-lib.ts'
import type { ItemRecord } from '../../src/data/types.ts'

describe('sync-data renames and wings', () => {
  const oldItems: ItemRecord[] = [
    { id: 2611, name: 'Flairon', key: 'Flairon', maxStack: 9999 },
    { id: 1, name: 'Iron Pickaxe', key: 'IronPickaxe', maxStack: 9999 },
  ]
  const newItems: ItemRecord[] = [
    { id: 2611, name: 'Flairoon', key: 'Flairon', maxStack: 9999 },
    { id: 1, name: 'Iron Pickaxe', key: 'IronPickaxe', maxStack: 9999 },
    { id: 5526, name: 'Flairon', key: 'FlaironFlail', maxStack: 9999 },
  ]

  it('finds items whose name changed but key stayed', () => {
    expect(findRenames(oldItems, newItems)).toEqual([{ id: 2611, key: 'Flairon', oldName: 'Flairon', newName: 'Flairoon' }])
  })

  it('ignores items whose key changed (a different item reusing an ID)', () => {
    expect(findRenames([{ id: 9, name: 'A', key: 'A', maxStack: 1 }], [{ id: 9, name: 'B', key: 'B', maxStack: 1 }])).toEqual([])
  })

  it('adds renames as aliases once, with the last version of the old name', () => {
    const renames = findRenames(oldItems, newItems)
    const merged = mergeRenames([], renames, 279)
    expect(merged).toEqual([{ key: 'Flairon', name: 'Flairon', until: 279 }])
    expect(mergeRenames(merged, renames, 300)).toEqual(merged)
  })

  it('flags wings', () => {
    const [wings] = transformItems([{ id: 4954, name: 'Celestial Starboard', key: 'LongRainbowTrailWings', maxStackSize: 9999, isAccessory: true, wingSlot: 45 }])
    expect(wings).toMatchObject({ accessory: true, wings: true })
  })
})

describe('sync-research transform', () => {
  const items: ItemRecord[] = [
    { id: 2, name: 'Dirt Block', key: 'DirtBlock', maxStack: 9999 },
    { id: 4956, name: 'Zenith', key: 'Zenith', maxStack: 9999 },
    { id: 5036, name: 'Otherworldly Music Box (Lunar Boss)', key: 'MusicBoxOWMoonLord', maxStack: 9999 },
  ]

  it('keys amounts by TEdit key, matching on ID and name', () => {
    const { entries, skipped } = transformResearch(
      [
        { itemid: '4956', name: 'Zenith', research: '1' },
        { itemid: '2', name: 'Dirt Block', research: '100' },
        { itemid: '5036', name: 'Otherworldly Music Box (Lunar Boss)', research: '1' },
        { itemid: '5036', name: 'Ocram Trophy', research: '' }, // console item sharing the ID
        { itemid: '', name: 'Solar Flare armor', research: '' }, // set page
        { itemid: '9999', name: 'Nope', research: '5' },
      ],
      items,
    )
    expect(entries).toEqual([
      { key: 'DirtBlock', amount: 100 },
      { key: 'Zenith', amount: 1 },
      { key: 'MusicBoxOWMoonLord', amount: 1 },
    ])
    expect(skipped.map((s) => s.itemid)).toEqual(['9999'])
  })

  it('skips rows whose name does not match TEdit and fails on conflicting amounts', () => {
    expect(transformResearch([{ itemid: '2', name: 'Mud Block', research: '100' }], items).entries).toEqual([])
    expect(() =>
      transformResearch(
        [
          { itemid: '2', name: 'Dirt Block', research: '100' },
          { itemid: '2', name: 'Dirt Block', research: '50' },
        ],
        items,
      ),
    ).toThrow(/two research amounts/)
  })

  it('writes valid JSON with one entry per line', () => {
    const text = formatResearch([{ key: 'Zenith', amount: 1 }], '2026-11-12')
    expect(JSON.parse(text)).toMatchObject({ retrieved: '2026-11-12', entries: [{ key: 'Zenith', amount: 1 }] })
    expect(text).toContain('\n    {"key":"Zenith","amount":1}\n')
  })
})

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
