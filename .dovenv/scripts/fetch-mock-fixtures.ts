import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { MockManifest, MockMovie, MockSource, MockStream } from '../dev/mock-jellyfin/types.ts'

const root = process.cwd()
const fixtures = path.join(root, '.dovenv', 'dev', 'fixtures')
const generated = path.join(fixtures, 'generated')
const media = path.join(fixtures, 'media')
const posters = path.join(fixtures, 'posters')
const subs = path.join(fixtures, 'subs')
const manifestPath = path.join(fixtures, 'manifest.json')
const force = process.argv.includes('--force')

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH
    ? path.join(path.dirname(process.env.FFMPEG_PATH), 'ffprobe')
    : 'ffprobe')

function run(binary: string, args: string[], label: string): string {
  process.stdout.write(`-> ${label}\n`)
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})\n${result.stderr?.slice(-4000) ?? ''}`)
  }
  return result.stdout ?? ''
}

function rel(...parts: string[]): string {
  return path
    .relative(fixtures, path.join(...parts))
    .split(path.sep)
    .join('/')
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function archiveUrl(identifier: string, file: string): string {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file)}`
}

async function downloadClip(input: {
  identifier: string
  file: string
  output: string
  start: string
}): Promise<void> {
  if (existsSync(input.output)) return
  run(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      input.start,
      '-t',
      '20',
      '-i',
      archiveUrl(input.identifier, input.file),
      '-vf',
      'scale=-2:480',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      input.output,
    ],
    `Downloading clip from ${input.identifier}`
  )
}

async function probe(file: string): Promise<{
  streams: {
    index: number
    codec_type: string
    codec_name: string
    width?: number
    height?: number
    channels?: number
    bit_rate?: string
    tags?: Record<string, string>
    disposition?: Record<string, number>
  }[]
  format: { duration?: string }
}> {
  return JSON.parse(
    run(
      ffprobe,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      `ffprobe ${path.basename(file)}`
    )
  )
}

function srt(language: string): string {
  const text =
    language === 'spa'
      ? [
          'Clip de desarrollo de dominio público.',
          'Probando el procesado de subtítulos.',
          'Este texto no pertenece a la película.',
        ]
      : [
          'Public domain development clip.',
          'Testing subtitle processing.',
          'This text is not part of the movie.',
        ]
  return text
    .map(
      (line, index) =>
        `${index + 1}\n00:00:0${index * 4},000 --> 00:00:0${index * 4 + 4},000\n${line}\n`
    )
    .join('\n')
}

function ass(): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,Development subtitle in ASS
Dialogue: 0,0:00:04.00,0:00:08.00,Default,,0,0,0,,Testing burn-in and soft mux
Dialogue: 0,0:00:08.00,0:00:12.00,Default,,0,0,0,,Public domain footage
`
}

function vtt(): string {
  return `WEBVTT

00:00:00.000 --> 00:00:04.000
Public domain development clip.

00:00:04.000 --> 00:00:08.000
Testing external VTT subtitles.

00:00:08.000 --> 00:00:12.000
This text is not part of the movie.
`
}

function videoStream(stream: Awaited<ReturnType<typeof probe>>['streams'][number]): MockStream {
  return {
    index: stream.index,
    type: 'Video',
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    bitrate: stream.bit_rate ? Number(stream.bit_rate) : undefined,
    isDefault: true,
  }
}

function audioStream(
  stream: Awaited<ReturnType<typeof probe>>['streams'][number],
  index: number
): MockStream {
  return {
    index: stream.index,
    type: 'Audio',
    codec: stream.codec_name,
    language: stream.tags?.language ?? (index === 0 ? 'eng' : 'spa'),
    title: stream.tags?.title ?? (index === 0 ? 'English' : 'Spanish'),
    displayTitle: stream.tags?.title ?? (index === 0 ? 'English · AAC' : 'Spanish · AAC'),
    channels: stream.channels,
    bitrate: stream.bit_rate ? Number(stream.bit_rate) : undefined,
    isDefault: index === 0,
    isForced: false,
  }
}

function embeddedSubtitle(
  stream: Awaited<ReturnType<typeof probe>>['streams'][number]
): MockStream {
  return {
    index: stream.index,
    type: 'Subtitle',
    codec: stream.codec_name,
    language: stream.tags?.language ?? 'eng',
    title: stream.tags?.title ?? 'English',
    displayTitle: stream.tags?.title ?? 'English',
    isExternal: false,
    isTextSubtitleStream: !['pgssub', 'dvdsub', 'hdmv_pgs_subtitle'].includes(stream.codec_name),
    isDefault: true,
    isForced: false,
  }
}

function externalSubtitle(input: {
  index: number
  codec: string
  language: string
  title: string
  file: string
}): MockStream {
  return {
    index: input.index,
    type: 'Subtitle',
    codec: input.codec,
    language: input.language,
    title: input.title,
    displayTitle: `${input.title} (externo)`,
    isExternal: true,
    isTextSubtitleStream: true,
    isDefault: false,
    isForced: false,
    deliveryPath: rel(input.file),
  }
}

async function buildMovie(input: {
  id: string
  sourceId: string
  title: string
  year: number
  overview: string
  file: string
  poster: string
  externalSubs: { file: string; codec: string; language: string; title: string }[]
}): Promise<MockMovie> {
  const info = await stat(input.file)
  const probeResult = await probe(input.file)
  const streams: MockStream[] = []
  let audioIndex = 0
  for (const stream of probeResult.streams) {
    if (stream.codec_type === 'video') streams.push(videoStream(stream))
    else if (stream.codec_type === 'audio') {
      streams.push(audioStream(stream, audioIndex))
      audioIndex += 1
    } else if (stream.codec_type === 'subtitle') streams.push(embeddedSubtitle(stream))
  }
  const nextIndex = Math.max(-1, ...streams.map((stream) => stream.index)) + 1
  input.externalSubs.forEach((subtitle, offset) => {
    streams.push(
      externalSubtitle({
        index: nextIndex + offset,
        codec: subtitle.codec,
        language: subtitle.language,
        title: subtitle.title,
        file: subtitle.file,
      })
    )
  })
  const posterInfo = await stat(input.poster)
  const source: MockSource = {
    id: input.sourceId,
    name: 'Principal',
    container: path.extname(input.file).slice(1),
    path: rel(input.file),
    size: info.size,
    etag: hash(`${input.file}:${info.size}:${info.mtimeMs}`),
    runtimeTicks: Math.round(Number(probeResult.format.duration ?? 0) * 10_000_000),
    streams,
  }
  return {
    id: input.id,
    name: input.title,
    year: input.year,
    overview: input.overview,
    posterPath: rel(input.poster),
    posterTag: hash(`${input.poster}:${posterInfo.size}:${posterInfo.mtimeMs}`),
    sources: [source],
  }
}

async function extractPoster(clip: string, output: string): Promise<void> {
  if (existsSync(output)) return
  run(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      '3',
      '-i',
      clip,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      output,
    ],
    `Poster ${path.basename(output)}`
  )
}

async function main(): Promise<void> {
  if (existsSync(manifestPath) && !force) {
    process.stdout.write('Fixtures already exist. Use --force to regenerate them.\n')
    return
  }
  await Promise.all([
    mkdir(generated, { recursive: true }),
    mkdir(media, { recursive: true }),
    mkdir(posters, { recursive: true }),
    mkdir(subs, { recursive: true }),
  ])

  const generalClip = path.join(generated, 'the-general-clip.mp4')
  const fridayClip = path.join(generated, 'his-girl-friday-clip.mp4')
  const nightClip = path.join(generated, 'night-of-the-living-dead-clip.mp4')
  await downloadClip({
    identifier: 'TheGeneral1926',
    file: 'The_General_1926_720p_512kb.mp4',
    output: generalClip,
    start: '00:05:00',
  })
  await downloadClip({
    identifier: 'his_girl_friday',
    file: 'his_girl_friday_512kb.mp4',
    output: fridayClip,
    start: '00:05:00',
  })
  await downloadClip({
    identifier: 'NightOfTheLivingDead_201508',
    file: 'Night of the Living Dead.mp4',
    output: nightClip,
    start: '00:05:00',
  })

  const generalEn = path.join(subs, 'the-general.en.srt')
  const generalEs = path.join(subs, 'the-general.es.srt')
  const fridayVtt = path.join(subs, 'his-girl-friday.en.vtt')
  const nightEnSrt = path.join(subs, 'night.en.srt')
  const nightEsSrt = path.join(subs, 'night.es.srt')
  const nightEnAss = path.join(subs, 'night.en.ass')
  await Promise.all([
    writeFile(generalEn, srt('eng'), 'utf8'),
    writeFile(generalEs, srt('spa'), 'utf8'),
    writeFile(fridayVtt, vtt(), 'utf8'),
    writeFile(nightEnSrt, srt('eng'), 'utf8'),
    writeFile(nightEsSrt, srt('spa'), 'utf8'),
    writeFile(nightEnAss, ass(), 'utf8'),
  ])

  const generalMedia = path.join(media, 'the-general.mkv')
  const generalExternal = path.join(media, 'the-general.es.srt')
  if (!existsSync(generalMedia)) {
    run(
      ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        generalClip,
        '-i',
        generalEn,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-map',
        '1:0',
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-c:s',
        'srt',
        '-metadata:s:s:0',
        'language=eng',
        '-metadata:s:s:0',
        'title=English',
        generalMedia,
      ],
      'Building MKV with embedded subtitle'
    )
  }
  await copyFile(generalEs, generalExternal)

  const fridayMedia = path.join(media, 'his-girl-friday.mp4')
  const fridayExternal = path.join(media, 'his-girl-friday.en.vtt')
  if (!existsSync(fridayMedia)) {
    run(
      ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        fridayClip,
        '-map',
        '0',
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        fridayMedia,
      ],
      'Building MP4'
    )
  }
  await copyFile(fridayVtt, fridayExternal)

  const nightMedia = path.join(media, 'night-of-the-living-dead.mkv')
  const nightExternal = path.join(media, 'night-of-the-living-dead.es.srt')
  if (!existsSync(nightMedia)) {
    run(
      ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        nightClip,
        '-i',
        nightEnSrt,
        '-i',
        nightEnAss,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-map',
        '0:a:0',
        '-map',
        '1:0',
        '-map',
        '2:0',
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-c:s',
        'copy',
        '-metadata:s:a:0',
        'language=eng',
        '-metadata:s:a:0',
        'title=English',
        '-metadata:s:a:1',
        'language=spa',
        '-metadata:s:a:1',
        'title=Spanish',
        '-metadata:s:s:0',
        'language=eng',
        '-metadata:s:s:0',
        'title=English ASS',
        '-metadata:s:s:1',
        'language=eng',
        '-metadata:s:s:1',
        'title=English SRT',
        nightMedia,
      ],
      'Building multi-audio MKV with embedded ASS/SRT'
    )
  }
  await copyFile(nightEsSrt, nightExternal)

  const generalPoster = path.join(posters, 'the-general.jpg')
  const fridayPoster = path.join(posters, 'his-girl-friday.jpg')
  const nightPoster = path.join(posters, 'night-of-the-living-dead.jpg')
  await Promise.all([
    extractPoster(generalClip, generalPoster),
    extractPoster(fridayClip, fridayPoster),
    extractPoster(nightClip, nightPoster),
  ])

  const movies: MockMovie[] = [
    await buildMovie({
      id: '11111111111111111111111111111111',
      sourceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'The General',
      year: 1926,
      overview: 'Public-domain excerpt used to test MKV with embedded and external subtitles.',
      file: generalMedia,
      poster: generalPoster,
      externalSubs: [
        { file: generalExternal, codec: 'subrip', language: 'spa', title: 'Spanish (SRT)' },
      ],
    }),
    await buildMovie({
      id: '22222222222222222222222222222222',
      sourceId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'His Girl Friday',
      year: 1940,
      overview: 'Public-domain excerpt used to test MP4 with external VTT subtitles.',
      file: fridayMedia,
      poster: fridayPoster,
      externalSubs: [
        { file: fridayExternal, codec: 'webvtt', language: 'eng', title: 'English (VTT)' },
      ],
    }),
    await buildMovie({
      id: '33333333333333333333333333333333',
      sourceId: 'cccccccccccccccccccccccccccccccc',
      title: 'Night of the Living Dead',
      year: 1968,
      overview:
        'Public-domain excerpt used to test multi-audio, embedded ASS/SRT and external SRT.',
      file: nightMedia,
      poster: nightPoster,
      externalSubs: [
        { file: nightExternal, codec: 'subrip', language: 'spa', title: 'Spanish (SRT)' },
      ],
    }),
  ]

  const manifest: MockManifest = { generatedAt: new Date().toISOString(), movies }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const manifestInfo = await readFile(manifestPath, 'utf8')
  process.stdout.write(`Fixtures generated (manifest: ${manifestInfo.length} bytes)\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
