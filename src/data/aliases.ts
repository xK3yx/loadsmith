// Hand-made name fixes, keyed by normalized name (see normalizeName).

/**
 * Names TEdit gives to more than one item. Each maps to the item a loadout
 * almost certainly means, by TEdit key. Names with no sensible default
 * (Deathweed Planter Box, Strange Plant, Constellation) stay ambiguous and
 * need an item ID.
 */
export const DUPLICATE_NAME_PICKS: Readonly<Record<string, string>> = {
  restorationpotion: 'RestorationPotion', // not LesserRestorationPotion (226)
  seaweed: 'Seaweed', // the pet item, not fishing junk (FishingSeaweed)
  princessdress: 'PrincessDressNew', // the current one
  junglekey: 'JungleKey', // not the mold
  corruptionkey: 'CorruptionKey',
  crimsonkey: 'CrimsonKey',
  hallowedkey: 'HallowedKey',
  frozenkey: 'FrozenKey',
  demonaltar: 'DemonAltar', // not the bestiary icon
  crimsonaltar: 'CrimsonAltar',
}

export const AMBIGUOUS_NAMES: ReadonlySet<string> = new Set(['deathweedplanterbox', 'strangeplant', 'constellation'])

/**
 * Names that meant a different item before 1.4.5. TEdit's names are current
 * (1.4.5), so a 1.4.4.9 loadout asking for "Flairon" means Duke Fishron's
 * flail (TEdit key Flairon, now displayed as "Flairoon"), not the new 1.4.5
 * item that took the name. Applies to saves older than 1.4.5.
 */
export const PRE_145_NAMES: Readonly<Record<string, { key: string; name: string }>> = {
  flairon: { key: 'Flairon', name: 'Flairon' },
}
