import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createZip, writeZipFile } from '#api/_shared/zip.ts'

test('createZip builds a basic ZIP with unique names', () => {
  const data = createZip([
    { name: 'Movie.en.srt', data: 'hola' },
    { name: '../Movie.en.srt', data: 'mundo' },
  ])
  assert.equal(data.readUInt32LE(0), 0x04034b50)
  assert.ok(data.includes(Buffer.from('Movie.en.srt')))
  assert.ok(data.includes(Buffer.from(' (2).srt')))
})

test('writeZipFile writes a valid readable ZIP', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jf-zip-test-'))
  try {
    const first = path.join(directory, 'video.mkv')
    const second = path.join(directory, 'audio.m4a')
    await writeFile(first, Buffer.alloc(2048, 7))
    await writeFile(second, Buffer.alloc(1024, 3))
    const zip = path.join(directory, 'result.zip')
    await writeZipFile(
      [
        { name: 'video.mkv', path: first },
        { name: 'audio-eng-1.m4a', path: second },
      ],
      zip
    )
    const info = await readFile(zip)
    assert.equal(info.readUInt32LE(0), 0x04034b50)
    assert.ok(info.includes(Buffer.from('video.mkv')))
    assert.ok(info.includes(Buffer.from('audio-eng-1.m4a')))
    assert.ok(info.includes(Buffer.from('PK\u0005\u0006', 'binary')))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('generated ZIP passes unzip -t when available', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jf-zip-unzip-'))
  try {
    const file = path.join(directory, 'sub.srt')
    await writeFile(file, '1\n00:00:00,000 --> 00:00:01,000\nHola\n')
    const zip = path.join(directory, 'test.zip')
    await writeZipFile([{ name: 'sub.srt', path: file }], zip)
    const unzip = spawnSync('unzip', ['-t', zip], { encoding: 'utf8' })
    if (!unzip.error && unzip.status !== null) {
      assert.equal(unzip.status, 0, unzip.stdout + unzip.stderr)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
