// applyLoadout: validates a loadout, then applies it to a copy of the
// character and describes every change for the preview. Nothing is ever
// dropped: items that are replaced move to free inventory or storage, and if
// anything has nowhere to go the result is an error instead of a file.
//
// Order:
//   1. Clear storage spaces set to "replace" (removed items are listed).
//   2. Equipment: loadout armor and accessories, weapons into the hotbar,
//      ammo, coins and the misc equipment slots. Replaced items are collected.
//      A weapon or accessory the character already owns (inventory, storage,
//      or just taken off) is moved into place instead of adding a copy.
//   3. Place the replaced items: free main inventory, then piggy bank, safe,
//      Defender's Forge, Void Vault. The player's own items go first.
//   4. Storage contents (in "add" mode, overflow goes to the next space with
//      room), then "items" (merged into existing stacks first).
//   5. Hotbar order, then the character section.

import { type ItemRecord, bestPrefixFor, fullResearch, itemById, itemKind, maxStackFor, prefixById } from '../data/index.ts'
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

/** An item whose modifier changed. item shows it after the change. */
export interface ReforgedItem {
  item: ItemView
  where: string
  fromPrefix: number
  fromPrefixName?: string
  /** "loadout": an owned item moved into place with the loadout's modifier. "best": the best-modifiers option. */
  reason: 'loadout' | 'best'
}

export interface RemovedItem {
  item: ItemView
  from: string
}

/** Storage items that went to another space because the chosen one was full. */
export interface RedirectedItem {
  item: ItemView
  /** The storage space the loadout chose. */
  wanted: string
  /** Where the items went instead (may include the chosen space for part of a stack). */
  to: string
  path: string
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
  reforged: ReforgedItem[]
  /** Deleted by storage "replace" mode. */
  removed: RemovedItem[]
  /** Add-mode storage items placed in the next space with room. */
  redirected: RedirectedItem[]
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

interface Equipped {
  item: PlayerItem
  where: string
  change: SlotChange
  /** Set for weapons and accessories: reuse an owned copy if there is one. */
  reuse?: ResolvedEntry
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
  private readonly equipped: Equipped[] = []
  /** Slots the loadout wrote, which must not be taken as "already owned". */
  private readonly written = new Set<PlayerItem>()
  /** Items placed with a modifier the loadout named, which best_modifiers keeps. */
  private readonly explicit = new Set<PlayerItem>()

  constructor(p: PlayerCharacter, r: ResolvedLoadout, warnings: Issue[]) {
    this.p = p
    this.r = r
    this.warnings = [...warnings]
    this.preview = {
      changes: [],
      added: [],
      moved: [],
      reforged: [],
      removed: [],
      redirected: [],
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
    if (this.r.bestModifiers) this.bestModifiers()
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
  private put(list: PlayerItem[], index: number, area: string, next: PlayerItem, reuse?: ResolvedEntry): void {
    const old = list[index] ?? emptyItem()
    // Without a modifier in the loadout, an owned item keeps its own.
    const keepPrefix = reuse !== undefined && !reuse.prefixGiven
    if (old.netId === next.netId && (old.prefix === next.prefix || keepPrefix) && old.stack === next.stack) {
      if (next.favorited) old.favorited = true
      this.written.add(old)
      if (reuse?.prefixGiven) this.explicit.add(old)
      return
    }
    list[index] = next
    this.written.add(next)
    if (reuse?.prefixGiven) this.explicit.add(next)
    const change: SlotChange = { area, slot: index + 1, before: this.view(old), after: this.view(next) }
    this.preview.changes.push(change)
    if (old.netId !== 0) this.displaced.push({ item: { ...old, favorited: false }, from: `${area} slot ${index + 1}` })
    if (next.netId !== 0) this.equipped.push(reuse ? { item: next, where: area, change, reuse } : { item: next, where: area, change })
  }

  /**
   * A loadout that equips an item the character just took off (the same
   * accessories in a new order, say) re-uses that item instead of adding a
   * copy. Everything else equipped counts as added.
   */
  private reconcileEquipped(): void {
    for (const eq of this.equipped) {
      const { item } = eq
      const record = itemById(item.netId)
      const single = !record || maxStackFor(record).max === 1
      const match = this.displaced.findIndex(
        (d) => d.item.netId === item.netId && d.item.prefix === item.prefix && (single || d.item.stack === item.stack),
      )
      if (match !== -1) {
        this.displaced.splice(match, 1)
        continue
      }
      if (eq.reuse && single && this.reuseOwned(eq)) continue
      this.preview.added.push(this.view(item)!)
    }
  }

  /**
   * Weapons and accessories: if the character owns the item (just taken off,
   * in the inventory, or in storage), that one moves into place and gets the
   * loadout's modifier instead of a copy being added. An owned copy with the
   * same modifier is preferred. Without a modifier in the loadout, the owned
   * item keeps its own.
   */
  private reuseOwned(eq: Equipped): boolean {
    const { item, reuse } = eq
    const same = (it: PlayerItem) => it.netId === item.netId && it.prefix === item.prefix
    const any = (it: PlayerItem) => it.netId === item.netId

    let owned: Pending | undefined
    for (const test of [same, any]) {
      const d = this.displaced.findIndex((x) => test(x.item))
      if (d !== -1) {
        owned = this.displaced.splice(d, 1)[0]!
        break
      }
      const slot = this.findOwnedSlot(test)
      if (slot) {
        const it = slot.list[slot.index]!
        slot.list[slot.index] = emptyItem()
        this.preview.changes.push({ area: slot.label, slot: slot.index + 1, before: this.view(it), after: null })
        owned = { item: it, from: `${slot.label} slot ${slot.index + 1}` }
        break
      }
    }
    if (!owned) return false

    if (!reuse!.prefixGiven) item.prefix = owned.item.prefix
    eq.change.after = this.view(item)
    if (owned.item.prefix !== item.prefix) this.reforged(item, eq.where, owned.item.prefix, 'loadout')
    this.preview.moved.push({ item: this.view(item)!, from: owned.from, to: eq.where })
    return true
  }

  private reforged(item: PlayerItem, where: string, fromPrefix: number, reason: ReforgedItem['reason']): void {
    const r: ReforgedItem = { item: this.view(item)!, where, fromPrefix, reason }
    const name = fromPrefix ? prefixById(fromPrefix)?.name : undefined
    if (name) r.fromPrefixName = name
    this.preview.reforged.push(r)
  }

  /** An inventory or storage slot with a matching item that the loadout didn't write. */
  private findOwnedSlot(test: (it: PlayerItem) => boolean): { list: PlayerItem[]; index: number; label: string } | undefined {
    const areas: Area[] = [
      { label: 'Inventory', list: this.p.inventory, start: HOTBAR.start, end: MAIN.end },
      ...STORAGE_NAMES.map((n) => this.bank(n)),
    ]
    for (const area of areas) {
      for (let i = area.start; i <= area.end; i++) {
        const it = area.list[i]!
        if (it.netId === 0 || this.written.has(it) || !test(it)) continue
        const label = area.list === this.p.inventory ? (i <= HOTBAR.end ? 'Hotbar' : 'Inventory') : area.label
        return { list: area.list, index: i, label }
      }
    }
    return undefined
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
    const placed: { area: Area; index: number }[] = []
    let left = item.stack
    for (const area of mergeAreas) left = this.mergeInto(area, item, left, placed)
    for (const area of emptyAreas) left = this.fillEmpty(area, item, left, placed)
    return left > 0 ? null : placed
  }

  /**
   * Like place(), but finishes one area (top up its stacks, then its empty
   * slots) before moving on to the next.
   */
  private placeInOrder(item: PlayerItem, areas: Area[]): { area: Area; index: number }[] | null {
    const placed: { area: Area; index: number }[] = []
    let left = item.stack
    for (const area of areas) {
      left = this.mergeInto(area, item, left, placed)
      left = this.fillEmpty(area, item, left, placed)
    }
    return left > 0 ? null : placed
  }

  private maxStack(item: PlayerItem): number {
    const record = itemById(item.netId)
    return record ? maxStackFor(record).max : 1
  }

  private mergeInto(area: Area, item: PlayerItem, left: number, placed: { area: Area; index: number }[]): number {
    const max = this.maxStack(item)
    if (max === 1) return left
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
    return left
  }

  private fillEmpty(area: Area, item: PlayerItem, left: number, placed: { area: Area; index: number }[]): number {
    const max = this.maxStack(item)
    // The file stores favorites for the inventory and the Void Vault only.
    const keepsFavorite = area.list === this.p.inventory || area.list === this.p.bank4
    for (let i = area.start; i <= area.end && left > 0; i++) {
      if (area.list[i]!.netId !== 0) continue
      const stack = Math.min(left, max)
      const next = { ...item, stack, favorited: item.favorited && keepsFavorite }
      area.list[i] = next
      left -= stack
      this.preview.changes.push({ area: area.label, slot: i + 1, before: null, after: this.view(next) })
      placed.push({ area, index: i })
    }
    return left
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
          this.put(list, ACCESSORY.start + k, `${label} accessories`, e ? { ...this.make(e, 1), favorited: false } : emptyItem(), e)
        }
      }
    }
  }

  private weapons(): void {
    const weapons = this.r.weapons
    if (!weapons) return
    weapons.forEach((e, i) => {
      // A single weapon the character owns is moved into place (see reuseOwned).
      const single = maxStackFor(e.item).max === 1
      this.put(this.p.inventory, HOTBAR.start + i, 'Hotbar', this.make(e), single ? e : undefined)
      if (single) return
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

  /**
   * Storage contents. In "add" mode, items that don't fit in the chosen space
   * go to the next space with room (piggy bank, safe, forge, vault order,
   * skipping the chosen one and any space in "replace" mode), and the preview
   * lists them. It only blocks when every space is full.
   */
  private storage(): void {
    for (const name of STORAGE_NAMES) {
      const space = this.r.storage[name]
      if (!space) continue
      const area = this.bank(name)
      const others = STORAGE_NAMES.filter((n) => n !== name && this.r.storage[n]?.mode !== 'replace').map((n) => this.bank(n))
      for (const e of space.items) {
        const item = this.make(e)
        const placed = this.placeInOrder(item, space.mode === 'add' ? [area, ...others] : [area])
        if (!placed) {
          this.noRoom(space.mode === 'add' ? 'every storage space is full' : `${STORAGE_LABEL[name]} is full`, item, e.path)
          continue
        }
        this.preview.added.push(this.view(item)!)
        const labels = [...new Set(placed.map((pl) => pl.area.label))]
        if (labels.some((l) => l !== area.label)) {
          this.preview.redirected.push({ item: this.view(item)!, wanted: area.label, to: labels.join(', '), path: e.path })
        }
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
    if (e.prefixGiven) for (const pl of placed) this.explicit.add(pl.area.list[pl.index]!)
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
        const swapped = { ...a, favorited: a.favorited && keepsFavorite }
        if (this.explicit.has(a)) this.explicit.add(swapped)
        source.list[source.index] = swapped
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

  /**
   * The best_modifiers option: every weapon and accessory the character owns
   * (inventory, storage, all three loadouts, vanity slots included) gets the
   * best modifier for its type in this save version. Game updates can reset
   * or downgrade modifiers on items a loadout never mentions, so this covers
   * everything. Modifiers the loadout named are kept. Each change is listed
   * in preview.reforged.
   */
  private bestModifiers(): void {
    const v = this.p.version
    const areas: { label: string; list: PlayerItem[]; slotLabel?: (i: number) => string }[] = [
      { label: 'Inventory', list: this.p.inventory, slotLabel: (i) => (i <= HOTBAR.end ? 'Hotbar' : 'Inventory') },
      ...STORAGE_NAMES.map((n) => ({ label: STORAGE_LABEL[n], list: this.p[STORAGE_FIELD[n]] })),
      ...([1, 2, 3] as const).map((n) => ({ label: `Loadout ${n} equipment`, list: loadoutArmor(this.p, n) })),
    ]
    const unknown = new Set<string>()
    for (const area of areas) {
      area.list.forEach((it, i) => {
        if (it.netId === 0 || it.stack !== 1 || this.explicit.has(it)) return
        const record = itemById(it.netId)
        if (!record) return
        const best = bestPrefixFor(record, v)
        if (best === undefined) {
          // A modifier on an item with no rule means a weapon type we don't know yet.
          if (it.prefix !== 0 && itemKind(record, v).kind === 'other') unknown.add(record.name)
          return
        }
        if (maxStackFor(record).max !== 1 || it.prefix === best) return
        const where = area.slotLabel?.(i) ?? area.label
        const before = this.view(it)
        const from = it.prefix
        it.prefix = best
        this.preview.changes.push({ area: where, slot: i + 1, before, after: this.view(it) })
        this.reforged(it, where, from, 'best')
      })
    }
    if (unknown.size > 0) {
      this.warnings.push({
        severity: 'warning',
        path: 'best_modifiers',
        message: `Not reforged, because Loadsmith doesn't know their weapon type yet: ${[...unknown].sort().join(', ')}.`,
      })
    }
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
