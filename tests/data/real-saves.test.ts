// Our rules must never reject something the game itself saved. Every item in
// every real save must exist in that save's version, and its stack and
// modifier must pass the checks without an error (warnings are fine).

import { describe, expect, it } from 'vitest'
import { checkPrefix, checkStack, itemById, maxItemId, maxStackFor } from '../../src/data/index.ts'
import { type PlayerCharacter, type PlayerItem, loadPlayer } from '../../src/format/index.ts'
import { findSaves } from '../format/saves.ts'

const saves = findSaves()

/** Every item slot that holds a real stack. Armor, dye and misc slots are always 1. */
function stackedSlots(p: PlayerCharacter): [string, PlayerItem][] {
  const lists: Record<string, PlayerItem[]> = {
    inventory: p.inventory,
    bank1: p.bank1,
    bank2: p.bank2,
    bank3: p.bank3,
    bank4: p.bank4,
    craftingRefunds: p.craftingRefundItems,
    loadoutArmor: p.loadouts.flatMap((l) => l.armor),
    loadoutDye: p.loadouts.flatMap((l) => l.dye),
  }
  const temp = p.temporaryItems
  for (const [name, it] of Object.entries({
    mouse: temp.mouseItem,
    creative: temp.creativeMenuItem,
    guide: temp.guideItem,
    reforge: temp.reforgeItem,
  })) {
    if (it) lists[name] = [it]
  }
  return Object.entries(lists).flatMap(([where, list]) =>
    list.map((it, i): [string, PlayerItem] => [`${where}[${i}]`, it]),
  )
}

function allSlots(p: PlayerCharacter): [string, PlayerItem][] {
  const equip: [string, PlayerItem][] = [
    ...p.armor.map((it, i): [string, PlayerItem] => [`armor[${i}]`, it]),
    ...p.dye.map((it, i): [string, PlayerItem] => [`dye[${i}]`, it]),
    ...p.miscEquips.map((it, i): [string, PlayerItem] => [`miscEquips[${i}]`, it]),
    ...p.miscDyes.map((it, i): [string, PlayerItem] => [`miscDyes[${i}]`, it]),
  ]
  return [...equip, ...stackedSlots(p)].filter(([, it]) => it.netId !== 0)
}

describe.skipIf(saves.length === 0)('rules accept everything in real saves', () => {
  describe.each(saves)('$label', (save) => {
    it('every item exists in the save version', async () => {
      const p = await loadPlayer(save.bytes)
      const limit = maxItemId(p.version)
      const bad = allSlots(p)
        .filter(([, it]) => !itemById(it.netId) || it.netId > limit)
        .map(([where, it]) => `${where}: id ${it.netId}`)
      expect(bad).toEqual([])
    })

    it('every stack is within maxStackFor', async () => {
      const p = await loadPlayer(save.bytes)
      const bad = stackedSlots(p)
        .filter(([, it]) => it.netId !== 0)
        .flatMap(([where, it]) => {
          const item = itemById(it.netId)
          if (!item) return []
          const check = checkStack(item, it.stack)
          return check.ok || check.severity === 'warning'
            ? []
            : [`${where}: ${item.name} x${it.stack} (max ${maxStackFor(item).max})`]
        })
      expect(bad).toEqual([])
    })

    it('every modifier passes checkPrefix', async () => {
      const p = await loadPlayer(save.bytes)
      const bad = allSlots(p).flatMap(([where, it]) => {
        const item = itemById(it.netId)
        if (!item) return []
        const check = checkPrefix(it.prefix, item, p.version)
        return check.ok || check.severity === 'warning' ? [] : [`${where}: ${item.name} prefix ${it.prefix}: ${check.message}`]
      })
      expect(bad).toEqual([])
    })
  })
})
