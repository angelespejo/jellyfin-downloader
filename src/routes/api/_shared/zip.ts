import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { finished } from 'node:stream/promises'

export interface ZipFileEntry {
  name: string
  path: string
}

export interface ZipEntry {
  name: string
  data: Buffer | string
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function safeEntryName(name: string, used: Set<string>): string {
  const cleaned = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\/+/, '')
    .slice(0, 240)
  const base = cleaned || 'file'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const extension = dot > 0 ? base.slice(dot) : ''
  let counter = 2
  while (used.has(`${stem} (${counter})${extension}`)) counter += 1
  const unique = `${stem} (${counter})${extension}`
  used.add(unique)
  return unique
}

export function createZip(entries: ZipEntry[]): Buffer {
  const now = new Date()
  const stamp = dosDateTime(now)
  const used = new Set<string>()
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = safeEntryName(entry.name, used)
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const nameBuffer = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)

    localParts.push(local, nameBuffer, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(stamp.time, 12)
    central.writeUInt16LE(stamp.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)

    centralParts.push(central, nameBuffer)
    offset += local.length + nameBuffer.length + data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, end])
}

const ZIP64_LIMIT = 0xffffffff

function zip64Extra(size: number, offset: number, needSize: boolean, needOffset: boolean): Buffer {
  const parts: Buffer[] = []
  let length = 0
  if (needSize) {
    const buffer = Buffer.alloc(16)
    buffer.writeBigUInt64LE(BigInt(size), 0)
    buffer.writeBigUInt64LE(BigInt(size), 8)
    parts.push(buffer)
    length += 16
  }
  if (needOffset) {
    const buffer = Buffer.alloc(8)
    buffer.writeBigUInt64LE(BigInt(offset), 0)
    parts.push(buffer)
    length += 8
  }
  if (length === 0) return Buffer.alloc(0)
  const header = Buffer.alloc(4)
  header.writeUInt16LE(0x0001, 0)
  header.writeUInt16LE(length, 2)
  return Buffer.concat([header, ...parts])
}

function writeChunk(stream: NodeJS.WritableStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error?: Error | null) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export async function writeZipFile(entries: ZipFileEntry[], outputPath: string): Promise<void> {
  const stream = createWriteStream(outputPath, { flags: 'wx' })
  const used = new Set<string>()
  const stamp = dosDateTime(new Date())
  const centralRecords: {
    name: Buffer
    crc: number
    size: number
    localOffset: number
    zip64Size: boolean
  }[] = []
  let offset = 0
  let failed: unknown = null

  try {
    for (const entry of entries) {
      const name = safeEntryName(entry.name, used)
      const nameBuffer = Buffer.from(name, 'utf8')
      const info = await stat(entry.path)
      if (!info.isFile()) throw new Error(`El archivo a comprimir no existe: ${entry.name}`)
      const size = info.size
      const zip64Size = size >= ZIP64_LIMIT
      const localOffset = offset
      const extra = zip64Extra(size, 0, zip64Size, false)

      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(zip64Size ? 45 : 20, 4)
      local.writeUInt16LE(0x0800 | 0x0008, 6)
      local.writeUInt16LE(0, 8)
      local.writeUInt16LE(stamp.time, 10)
      local.writeUInt16LE(stamp.date, 12)
      local.writeUInt32LE(0, 14)
      local.writeUInt32LE(zip64Size ? 0xffffffff : 0, 18)
      local.writeUInt32LE(zip64Size ? 0xffffffff : 0, 22)
      local.writeUInt16LE(nameBuffer.length, 26)
      local.writeUInt16LE(extra.length, 28)
      await writeChunk(stream, local)
      await writeChunk(stream, nameBuffer)
      if (extra.length) await writeChunk(stream, extra)
      offset += local.length + nameBuffer.length + extra.length

      let crc = 0xffffffff
      let bytesRead = 0
      for await (const chunk of createReadStream(entry.path)) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytesRead += buffer.length
        for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
        await writeChunk(stream, buffer)
      }
      crc = (crc ^ 0xffffffff) >>> 0
      offset += bytesRead

      const descriptor = Buffer.alloc(zip64Size ? 24 : 16)
      descriptor.writeUInt32LE(0x08074b50, 0)
      descriptor.writeUInt32LE(crc, 4)
      if (zip64Size) {
        descriptor.writeBigUInt64LE(BigInt(bytesRead), 8)
        descriptor.writeBigUInt64LE(BigInt(bytesRead), 16)
      } else {
        descriptor.writeUInt32LE(bytesRead, 8)
        descriptor.writeUInt32LE(bytesRead, 12)
      }
      await writeChunk(stream, descriptor)
      offset += descriptor.length

      centralRecords.push({ name: nameBuffer, crc, size: bytesRead, localOffset, zip64Size })
    }

    const centralOffset = offset
    for (const record of centralRecords) {
      const needOffset = record.localOffset >= ZIP64_LIMIT
      const needSize = record.zip64Size || record.size >= ZIP64_LIMIT
      const extra = zip64Extra(record.size, record.localOffset, needSize, needOffset)
      const version = needSize || needOffset ? 45 : 20
      const header = Buffer.alloc(46)
      header.writeUInt32LE(0x02014b50, 0)
      header.writeUInt16LE(version, 4)
      header.writeUInt16LE(version, 6)
      header.writeUInt16LE(0x0800 | 0x0008, 8)
      header.writeUInt16LE(0, 10)
      header.writeUInt16LE(stamp.time, 12)
      header.writeUInt16LE(stamp.date, 14)
      header.writeUInt32LE(record.crc, 16)
      header.writeUInt32LE(needSize ? 0xffffffff : record.size, 20)
      header.writeUInt32LE(needSize ? 0xffffffff : record.size, 24)
      header.writeUInt16LE(record.name.length, 28)
      header.writeUInt16LE(extra.length, 30)
      header.writeUInt16LE(0, 32)
      header.writeUInt16LE(0, 34)
      header.writeUInt16LE(0, 36)
      header.writeUInt32LE(0, 38)
      header.writeUInt32LE(needOffset ? 0xffffffff : record.localOffset, 42)
      await writeChunk(stream, header)
      await writeChunk(stream, record.name)
      if (extra.length) await writeChunk(stream, extra)
      offset += header.length + record.name.length + extra.length
    }

    const centralSize = offset - centralOffset
    const needZip64Eocd =
      centralRecords.length > 0xffff || centralOffset >= ZIP64_LIMIT || centralSize >= ZIP64_LIMIT
    if (needZip64Eocd) {
      const zip64Offset = offset
      const zip64 = Buffer.alloc(56)
      zip64.writeUInt32LE(0x06064b50, 0)
      zip64.writeBigUInt64LE(44n, 4)
      zip64.writeUInt16LE(45, 12)
      zip64.writeUInt16LE(45, 14)
      zip64.writeUInt32LE(0, 16)
      zip64.writeUInt32LE(0, 20)
      zip64.writeBigUInt64LE(BigInt(centralRecords.length), 24)
      zip64.writeBigUInt64LE(BigInt(centralRecords.length), 32)
      zip64.writeBigUInt64LE(BigInt(centralSize), 40)
      zip64.writeBigUInt64LE(BigInt(centralOffset), 48)
      await writeChunk(stream, zip64)
      offset += zip64.length

      const locator = Buffer.alloc(20)
      locator.writeUInt32LE(0x07064b50, 0)
      locator.writeUInt32LE(0, 4)
      locator.writeBigUInt64LE(BigInt(zip64Offset), 8)
      locator.writeUInt32LE(1, 16)
      await writeChunk(stream, locator)
      offset += locator.length
    }

    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(needZip64Eocd ? 0xffff : centralRecords.length, 8)
    end.writeUInt16LE(needZip64Eocd ? 0xffff : centralRecords.length, 10)
    end.writeUInt32LE(needZip64Eocd ? 0xffffffff : centralSize, 12)
    end.writeUInt32LE(needZip64Eocd ? 0xffffffff : centralOffset, 16)
    end.writeUInt16LE(0, 20)
    await writeChunk(stream, end)
    stream.end()
    await finished(stream)
  } catch (error) {
    failed = error
    stream.destroy()
    throw error
  } finally {
    if (failed) stream.destroy()
  }
}
