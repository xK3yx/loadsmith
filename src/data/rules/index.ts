// Loads the hand-made rule tables in this folder and validates them with zod.
// Rules are data, not code: an update usually means editing these JSON files.
// Any entry may carry `since` and/or `until` (inclusive save versions) to
// limit it to some versions.

import { z } from 'zod'
import aliasesJson from './aliases.json'
import bestPrefixesJson from './best-prefixes.json'
import prefixGroupsJson from './prefix-groups.json'
import researchJson from './research.json'
import researchOverridesJson from './research-overrides.json'
import stacksJson from './stacks.json'
import thrownJson from './thrown.json'
import weaponClassesJson from './weapon-classes.json'

const version = z.number().int().positive()
const Versioned = { since: version.optional(), until: version.optional() }

export interface VersionRange {
  since?: number
  until?: number
}

/** Whether a version-tagged entry applies to a save version. */
export function appliesTo(entry: VersionRange, saveVersion: number): boolean {
  return (entry.since === undefined || saveVersion >= entry.since) && (entry.until === undefined || saveVersion <= entry.until)
}

export const WEAPON_CLASS_NAMES = ['melee', 'whip', 'melee-universal', 'terrarian', 'ranged', 'magic', 'summon'] as const
export type WeaponClass = (typeof WEAPON_CLASS_NAMES)[number]

const PrefixGroupsSchema = z
  .looseObject({
    maxPrefixId: z.array(z.looseObject({ ...Versioned, max: z.number().int().positive() })).min(1),
    groups: z.record(z.string(), z.array(z.number().int().positive()).min(1)),
    classes: z.record(
      z.enum(WEAPON_CLASS_NAMES),
      z.array(z.looseObject({ ...Versioned, groups: z.array(z.string()).min(1) })).min(1),
    ),
  })
  .superRefine((v, ctx) => {
    for (const [cls, rules] of Object.entries(v.classes)) {
      for (const rule of rules) {
        for (const g of rule.groups) {
          if (!(g in v.groups)) ctx.addIssue({ code: 'custom', message: `class ${cls} uses unknown group ${g}` })
        }
      }
    }
    for (const cls of WEAPON_CLASS_NAMES) {
      if (!(cls in v.classes)) ctx.addIssue({ code: 'custom', message: `no modifier rule for class ${cls}` })
    }
  })

const WeaponClassesSchema = z.looseObject({
  weapons: z.array(z.looseObject({ ...Versioned, key: z.string().min(1), class: z.enum(WEAPON_CLASS_NAMES), name: z.string().optional() })),
})

const ThrownSchema = z.looseObject({
  items: z.array(z.looseObject({ key: z.string().min(1), name: z.string().optional() })),
})

const regex = z.string().refine((s) => {
  try {
    new RegExp(s)
    return true
  } catch {
    return false
  }
}, 'invalid regular expression')

const StacksSchema = z.looseObject({
  maxStack: z.number().int().positive(),
  coins: z.record(z.string(), z.number().int().positive()),
  stackableNamePattern: regex,
  safeStackable: z.looseObject({
    namePatterns: z.array(regex),
    items: z.array(z.looseObject({ key: z.string().min(1), name: z.string().optional() })),
  }),
})

const AliasesSchema = z.looseObject({
  duplicatePicks: z.record(z.string(), z.string().min(1)),
  ambiguous: z.array(z.string()),
  renamed: z.array(z.looseObject({ key: z.string().min(1), name: z.string().min(1), until: version })),
})

const BestPrefixesSchema = z
  .looseObject({
    best: z.record(
      z.enum([...WEAPON_CLASS_NAMES, 'accessory']),
      z.array(z.looseObject({ ...Versioned, prefix: z.number().int().positive(), name: z.string().optional() })).min(1),
    ),
  })
  .superRefine((v, ctx) => {
    for (const k of [...WEAPON_CLASS_NAMES, 'accessory']) {
      if (!(k in v.best)) ctx.addIssue({ code: 'custom', message: `no best modifier for ${k}` })
    }
  })

const ResearchEntry =z.looseObject({ ...Versioned, key: z.string().min(1), amount: z.number().int().positive() })
const ResearchSchema = z.looseObject({ source: z.string(), retrieved: z.string(), entries: z.array(ResearchEntry) })
const ResearchOverridesSchema = z.looseObject({ entries: z.array(ResearchEntry) })

export const PREFIX_RULES = PrefixGroupsSchema.parse(prefixGroupsJson)
export const BEST_PREFIX_RULES = BestPrefixesSchema.parse(bestPrefixesJson).best
export const WEAPON_RULES = WeaponClassesSchema.parse(weaponClassesJson).weapons
export const THROWN_RULES = ThrownSchema.parse(thrownJson).items
export const STACK_RULES = StacksSchema.parse(stacksJson)
export const ALIAS_RULES = AliasesSchema.parse(aliasesJson)
export const RESEARCH_RULES = ResearchSchema.parse(researchJson)
export const RESEARCH_OVERRIDES = ResearchOverridesSchema.parse(researchOverridesJson).entries
