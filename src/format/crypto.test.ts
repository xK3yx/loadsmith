import { describe, expect, it } from 'vitest'
import { FormatError } from './binary.ts'
import { decryptPlr, encryptPlr, plrKeyBytes } from './crypto.ts'

describe('plr encryption', () => {
  it('uses the UTF-16LE bytes of h3y_gUyZ as the key', () => {
    expect([...plrKeyBytes()]).toEqual([0x68, 0, 0x33, 0, 0x79, 0, 0x5f, 0, 0x67, 0, 0x55, 0, 0x79, 0, 0x5a, 0])
  })

  it('round-trips data of every padding length', async () => {
    for (let len = 0; len <= 33; len++) {
      const plain = Uint8Array.from({ length: len }, (_, i) => (i * 37) & 0xff)
      const enc = await encryptPlr(plain)
      // PKCS7 always adds 1..16 bytes.
      expect(enc.byteLength).toBe((Math.floor(len / 16) + 1) * 16)
      expect([...(await decryptPlr(enc))]).toEqual([...plain])
    }
  })

  it('is deterministic (fixed key and IV)', async () => {
    const plain = new TextEncoder().encode('loadsmith')
    expect([...(await encryptPlr(plain))]).toEqual([...(await encryptPlr(plain))])
  })

  it('rejects files that are not a multiple of 16 bytes', async () => {
    await expect(decryptPlr(new Uint8Array(15))).rejects.toThrow(FormatError)
    await expect(decryptPlr(new Uint8Array(0))).rejects.toThrow(FormatError)
  })

  it('rejects data with bad padding', async () => {
    const enc = await encryptPlr(new Uint8Array(16))
    enc[enc.byteLength - 1]! ^= 0xff
    await expect(decryptPlr(enc)).rejects.toThrow(FormatError)
  })
})
