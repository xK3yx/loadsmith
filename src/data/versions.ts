// Save-version facts: which versions Loadsmith supports, and the highest item
// and modifier IDs each one knows. Item limits come from TEdit's
// versions.json; modifier limits are ours (TEdit has none).

import { PREFIX_RULES, appliesTo } from './rules/index.ts'
import versionsJson from './tedit/versions.json'
import type { VersionsRecord } from './types.ts'

const versions = versionsJson as VersionsRecord

export const MIN_SUPPORTED_VERSION = 279 // 1.4.4.9
export const MAX_SUPPORTED_VERSION = 326 // 1.4.5.8
/** First 1.4.5 save version (1.4.5.0). */
export const FIRST_145_VERSION = 315

/** Released save versions from 1.4.4.9 to 1.4.5.8 (280-314 never shipped). */
export const SUPPORTED_VERSIONS: readonly number[] = [
  ...new Set(
    Object.values(versions.gameToSave).filter((v) => v >= MIN_SUPPORTED_VERSION && v <= MAX_SUPPORTED_VERSION),
  ),
].sort((a, b) => a - b)

export function isSupportedVersion(saveVersion: number): boolean {
  return SUPPORTED_VERSIONS.includes(saveVersion)
}

function requireSupported(saveVersion: number): void {
  if (!isSupportedVersion(saveVersion)) {
    throw new RangeError(`Save version ${saveVersion} is not supported (supported: ${SUPPORTED_VERSIONS.join(', ')}).`)
  }
}

/** Highest item ID that exists in this save version (inclusive). */
export function maxItemId(saveVersion: number): number {
  requireSupported(saveVersion)
  const rows = versions.saveVersions.filter((s) => s.saveVersion === saveVersion)
  if (rows.length === 0) throw new RangeError(`versions.json has no entry for save version ${saveVersion}.`)
  return Math.max(...rows.map((r) => r.maxItemId))
}

/**
 * Highest modifier (prefix) ID this save version knows, from
 * rules/prefix-groups.json. IDs 85-97 are the 1.4.5 summon modifiers.
 */
export function maxPrefixId(saveVersion: number): number {
  requireSupported(saveVersion)
  const rule = PREFIX_RULES.maxPrefixId.find((r) => appliesTo(r, saveVersion))
  if (!rule) throw new RangeError(`prefix-groups.json has no maxPrefixId for save version ${saveVersion}.`)
  return rule.max
}

/** Game versions that write this save version, e.g. 315 -> ["1.4.5.0", "1.4.5.1", "1.4.5.2"]. */
export function gameVersionsFor(saveVersion: number): string[] {
  return Object.entries(versions.gameToSave)
    .filter(([, v]) => v === saveVersion)
    .map(([g]) => g)
}

/** Save version for a game version string such as "1.4.5.8", or undefined. */
export function saveVersionFor(gameVersion: string): number | undefined {
  return versions.gameToSave[gameVersion.trim().replace(/^v/i, '')]
}
