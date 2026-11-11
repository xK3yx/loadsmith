// Shapes of the generated files in src/data/tedit/ (written by `npm run sync-data`).

export interface ItemRecord {
  id: number
  name: string
  /** TEdit's internal item name (Terraria's ItemID field name). Stable across renames. */
  key?: string
  /** TEdit's maxStackSize. Unreliable: 9999 for almost everything. See stacks.ts. */
  maxStack: number
  accessory?: true
  armor?: 'head' | 'body' | 'legs'
  rackable?: true
  mount?: true
  food?: true
  /** Wings (TEdit has a wingSlot). Only one pair can be equipped at a time. */
  wings?: true
  /** Places a tile or wall. */
  placeable?: true
}

export interface PrefixRecord {
  id: number
  name: string
  key: string
}

export interface VersionsRecord {
  gameToSave: Record<string, number>
  saveVersions: { saveVersion: number; gameVersion: string; maxItemId: number }[]
}
