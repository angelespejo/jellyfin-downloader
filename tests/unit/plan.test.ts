import assert from 'node:assert/strict'
import test from 'node:test'
import type { SettingsDefaults } from '#lib/types.ts'
import type { InternalMediaSource } from '#api/_shared/media.ts'
import { buildPlan, disableHardwareInPlan, PlanError } from '#api/_shared/plan.ts'

const defaults: SettingsDefaults = {
  container: 'source',
  quality: 'original',
  videoCodec: 'copy',
  audioCodec: 'copy',
  audioSelection: 'all',
  audioPackaging: 'mux',
  subtitleSelection: 'all',
  subtitleStrategy: 'mirror-source',
}

const encoders = [
  'libx264',
  'libx265',
  'libvpx-vp9',
  'aac',
  'ac3',
  'eac3',
  'libopus',
  'flac',
  'libmp3lame',
]

const item = {
  Id: '11111111111111111111111111111111',
  Name: 'Test movie',
  ProductionYear: 2020,
  RunTimeTicks: 20 * 10_000_000,
}

function makeSource(overrides: Partial<InternalMediaSource> = {}): InternalMediaSource {
  return {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'Main',
    container: 'mkv',
    sizeBytes: 10_000_000,
    bitrate: 4_000_000,
    runtimeTicks: 20 * 10_000_000,
    etag: 'etag-1',
    path: '/fake/source.mkv',
    video: [
      {
        index: 0,
        codec: 'h264',
        width: 1920,
        height: 1080,
        bitrate: 3_000_000,
        isDefault: true,
        title: null,
        language: null,
      },
    ],
    audio: [
      {
        index: 1,
        codec: 'aac',
        channels: 2,
        bitrate: 192_000,
        language: 'eng',
        title: 'English',
        displayTitle: 'English · AAC',
        isDefault: true,
        isForced: false,
      },
    ],
    subtitles: [
      {
        index: 2,
        codec: 'subrip',
        format: 'srt',
        isExternal: false,
        isText: true,
        language: 'eng',
        title: 'English',
        displayTitle: 'English',
        isDefault: true,
        isForced: false,
        deliveryUrl: null,
        path: null,
      },
      {
        index: 3,
        codec: 'subrip',
        format: 'srt',
        isExternal: true,
        isText: true,
        language: 'spa',
        title: 'Spanish',
        displayTitle: 'Spanish',
        isDefault: false,
        isForced: false,
        deliveryUrl:
          '/Videos/11111111111111111111111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Subtitles/3/Stream.srt',
        path: null,
      },
    ],
    ...overrides,
  }
}

function plan(options = {}, source = makeSource()) {
  return buildPlan({
    item,
    source,
    options,
    defaults,
    environment: { ffmpegVersion: 'ffmpeg version 9.0.2', encoders, filters: ['subtitles'] },
  })
}

test('default mirrors the source: embedded integrated and external separate', () => {
  const result = plan()
  assert.equal(result.outputKind, 'zip')
  assert.equal(result.expectedFiles, 2)
  assert.equal(result.subtitles.find((subtitle) => subtitle.index === 2)?.packaging, 'mux')
  assert.equal(result.subtitles.find((subtitle) => subtitle.index === 3)?.packaging, 'separate')
  assert.ok(result.downloadName.endsWith('.zip'))
})

test('all integrated produces a single file', () => {
  const result = plan({ subtitleStrategy: 'muxed', audioPackaging: 'mux' })
  assert.equal(result.outputKind, 'file')
  assert.equal(result.expectedFiles, 1)
  assert.ok(result.subtitles.every((subtitle) => subtitle.packaging === 'mux'))
})

test('all separate includes video, audio and subtitles in a ZIP', () => {
  const result = plan({ subtitleStrategy: 'separate', audioPackaging: 'separate' })
  assert.equal(result.outputKind, 'zip')
  assert.equal(result.expectedFiles, 4)
  assert.equal(result.audio[0]?.packaging, 'separate')
  assert.ok(result.subtitles.every((subtitle) => subtitle.packaging === 'separate'))
})

test('rejects video copy when scaling is required', () => {
  assert.throws(
    () => plan({ quality: '480p', videoCodec: 'copy' }),
    (error: unknown) => error instanceof PlanError && error.code === 'COPY_CANNOT_SCALE'
  )
})

test('burning subtitles requires video re-encoding', () => {
  assert.throws(
    () => plan({ subtitleStrategy: 'burn', subtitleStreamIndices: [2], videoCodec: 'copy' }),
    (error: unknown) => error instanceof PlanError && error.code === 'BURN_REQUIRES_ENCODE'
  )
  const result = plan({ subtitleStrategy: 'burn', subtitleStreamIndices: [2], videoCodec: 'h264' })
  assert.equal(result.burnSubtitleIndex, 2)
  assert.equal(result.outputKind, 'file')
})

test('rejects PGS integrated into MP4', () => {
  const source = makeSource({
    subtitles: [
      {
        index: 2,
        codec: 'pgssub',
        format: 'sup',
        isExternal: false,
        isText: false,
        language: 'eng',
        title: 'PGS',
        displayTitle: 'PGS',
        isDefault: true,
        isForced: false,
        deliveryUrl: null,
        path: null,
      },
    ],
  })
  assert.throws(
    () => plan({ container: 'mp4', subtitleStrategy: 'muxed' }, source),
    (error: unknown) => error instanceof PlanError && error.code === 'INCOMPATIBLE_SUBTITLE'
  )
})

test('rejects DTS audio copied into MP4', () => {
  const source = makeSource({
    audio: [
      {
        index: 1,
        codec: 'dts',
        channels: 6,
        bitrate: 768_000,
        language: 'eng',
        title: 'DTS',
        displayTitle: 'DTS',
        isDefault: true,
        isForced: false,
      },
    ],
  })
  assert.throws(
    () => plan({ container: 'mp4', audioCodec: 'copy' }, source),
    (error: unknown) => error instanceof PlanError && error.code === 'INCOMPATIBLE_AUDIO_COPY'
  )
})

test('cache key changes with packaging', () => {
  const file = plan({ subtitleStrategy: 'muxed' })
  const zip = plan({ subtitleStrategy: 'separate', audioPackaging: 'separate' })
  assert.notEqual(file.cacheKey, zip.cacheKey)
  assert.equal(file.cacheKey, plan({ subtitleStrategy: 'muxed' }).cacheKey)
})

test('uses a compatible hardware encoder and keeps the logical cache key', () => {
  const hardware = {
    mode: 'videotoolbox' as const,
    device: null,
    encoders: { h264: 'h264_videotoolbox' as const },
  }
  const hardwarePlan = buildPlan({
    item,
    source: makeSource(),
    options: { quality: '720p', videoCodec: 'h264' },
    defaults,
    environment: {
      ffmpegVersion: 'ffmpeg version 9.0.2',
      encoders,
      filters: ['subtitles'],
      hardware,
    },
  })
  const softwarePlan = buildPlan({
    item,
    source: makeSource(),
    options: { quality: '720p', videoCodec: 'h264' },
    defaults,
    environment: { ffmpegVersion: 'ffmpeg version 9.0.2', encoders, filters: ['subtitles'] },
  })
  assert.equal(hardwarePlan.videoEncoder, 'h264_videotoolbox')
  assert.equal(hardwarePlan.softwareVideoEncoder, 'libx264')
  assert.deepEqual(hardwarePlan.hardware, {
    mode: 'videotoolbox',
    encoder: 'h264_videotoolbox',
    device: null,
  })
  assert.equal(hardwarePlan.cacheKey, softwarePlan.cacheKey)
})

test('hardwareAcceleration false keeps the software encoder', () => {
  const result = buildPlan({
    item,
    source: makeSource(),
    options: { quality: '720p', videoCodec: 'h264', hardwareAcceleration: false },
    defaults,
    environment: {
      ffmpegVersion: 'ffmpeg version 9.0.2',
      encoders,
      filters: ['subtitles'],
      hardware: {
        mode: 'videotoolbox',
        device: null,
        encoders: { h264: 'h264_videotoolbox' },
      },
    },
  })
  assert.equal(result.videoEncoder, 'libx264')
  assert.equal(result.hardware, null)
})

test('episode downloads use the series and episode code in the filename', () => {
  const result = buildPlan({
    item: {
      ...item,
      Type: 'Episode',
      Name: 'The General',
      SeriesId: '44444444444444444444444444444444',
      SeriesName: 'Public Domain Matinee',
      ParentIndexNumber: 1,
      IndexNumber: 2,
    },
    source: makeSource(),
    options: { container: 'mkv', videoCodec: 'copy', subtitleStrategy: 'muxed' },
    defaults,
    environment: { ffmpegVersion: 'ffmpeg version 9.0.2', encoders, filters: ['subtitles'] },
  })
  assert.match(result.downloadName, /Public Domain Matinee S01E02 - The General/)
  assert.equal(result.seriesId, '44444444444444444444444444444444')
})

test('disableHardwareInPlan falls back to the software encoder', () => {
  const result = buildPlan({
    item,
    source: makeSource(),
    options: { quality: '480p', videoCodec: 'h264' },
    defaults,
    environment: {
      ffmpegVersion: 'ffmpeg version 9.0.2',
      encoders,
      filters: ['subtitles'],
      hardware: {
        mode: 'videotoolbox',
        device: null,
        encoders: { h264: 'h264_videotoolbox' },
      },
    },
  })
  const fallback = disableHardwareInPlan(result)
  assert.equal(fallback.hardware, null)
  assert.equal(fallback.videoEncoder, 'libx264')
  assert.equal(fallback.cacheKey, result.cacheKey)
})

test('supports 2160p and does not upscale a smaller source', () => {
  const result = plan({
    container: 'mp4',
    quality: '2160p',
    videoCodec: 'h264',
    subtitleStrategy: 'muxed',
  })
  assert.equal(result.effectiveQuality, 'original')
  assert.equal(result.scaleHeight, null)
  assert.match(result.downloadName, / - custom\.mp4$/)
})

test('scales a 4K source down to 1440p', () => {
  const source = makeSource({
    video: [
      {
        index: 0,
        codec: 'hevc',
        width: 3840,
        height: 2160,
        bitrate: 20_000_000,
        isDefault: true,
        title: null,
        language: null,
      },
    ],
  })
  const result = plan(
    { container: 'mp4', quality: '1440p', videoCodec: 'h265', subtitleStrategy: 'muxed' },
    source
  )
  assert.equal(result.effectiveQuality, '1440p')
  assert.equal(result.scaleHeight, 1440)
  assert.match(result.downloadName, / - custom\.mp4$/)
})

test('uses the preset name in the output filename and stores the configuration', () => {
  const result = buildPlan({
    item,
    source: makeSource(),
    options: { container: 'mp4', quality: '720p', videoCodec: 'h264', subtitleStrategy: 'muxed' },
    preset: { id: 'mp4-720p', name: 'MP4 720p' },
    mediaSourceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    defaults,
    environment: { ffmpegVersion: 'ffmpeg version 9.0.2', encoders, filters: ['subtitles'] },
  })
  assert.equal(result.downloadName, 'Test movie (2020) - MP4 720p.mp4')
  assert.equal(result.presetId, 'mp4-720p')
  assert.equal(result.presetName, 'MP4 720p')
  assert.equal(result.config?.presetName, 'MP4 720p')
  assert.equal(result.config?.mediaSourceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  assert.equal(result.config?.options.videoCodec, 'h264')

  const renamed = buildPlan({
    item,
    source: makeSource(),
    options: { container: 'mp4', quality: '720p', videoCodec: 'h264', subtitleStrategy: 'muxed' },
    preset: { id: 'mp4-720p', name: 'Renamed preset' },
    defaults,
    environment: { ffmpegVersion: 'ffmpeg version 9.0.2', encoders, filters: ['subtitles'] },
  })
  assert.equal(renamed.downloadName, 'Test movie (2020) - Renamed preset.mp4')
  assert.notEqual(renamed.cacheKey, result.cacheKey)
})
