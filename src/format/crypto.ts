// Terraria .plr encryption: AES-128-CBC, key = IV = UTF-16LE bytes of
// "h3y_gUyZ", PKCS7 padding. Uses Web Crypto (browser and Node 20+).
// Note: TEdit encrypts with zero padding; real Terraria files use PKCS7,
// so this follows the game, which is what makes byte-for-byte round trips work.

import { FormatError } from './binary.ts'

const KEY_STRING = 'h3y_gUyZ'

/** UTF-16LE bytes of the key string (16 bytes). */
export function plrKeyBytes(): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(KEY_STRING.length * 2)
  for (let i = 0; i < KEY_STRING.length; i++) {
    const c = KEY_STRING.charCodeAt(i)
    out[i * 2] = c & 0xff
    out[i * 2 + 1] = c >> 8
  }
  return out
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('Web Crypto is not available in this environment.')
  return s
}

async function importKey(usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return subtle().importKey('raw', plrKeyBytes(), { name: 'AES-CBC' }, false, [usage])
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

export async function decryptPlr(encrypted: Uint8Array): Promise<Uint8Array> {
  if (encrypted.byteLength === 0 || encrypted.byteLength % 16 !== 0) {
    throw new FormatError('Not a Terraria character file: size is not a multiple of 16 bytes.')
  }
  try {
    const key = await importKey('decrypt')
    const out = await subtle().decrypt({ name: 'AES-CBC', iv: plrKeyBytes() }, key, copy(encrypted))
    return new Uint8Array(out)
  } catch {
    throw new FormatError('Not a Terraria character file: decryption failed.')
  }
}

export async function encryptPlr(plain: Uint8Array): Promise<Uint8Array> {
  const key = await importKey('encrypt')
  const out = await subtle().encrypt({ name: 'AES-CBC', iv: plrKeyBytes() }, key, copy(plain))
  return new Uint8Array(out)
}
