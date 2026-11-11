// Little-endian binary reader and writer with the same wire format as .NET's
// System.IO.BinaryReader / BinaryWriter (UTF-8 strings with a 7-bit encoded
// length prefix). Loadsmith's own code, not ported from TEdit.

export class FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormatError'
  }
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

export class BinaryReader {
  private readonly view: DataView
  private readonly bytes: Uint8Array
  private pos = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get position(): number {
    return this.pos
  }

  get length(): number {
    return this.bytes.byteLength
  }

  get remaining(): number {
    return this.bytes.byteLength - this.pos
  }

  private take(n: number): number {
    if (this.pos + n > this.bytes.byteLength) {
      throw new FormatError(
        `Unexpected end of data: needed ${n} byte(s) at offset ${this.pos}, file has ${this.bytes.byteLength}.`,
      )
    }
    const at = this.pos
    this.pos += n
    return at
  }

  readByte(): number {
    return this.view.getUint8(this.take(1))
  }

  /** .NET ReadBoolean: any non-zero byte is true. */
  readBoolean(): boolean {
    return this.readByte() !== 0
  }

  readInt16(): number {
    return this.view.getInt16(this.take(2), true)
  }

  readUInt16(): number {
    return this.view.getUint16(this.take(2), true)
  }

  readInt32(): number {
    return this.view.getInt32(this.take(4), true)
  }

  readUInt32(): number {
    return this.view.getUint32(this.take(4), true)
  }

  readInt64(): bigint {
    return this.view.getBigInt64(this.take(8), true)
  }

  readUInt64(): bigint {
    return this.view.getBigUint64(this.take(8), true)
  }

  readSingle(): number {
    return this.view.getFloat32(this.take(4), true)
  }

  readBytes(n: number): Uint8Array {
    const at = this.take(n)
    return this.bytes.slice(at, at + n)
  }

  /** .NET Read7BitEncodedInt. */
  read7BitEncodedInt(): number {
    let result = 0
    for (let shift = 0; shift < 35; shift += 7) {
      const b = this.readByte()
      result |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) return result
    }
    throw new FormatError('Bad 7-bit encoded length.')
  }

  readString(): string {
    const at = this.pos
    const len = this.read7BitEncodedInt()
    if (len < 0) throw new FormatError(`Negative string length at offset ${at}.`)
    const raw = this.readBytes(len)
    try {
      return utf8Decoder.decode(raw)
    } catch {
      throw new FormatError(`Invalid UTF-8 string at offset ${at}.`)
    }
  }
}

export class BinaryWriter {
  private buf: Uint8Array
  private view: DataView
  private pos = 0

  constructor(initialCapacity = 4096) {
    this.buf = new Uint8Array(initialCapacity)
    this.view = new DataView(this.buf.buffer)
  }

  get length(): number {
    return this.pos
  }

  private reserve(n: number): number {
    if (this.pos + n > this.buf.byteLength) {
      let cap = this.buf.byteLength * 2
      while (cap < this.pos + n) cap *= 2
      const next = new Uint8Array(cap)
      next.set(this.buf.subarray(0, this.pos))
      this.buf = next
      this.view = new DataView(next.buffer)
    }
    const at = this.pos
    this.pos += n
    return at
  }

  writeByte(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new RangeError(`Byte out of range: ${v}`)
    const at = this.reserve(1)
    this.view.setUint8(at, v)
  }

  writeBoolean(v: boolean): void {
    this.writeByte(v ? 1 : 0)
  }

  writeInt16(v: number): void {
    checkInt(v, -0x8000, 0x7fff, 'Int16')
    const at = this.reserve(2)
    this.view.setInt16(at, v, true)
  }

  writeUInt16(v: number): void {
    checkInt(v, 0, 0xffff, 'UInt16')
    const at = this.reserve(2)
    this.view.setUint16(at, v, true)
  }

  writeInt32(v: number): void {
    checkInt(v, -0x80000000, 0x7fffffff, 'Int32')
    const at = this.reserve(4)
    this.view.setInt32(at, v, true)
  }

  writeUInt32(v: number): void {
    checkInt(v, 0, 0xffffffff, 'UInt32')
    const at = this.reserve(4)
    this.view.setUint32(at, v, true)
  }

  writeInt64(v: bigint): void {
    const at = this.reserve(8)
    this.view.setBigInt64(at, v, true)
  }

  writeUInt64(v: bigint): void {
    const at = this.reserve(8)
    this.view.setBigUint64(at, v, true)
  }

  writeSingle(v: number): void {
    const at = this.reserve(4)
    this.view.setFloat32(at, v, true)
  }

  writeBytes(bytes: Uint8Array): void {
    const at = this.reserve(bytes.byteLength)
    this.buf.set(bytes, at)
  }

  /** .NET Write7BitEncodedInt. */
  write7BitEncodedInt(v: number): void {
    let n = v >>> 0
    while (n >= 0x80) {
      this.writeByte((n & 0x7f) | 0x80)
      n >>>= 7
    }
    this.writeByte(n)
  }

  writeString(s: string): void {
    const raw = utf8Encoder.encode(s)
    this.write7BitEncodedInt(raw.byteLength)
    this.writeBytes(raw)
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.pos)
  }
}

function checkInt(v: number, min: number, max: number, kind: string): void {
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(`${kind} out of range: ${v}`)
}
