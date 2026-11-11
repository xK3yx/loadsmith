// applyLoadout: validates a loadout, then applies it to a copy of the
// character and describes every change for the preview. Nothing is ever
// dropped: items that are replaced move to free inventory or storage, and if
// anything has nowhere to go the result is an error instead of a file.
//
// Order:
//   1. Clear storage spaces set to "replace" (removed items are listed).
//   2. Equipment: loadout armor and accessories, weapons into the hotbar,
//      ammo, coins and the misc equipment slots. Replaced items are collected.
//   3. Place the replaced items: free main inventory, then piggy bank, safe,
//      Defender's Forge, Void Vault. The player's own items go first.
//   4. Storage contents, then "items" (merged into existing stacks first).
//   5. Hotbar order, then the character section.

import { type ItemRecord, fullResearch, itemById, maxStackFor, prefixById } from '../data/index.ts'
import { type PlayerCharacter, type PlayerItem, emptyItem } from '../format/index.ts'
import type { Loadout, StorageName } from './schema.ts'
import { STORAGE_NAMES } from './schema.ts'
import {
  ACCESSORY,
  AMMO,
  ARMOR_SLOTS,
  COINS,
  EQUIPMENT_INDEX,
  HOTBAR,
  MAIN,
  STORAGE_FIELD,
  STORAGE_LABEL,
  loadoutArmor,
} from './slots.ts'
import { type Issue, type ResolvedEntry, type ResolvedLoadout, validateLoadout } from './validate.ts'

export interface ItemView {
  id: number
  name: string
  stack: number
  prefix: number
  prefixName?: string
}

export interface SlotChange {
  area: string
  /** 1-based slot number as the player sees it. */
  slot: number
  before: ItemView | null
  after: ItemView | null
}

export interface MovedItem {
  item: ItemView
  from: string
  to: string
}

export interface RemovedItem {
  item: ItemView
  from: string
}

export interface CharacterChange {
  field: string
  before: string | number | boolean
  after: string | number | boolean
}

export interface Preview {
  changes: SlotChange[]
  /** New items the loadout adds to the character. */
  added: ItemView[]
  moved: MovedItem[]
  /** Deleted by storage "replace" mode. */
  removed: RemovedItem[]
  character: CharacterChange[]
  research?: { added: number; raised: number; unverified: boolean }
  unsupported: { recommendation: string; reason?: string }[]
  notes?: string
  warnings: Issue[]
}

export type ApplyResult =
  | { ok: true; character: PlayerCharacter; preview: Preview }
  | { ok: false; errors: Issue[]; warnings: Issue[] }

export function applyLoadout(character: PlayerCharacter, loadout: Loadout): ApplyResult {
  const validation = validateLoadout(loadout, character)
  if (!validation.resolved) return { ok: false, errors: validation.errors, warnings: validation.warnings }
  const applier = new Applier(structuredClone(character), validation.resolved, validation.warnings)
  return applier.run()
}

interface Area {
  label: string
  list: PlayerItem[]
  start: number
  end: number
}

interface Pending {
  item: PlayerItem
  from: string
}

class Applier {
  private readonly p: PlayerCharacter
  private readonly r: ResolvedLoadout
  private readonly errors: Issue[] = []
  private readonly warnings: Issue[]
  private readonly preview: Preview
  private readonly displaced: Pending[] = []
  /** Single items equipped by the loadout, which may turn out to be re-equips. */
  private readonly equipped: { item: PlayerItem; where: string }[] = []

  constructor(p: PlayerCharacter, r: ResolvedLoadout, warnings: Issue[]) {
    this.p = p
    this.r = r
    this.warnings = [...warnings]
    this.preview = {
      changes: [],
      added: [],
      moved: [],
      removed: [],
      character: [],
      unsupported: r.unsupported,
      warnings: this.warnings,
    }
    if (r.notes !== undefined) this.preview.notes = r.notes
  }

  run(): ApplyResult {
    this.clearReplacedStorage()
    this.gear()
    this.weapons()
    this.ammo()
    this.coins()
    this.equipment()
    this.reconcileEquipped()
    this.placeDisplaced()
    this.storage()
    this.items()
    this.hotbarOrder()
    this.character()
    if (this.errors.length > 0) return { ok: false, errors: this.errors, warnings: this.warnings }
    return { ok: true, character: this.p, preview: this.preview }
  }

  // ---------------------------------------------------------------- helpers

  private view(it: PlayerItem): ItemView | null {
    if (it.netId === 0) return null
    const v: ItemView = { id: it.netId, name: itemById(it.netId)?.name ?? `Item ${it.netId}`, stack: it.stack, prefix: it.prefix }
    const prefixName = it.prefix ? prefixById(it.prefix)?.name : undefined
    if (prefixName) v.prefixName = prefixName
    return v
  }

  private make(e: ResolvedEntry, stack = e.stack): PlayerItem {
    return { netId: e.item.id, stack, prefix: e.prefix, favorited: e.favorite }
  }

  /**
   * Writes an equipment slot from the loadout, records the change, and
   * collects whatever was there so it can move to free space.
   */
  private put(list: PlayerItem[], index: number, area: string, next: PlayerItem): void {
    const old = list[index] ?? emptyItem()
    if (old.netId === next.netId && old.prefix === next.prefix && old.stack === next.stack) {
      if (next.favorited) old.favorited = true
      return
    }
    list[index] = next
    this.preview.changes.push({ area, slot: index + 1, before: this.view(old), after: this.view(next) })
    if (old.netId !== 0) this.displaced.push({ item: { ...old, favorited: false }, from: `${area} slot ${index + 1}` })
    if (next.netId !== 0) this.equipped.push({ item: next, where: area })
  }

  /**
   * A loadout that equips an item the character just took off (the same
   * accessories in a new order, say) re-uses that item instead of adding a
   * copy. Everything else equipped counts as added.
   */
  private reconcileEquipped(): void {
    for (const { item } of this.equipped) {
      const record = itemById(item.netId)
      const single = !record || maxStackFor(record).max === 1
      const match = this.displaced.findIndex(
        (d) => d.item.netId === item.netId && d.item.prefix === item.prefix && (single || d.item.stack === item.stack),
      )
      if (match !== -1) {
        this.displaced.splice(match, 1)
        continue
      }
      this.preview.added.push(this.view(item)!)
    }
  }

  private bank(name: StorageName): Area {
    return { label: STORAGE_LABEL[name], list: this.p[STORAGE_FIELD[name]], start: 0, end: 39 }
  }

  private mainInventory(): Area {
    return { label: 'Inventory', list: this.p.inventory, start: MAIN.start, end: MAIN.end }
  }

  /** Free inventory, then storage in order. */
  private overflowAreas(): Area[] {
    return [this.mainInventory(), ...STORAGE_NAMES.map((n) => this.bank(n))]
  }

  /**
   * Puts an item in the first area with room: tops up existing stacks of the
   * same item (up to its stack limit) when mergeAreas is given, then uses
   * the first empty slot. Returns where it went, or null if there's no room.
   */
  private place(item: PlayerItem, emptyAreas: Area[], mergeAreas: Area[] = []): { area: Area; index: number }[] | null {
    const record = itemById(item.netId)
    const max = record ? maxStackFor(record).max : 1
    let left = item.stack
    const placed: { area: Area; index: number }[] = []

    if (max > 1) {
      for (const area of mergeAreas) {
        for (let i = area.start; i <= area.end && left > 0; i++) {
          const slot = area.list[i]!
          if (slot.netId !== item.netId || slot.prefix !== item.prefix || slot.stack >= max) continue
          const add = Math.min(max - slot.stack, left)
          const before = this.view(slot)
          slot.stack += add
          left -= add
          this.preview.changes.push({ area: area.label, slot: i + 1, before, after: this.view(slot) })
          placed.push({ area, index: i })
        }
      }
    }
    for (const area of emptyAreas) {
      for (let i = area.start; i <= area.end && left > 0; i++) {
        if (area.list[i]!.netId !== 0) continue
        const stack = Math.min(left, max)
        // The file stores favorites for the inventory and the Void Vault only.
        const keepsFavorite = area.list === this.p.inventory || area.list === this.p.bank4
        const next = { ...item, stack, favorited: item.favorited && keepsFavorite }
        area.list[i] = next
        left -= stack
        this.preview.changes.push({ area: area.label, slot: i + 1, before: null, after: this.view(next) })
        placed.push({ area, index: i })
      }
    }
    return left > 0 ? null : placed
  }

  private noRoom(what: string, item: PlayerItem, path?: string): void {
    const v = this.view(item)
    this.errors.push({
      severity: 'error',
      path: path ?? '(apply)',
      message: `No room for ${v?.stack ?? 1}x ${v?.name ?? 'item'} (${what}). Free some inventory or storage slots, or use storage "replace" mode.`,
    })
  }

  // ---------------------------------------------------------------- steps

  private clearReplacedStorage(): void {
    for (const name of STORAGE_NAMES) {
      if (this.r.storage[name]?.mode !== 'replace') continue
      const area = this.bank(name)
      for (let i = area.start; i <= area.end; i++) {
        const old = area.list[i]!
        if (old.netId === 0) continue
        this.preview.removed.push({ item: this.view(old)!, from: area.label })
        this.preview.changes.push({ area: area.label, slot: i + 1, before: this.view(old), after: null })
        area.list[i] = emptyItem()
      }
    }
  }

  private gear(): void {
    for (const set of this.r.gearSets) {
      const list = loadoutArmor(this.p, set.loadout)
      const label = `Loadout ${set.loadout}`
      if (set.armor) {
        set.armor.forEach((e, i) => {
          if (!e) return
          this.put(list, ARMOR_SLOTS[i]!, `${label} armor`, { ...this.make(e, 1), favorited: false })
        })
      }
      if (set.accessories) {
        // The list replaces all 7 functional accessory slots; unused ones are emptied.
        for (let k = 0; k <= ACCESSORY.end - ACCESSORY.start; k++) {
          const e = set.accessories[k]
          this.put(list, ACCESSORY.start + k, `${label} accessories`, e ? { ...this.make(e, 1), favorited: false } : emptyItem())
        }
      }
    }
  }

  private weapons(): void {
    const weapons = this.r.weapons
    if (!weapons) return
    weapons.forEach((e, i) => {
      this.put(this.p.inventory, HOTBAR.start + i, 'Hotbar', this.make(e))
      const elsewhere = this.findElsewhere(e.item.id, e.prefix, HOTBAR.start + i)
      if (elsewhere) this.warnings.push({ severity: 'warning', path: e.path, message: `${e.item.name} is already in your ${elsewhere}; this adds another.` })
    })
  }

  private findElsewhere(id: number, prefix: number, exceptInventorySlot: number): string | undefined {
    const inv = this.p.inventory.findIndex((it, i) => i !== exceptInventorySlot && it.netId === id && it.prefix === prefix)
    if (inv !== -1) return 'inventory'
    for (const name of STORAGE_NAMES) {
      if (this.p[STORAGE_FIELD[name]].some((it) => it.netId === id && it.prefix === prefix)) return STORAGE_LABEL[name]
    }
    return undefined
  }

  private ammo(): void {
    this.r.ammo?.forEach((e, i) => this.put(this.p.inventory, AMMO.start + i, 'Ammo', this.make(e)))
  }

  private coins(): void {
    const coins = this.r.coins
    if (!coins) return
    // Coins replace the four coin slots; old coins move to storage.
    for (let i = 0; i <= COINS.end - COINS.start; i++) {
      const e = coins[i]
      this.put(this.p.inventory, COINS.start + i, 'Coins', e ? this.make(e) : emptyItem())
    }
  }

  private equipment(): void {
    for (const [slot, e] of Object.entries(this.r.equipment) as [keyof typeof EQUIPMENT_INDEX, ResolvedEntry][]) {
      this.put(this.p.miscEquips, EQUIPMENT_INDEX[slot], `Equipment (${slot.replace('_', ' ')})`, { ...this.make(e, 1), favorited: false })
    }
  }

  private placeDisplaced(): void {
    for (const d of this.displaced) {
      const placed = this.place(d.item, this.overflowAreas(), this.overflowAreas())
      if (!placed) {
        this.noRoom(`moved from ${d.from}`, d.item)
        continue
      }
      const to = [...new Set(placed.map((pl) => pl.area.label))].join(', ')
      this.preview.moved.push({ item: this.view(d.item)!, from: d.from, to })
    }
  }

  private storage(): void {
    for (const name of STORAGE_NAMES) {
      const space = this.r.storage[name]
      if (!space) continue
      const area = this.bank(name)
      for (const e of space.items) {
        const placed = this.place(this.make(e), [area], [area])
        if (!placed) {
          this.noRoom(`${STORAGE_LABEL[name]} is full`, this.make(e), e.path)
          continue
        }
        this.preview.added.push(this.view(this.make(e))!)
        this.favorite(e, placed)
      }
    }
  }

  private items(): void {
    const items = this.r.items
    if (!items) return
    const everywhere: Area[] = [
      { label: 'Inventory', list: this.p.inventory, start: HOTBAR.start, end: MAIN.end },
      ...STORAGE_NAMES.map((n) => this.bank(n)),
    ]
    for (const e of items) {
      const had = everywhere.some((a) => a.list.slice(a.start, a.end + 1).some((it) => it.netId === e.item.id && it.prefix === e.prefix))
      const before = this.preview.changes.length
      const placed = this.place(this.make(e), this.overflowAreas(), everywhere)
      if (!placed) {
        this.noRoom('items', this.make(e), e.path)
        continue
      }
      this.preview.added.push(this.view(this.make(e))!)
      const newSlot = this.preview.changes.slice(before).some((c) => c.before === null)
      if (had && newSlot) {
        this.warnings.push({
          severity: 'warning',
          path: e.path,
          message: `You already have ${e.item.name}, but existing stacks were full, so it takes a new slot.`,
        })
      }
      this.favorite(e, placed)
    }
  }

  private favorite(e: ResolvedEntry, placed: { area: Area; index: number }[]): void {
    if (!e.favorite) return
    for (const pl of placed) {
      // Favorites are stored for the inventory and the Void Vault only.
      if (pl.area.list === this.p.inventory || pl.area.list === this.p.bank4) pl.area.list[pl.index]!.favorited = true
    }
  }

  /**
   * Puts the named items into hotbar slots in order by swapping, so no free
   * space is needed. An item can come from the inventory or from storage
   * (for example when "items" topped up a stack in the Piggy Bank).
   */
  private hotbarOrder(): void {
    const order = this.r.hotbar
    if (!order) return
    const inv = this.p.inventory
    const locked = new Set<number>()
    order.forEach((item: ItemRecord | null, i) => {
      if (!item) return
      const target = HOTBAR.start + i
      const source = this.findForHotbar(item.id, target, locked)
      if (!source) {
        this.errors.push({ severity: 'error', path: `hotbar[${i}]`, message: `${item.name} isn't in the inventory or storage after applying the loadout.` })
        return
      }
      if (source.list !== inv || source.index !== target) {
        const a = inv[target]!
        const b = source.list[source.index]!
        const keepsFavorite = source.list === inv || source.list === this.p.bank4
        this.preview.changes.push({ area: 'Hotbar', slot: target + 1, before: this.view(a), after: this.view(b) })
        this.preview.changes.push({ area: source.label, slot: source.index + 1, before: this.view(b), after: this.view(a) })
        inv[target] = b
        source.list[source.index] = { ...a, favorited: a.favorited && keepsFavorite }
      }
      locked.add(target)
    })
  }

  private findForHotbar(id: number, target: number, locked: Set<number>): { list: PlayerItem[]; index: number; label: string } | undefined {
    const inv = this.p.inventory
    if (inv[target]!.netId === id && !locked.has(target)) return { list: inv, index: target, label: 'Hotbar' }
    const j = inv.findIndex((it, k) => k <= MAIN.end && !locked.has(k) && it.netId === id)
    if (j !== -1) return { list: inv, index: j, label: j <= HOTBAR.end ? 'Hotbar' : 'Inventory' }
    for (const name of STORAGE_NAMES) {
      const area = this.bank(name)
      const k = area.list.findIndex((it) => it.netId === id)
      if (k !== -1) return { list: area.list, index: k, label: area.label }
    }
    return undefined
  }

  private character(): void {
    const c = this.r.character
    const change = (field: string, before: number | boolean, after: number | boolean) => {
      if (before !== after) this.preview.character.push({ field, before, after })
    }
    if (c.maxLife !== undefined) {
      change('Max life', this.p.statLifeMax, c.maxLife)
      this.p.statLifeMax = c.maxLife
      this.p.statLife = c.maxLife
    }
    if (c.maxMana !== undefined) {
      change('Max mana', this.p.statManaMax, c.maxMana)
      this.p.statManaMax = c.maxMana
      this.p.statMana = c.maxMana
    }
    for (const f of c.flags) {
      change(f.flag.name, f.flag.get(this.p), f.value)
      f.flag.set(this.p, f.value)
    }
    if (c.fullResearch) this.research()
  }

  /**
   * Full Journey research. Writes exactly the required amount for each item,
   * never more; existing entries below it are raised, and nothing is lowered.
   * UNVERIFIED in-game (see src/data/research.ts and PLAN.md).
   */
  private research(): void {
    const existing = new Map(this.p.creativeSacrifices.map((s) => [s.key, s]))
    let added = 0
    let raised = 0
    for (const { key, amount } of fullResearch(this.p.version)) {
      const entry = existing.get(key)
      if (!entry) {
        this.p.creativeSacrifices.push({ key, value: amount })
        added++
      } else if (entry.value < amount) {
        entry.value = amount
        raised++
      }
    }
    this.preview.research = { added, raised, unverified: true }
  }
}
