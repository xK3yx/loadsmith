import { describe, expect, it } from 'vitest'
import { BinaryReader, BinaryWriter, FormatError } from './binary.ts'

describe('BinaryReader / BinaryWriter', () => {
  it('round-trips every primitive little-endian', () => {
    const w = new BinaryWriter(4) // small, forces growth
    w.writeByte(0xab)
    w.writeBoolean(true)
    w.writeBoolean(false)
    w.writeInt16(-2)
    w.writeUInt16(0xfffe)
    w.writeInt32(-123456789)
    w.writeUInt32(0xdeadbeef)
    w.writeInt64(-5_000_000_000_000n)
    w.writeUInt64(0xff00_0000_0000_0001n)
    w.writeSingle(0.1)
    const bytes = w.toBytes()
    expect(bytes.byteLength).toBe(1 + 1 + 1 + 2 + 2 + 4 + 4 + 8 + 8 + 4)
    // -123456789 = 0xF8A432EB, little-endian
    expect([...bytes.subarray(7, 11)]).toEqual([0xeb, 0x32, 0xa4, 0xf8])

    const r = new BinaryReader(bytes)
    expect(r.readByte()).toBe(0xab)
    expect(r.readBoolean()).toBe(true)
    expect(r.readBoolean()).toBe(false)
    expect(r.readInt16()).toBe(-2)
    expect(r.readUInt16()).toBe(0xfffe)
    expect(r.readInt32()).toBe(-123456789)
    expect(r.readUInt32()).toBe(0xdeadbeef)
    expect(r.readInt64()).toBe(-5_000_000_000_000n)
    expect(r.readUInt64()).toBe(0xff00_0000_0000_0001n)
    expect(r.readSingle()).toBe(Math.fround(0.1))
    expect(r.remaining).toBe(0)
  })

  it('treats any non-zero byte as true, like .NET', () => {
    expect(new BinaryReader(new Uint8Array([2])).readBoolean()).toBe(true)
  })

  it('writes .NET 7-bit length-prefixed UTF-8 strings', () => {
    const w = new BinaryWriter()
    w.writeString('Key')
    expect([...w.toBytes()]).toEqual([3, 0x4b, 0x65, 0x79])

    const long = 'x'.repeat(200)
    const w2 = new BinaryWriter()
    w2.writeString(long)
    expect([...w2.toBytes().subarray(0, 2)]).toEqual([0xc8, 0x01])
    expect(new BinaryReader(w2.toBytes()).readString()).toBe(long)
  })

  it('round-trips multi-byte UTF-8 names', () => {
    for (const s of ['', 'Ünïcødé', '名前テスト', '🗡️ Zenith']) {
      const w = new BinaryWriter()
      w.writeString(s)
      const r = new BinaryReader(w.toBytes())
      expect(r.readString()).toBe(s)
      expect(r.remaining).toBe(0)
    }
  })

  it('rejects invalid UTF-8', () => {
    expect(() => new BinaryReader(new Uint8Array([2, 0xc3, 0x28])).readString()).toThrow(FormatError)
  })

  it('throws FormatError when reading past the end', () => {
    const r = new BinaryReader(new Uint8Array([1, 2, 3]))
    expect(() => r.readInt32()).toThrow(FormatError)
  })

  it('rejects out-of-range writes instead of wrapping', () => {
    const w = new BinaryWriter()
    expect(() => w.writeByte(256)).toThrow(RangeError)
    expect(() => w.writeInt32(2 ** 31)).toThrow(RangeError)
    expect(() => w.writeUInt32(-1)).toThrow(RangeError)
    expect(() => w.writeInt32(1.5)).toThrow(RangeError)
  })
})

describe('BinaryWriter growth', () => {
  it('keeps every byte when strings and raw bytes force the buffer to grow', () => {
    const w = new BinaryWriter(1)
    const names = Array.from({ length: 50 }, (_, i) => `world-${i}-${'é'.repeat(i)}`)
    for (const n of names) w.writeString(n)
    w.writeBytes(new Uint8Array(300).fill(7))
    const r = new BinaryReader(w.toBytes())
    for (const n of names) expect(r.readString()).toBe(n)
    expect([...r.readBytes(300)].every((b) => b === 7)).toBe(true)
    expect(r.remaining).toBe(0)
  })
})
