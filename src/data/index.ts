export * from './types.ts'
export * from './versions.ts'
export { normalizeName, similarity, suggest, type Suggestion } from './fuzzy.ts'
export { ITEMS, displayName, itemById, itemByKey, itemExistsIn, lookupItem, type ItemLookup } from './items.ts'
export {
  PREFIXES,
  allowedPrefixIds,
  checkPrefix,
  itemKind,
  lookupPrefix,
  prefixById,
  prefixCategory,
  type ItemKind,
  type PrefixCategory,
  type PrefixCheck,
  type PrefixLookup,
} from './prefixes.ts'
export { MAX_STACK, checkStack, maxStackFor, type StackBasis, type StackCheck, type StackLimit } from './stacks.ts'
export { THROWN_CONSUMABLES, WEAPON_CLASSES, weaponClassOf, type WeaponClass } from './weapons.ts'
export { RESEARCH_UNVERIFIED, fullResearch, researchAmount, type ResearchAmount } from './research.ts'
export { ALIAS_RULES, appliesTo, type VersionRange } from './rules/index.ts'
