// Building the new .plr for download, and where players put it.

import { type PlayerCharacter, loadPlayer, savePlayer, serializePlayer } from '../../format/index.ts'
import type { ItemView } from '../../loadout/index.ts'

export type PreparedFile = { ok: true; bytes: Uint8Array } | { ok: false; message: string }

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Encrypts the edited character, then reads the result back and checks it
 * holds exactly what was written. A file that fails this is never offered.
 */
export async function prepareDownload(character: PlayerCharacter): Promise<PreparedFile> {
  const failed = {
    ok: false as const,
    message: "Loadsmith couldn't build a file it could read back, so it won't offer one. Your original file is unchanged.",
  }
  try {
    const bytes = await savePlayer(character)
    const reread = await loadPlayer(bytes)
    return sameBytes(serializePlayer(reread), serializePlayer(character)) ? { ok: true, bytes } : failed
  } catch {
    return failed
  }
}

/** Keeps the original file name, so the new file replaces the character once copied in. */
export function downloadName(originalName: string | undefined, characterName: string): string {
  if (originalName && /\.plr$/i.test(originalName)) return originalName.replace(/^.*[\\/]/, '')
  const safe =
    [...characterName]
      .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
      .join('')
      .trim() || 'character'
  return `${safe}.plr`
}

export const PLAYERS_FOLDERS: { system: string; path: string }[] = [
  { system: 'Windows', path: 'Documents\\My Games\\Terraria\\Players' },
  { system: 'Mac', path: '~/Library/Application Support/Terraria/Players' },
  { system: 'Linux', path: '~/.local/share/Terraria/Players' },
  { system: 'Steam Cloud', path: 'Steam\\userdata\\<your Steam ID>\\105600\\remote\\players' },
]

/** "Menacing Celestial Starboard", "Torch ×99". */
export function viewLabel(v: ItemView): string {
  return `${v.prefixName ? `${v.prefixName} ` : ''}${v.name}${v.stack > 1 ? ` ×${v.stack}` : ''}`
}
