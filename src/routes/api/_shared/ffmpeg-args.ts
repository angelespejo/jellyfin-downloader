import path from 'node:path'
import type { AudioCodec, Container } from '#lib/types.js'
import type { DownloadPlan, PlanAudio, PlanSubtitle } from './plan.js'
import {
  audioExtension,
  containerExtension,
  contentTypeForExtension,
  sanitizeFilenamePart,
  sourceAudioExtension,
} from './files.js'

export interface FfmpegCommand {
  args: string[]
  output: string
  label: string
}

export interface OutputArtifact {
  path: string
  entryName: string
  kind: 'video' | 'audio' | 'subtitle'
  contentType: string
}

export interface ProcessingPlan {
  burnPreparation: FfmpegCommand | null
  video: FfmpegCommand
  audio: FfmpegCommand[]
  subtitles: FfmpegCommand[]
  artifacts: OutputArtifact[]
  burnFile: string | null
}

export interface BuildProcessingPlanInput {
  plan: DownloadPlan
  sourcePath: string
  workDir: string
  /** Already downloaded external subtitle files, keyed by stream index. */
  externalSubtitleFiles: Map<number, string>
  /** Subtitle file to burn, already downloaded or extracted. */
  burnFile?: string | null
}

const AUDIO_ENCODER: Record<Exclude<AudioCodec, 'copy'>, string> = {
  aac: 'aac',
  ac3: 'ac3',
  eac3: 'eac3',
  opus: 'libopus',
  flac: 'flac',
  mp3: 'libmp3lame',
}

const VIDEO_ENCODER = {
  h264: 'libx264',
  h265: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libsvtav1',
} as const

function videoEncoderFor(plan: DownloadPlan): string {
  if (plan.videoEncoder) return plan.videoEncoder
  return VIDEO_ENCODER[plan.videoCodec as keyof typeof VIDEO_ENCODER] ?? 'libx264'
}

function audioEncoderFor(plan: DownloadPlan): string {
  if (plan.audioEncoder) return plan.audioEncoder
  return plan.audioCodec === 'copy' ? 'copy' : AUDIO_ENCODER[plan.audioCodec]
}

function escapeFilterPath(file: string): string {
  return file
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function safeLanguage(language: string | null): string {
  return language && /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : 'und'
}

function safeTitle(title: string | null, fallback: string): string {
  const cleaned = (title ?? '')
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || fallback
}

function displayLanguage(language: string | null): string {
  return safeLanguage(language)
}

function subtitleExtension(subtitle: PlanSubtitle): string {
  const format = subtitle.outputFormat.toLowerCase()
  if (subtitle.sourceCodec === 'mov_text') return 'srt'
  if (subtitle.sourceCodec === 'pgssub' || subtitle.sourceCodec === 'hdmv_pgs_subtitle')
    return 'sup'
  if (subtitle.sourceCodec === 'dvdsub' || subtitle.sourceCodec === 'dvb_subtitle') return 'sub'
  return format
}

function audioOutputExtension(track: PlanAudio, audioCodec: AudioCodec): string {
  return audioCodec === 'copy'
    ? sourceAudioExtension(track.sourceCodec)
    : audioExtension(audioCodec)
}

function baseCommand(): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
}

function videoCodecArgs(plan: DownloadPlan, filters: string[]): string[] {
  const args: string[] = []
  if (plan.videoCodec === 'copy') {
    args.push('-c:v', 'copy')
  } else if (plan.hardware) {
    args.push('-c:v', plan.hardware.encoder)
    if (plan.hardware.mode === 'videotoolbox') {
      args.push('-q:v', String(Math.max(40, Math.min(85, Math.round(90 - plan.crf * 1.5)))))
    } else if (plan.hardware.mode === 'nvenc') {
      args.push('-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(plan.crf), '-b:v', '0')
    } else if (plan.hardware.mode === 'qsv') {
      args.push('-global_quality', String(plan.crf))
    } else if (plan.hardware.mode === 'vaapi') {
      args.push('-qp', String(plan.crf))
    }
    if (plan.hardware.mode !== 'vaapi') args.push('-pix_fmt', 'yuv420p')
  } else {
    args.push('-c:v', videoEncoderFor(plan), '-preset', plan.videoPreset)
    if (plan.videoCodec === 'vp9') {
      args.push('-crf', String(plan.crf), '-b:v', '0', '-row-mt', '1')
    } else if (plan.videoCodec === 'av1') {
      args.push('-crf', String(plan.crf), '-b:v', '0')
    } else {
      args.push('-crf', String(plan.crf), '-pix_fmt', 'yuv420p')
    }
  }
  if (plan.container === 'mp4') {
    const sourceCodec = plan.sourceVideoCodec === 'hevc' ? 'h265' : plan.sourceVideoCodec
    const effective = plan.videoCodec === 'copy' ? sourceCodec : plan.videoCodec
    if (effective === 'h265') args.push('-tag:v', 'hvc1')
    if (effective === 'av1') args.push('-tag:v', 'av01')
  }
  if (filters.length) args.push('-vf', filters.join(','))
  return args
}

function audioCodecArgs(plan: DownloadPlan): string[] {
  if (plan.audioCodec === 'copy') return ['-c:a', 'copy']
  const args = ['-c:a', audioEncoderFor(plan)]
  if (plan.audioBitrate && plan.audioCodec !== 'flac') args.push('-b:a', plan.audioBitrate)
  return args
}

function subtitleMuxCodec(container: Container, subtitle: PlanSubtitle): string {
  if (container === 'mp4') return 'mov_text'
  if (container === 'webm') return 'webvtt'
  if (subtitle.sourceCodec === 'mov_text') return 'srt'
  return 'copy'
}

function buildVideoCommand(input: BuildProcessingPlanInput): FfmpegCommand {
  const { plan, sourcePath, workDir } = input
  const args = baseCommand()
  if (plan.hardware?.mode === 'vaapi' && plan.hardware.device) {
    args.push('-vaapi_device', plan.hardware.device)
  }
  args.push('-i', sourcePath)

  const externalInputs: { subtitle: PlanSubtitle; inputIndex: number }[] = []
  let nextInput = 1
  for (const subtitle of plan.subtitles) {
    if (!subtitle.isExternal) continue
    if (subtitle.packaging !== 'mux') continue
    const file = input.externalSubtitleFiles.get(subtitle.index)
    if (!file) throw new Error(`Missing external subtitle ${subtitle.index}`)
    args.push('-i', file)
    externalInputs.push({ subtitle, inputIndex: nextInput })
    nextInput += 1
  }

  args.push('-map', '0:v:0')

  const muxedAudio = plan.audio.filter((track) => track.packaging === 'mux')
  for (const track of muxedAudio) args.push('-map', `0:a:${track.ordinal}`)
  if (muxedAudio.length === 0) args.push('-an')

  const muxedSubtitles = plan.subtitles.filter((subtitle) => subtitle.packaging === 'mux')
  for (const subtitle of muxedSubtitles) {
    if (subtitle.isExternal) {
      const found = externalInputs.find((entry) => entry.subtitle.index === subtitle.index)
      if (!found) throw new Error(`Missing input for external subtitle ${subtitle.index}`)
      args.push('-map', `${found.inputIndex}:s:0`)
    } else {
      args.push('-map', `0:s:${subtitle.ordinal ?? 0}`)
    }
  }
  if (muxedSubtitles.length === 0) args.push('-sn')

  const filters: string[] = []
  if (plan.scaleHeight !== null) filters.push(`scale=-2:${plan.scaleHeight}`)
  if (plan.burnSubtitleIndex !== null) {
    if (!input.burnFile) throw new Error('Missing subtitle file to burn')
    filters.push(`subtitles=filename=${escapeFilterPath(input.burnFile)}`)
  }
  if (plan.hardware?.mode === 'vaapi') filters.push('format=nv12,hwupload')
  args.push(...videoCodecArgs(plan, filters))

  if (muxedAudio.length > 0) {
    args.push(...audioCodecArgs(plan))
    muxedAudio.forEach((track, index) => {
      args.push('-metadata:s:a:' + index, `language=${safeLanguage(track.language)}`)
      args.push('-metadata:s:a:' + index, `title=${safeTitle(track.title, `Audio ${index + 1}`)}`)
      args.push('-disposition:a:' + index, track.isDefault ? 'default' : '0')
    })
  }

  muxedSubtitles.forEach((subtitle, index) => {
    const codec = subtitleMuxCodec(plan.container, subtitle)
    args.push(`-c:s:${index}`, codec)
    args.push('-metadata:s:s:' + index, `language=${safeLanguage(subtitle.language)}`)
    args.push(
      '-metadata:s:s:' + index,
      `title=${safeTitle(subtitle.title, `Subtitle ${index + 1}`)}`
    )
    const disposition =
      subtitle.isDefault && subtitle.isForced
        ? 'default+forced'
        : subtitle.isDefault
          ? 'default'
          : subtitle.isForced
            ? 'forced'
            : '0'
    args.push('-disposition:s:' + index, disposition)
  })

  args.push('-map_metadata', '0', '-map_chapters', '0')
  if (plan.container === 'mp4') args.push('-movflags', '+faststart')

  const output = path.join(workDir, `video.${containerExtension(plan.container)}`)
  args.push(output)
  return { args, output, label: 'Main video' }
}

function buildAudioCommand(
  plan: DownloadPlan,
  track: PlanAudio,
  sourcePath: string,
  workDir: string
): FfmpegCommand {
  const args = baseCommand()
  args.push('-i', sourcePath, '-map', `0:a:${track.ordinal}`, '-vn', '-sn')
  args.push(...audioCodecArgs(plan))
  args.push('-metadata:s:a:0', `language=${safeLanguage(track.language)}`)
  args.push('-metadata:s:a:0', `title=${safeTitle(track.title, `Audio ${track.index}`)}`)
  const extension = audioOutputExtension(track, plan.audioCodec)
  const output = path.join(workDir, `audio-${track.index}.${extension}`)
  args.push(output)
  return { args, output, label: `Audio ${displayLanguage(track.language)}` }
}

function subtitleExtractionCodec(subtitle: PlanSubtitle): string {
  if (subtitle.sourceCodec === 'mov_text') return 'srt'
  if (subtitle.sourceCodec === 'pgssub' || subtitle.sourceCodec === 'hdmv_pgs_subtitle')
    return 'copy'
  if (subtitle.sourceCodec === 'dvdsub' || subtitle.sourceCodec === 'dvb_subtitle') return 'copy'
  return 'copy'
}

function buildEmbeddedSubtitleExtraction(
  subtitle: PlanSubtitle,
  sourcePath: string,
  workDir: string,
  prefix: string
): FfmpegCommand {
  if (subtitle.ordinal === null) throw new Error('Embedded subtitle has no ordinal')
  const extension = subtitleExtension(subtitle)
  const output = path.join(workDir, `${prefix}-${subtitle.index}.${extension}`)
  const args = baseCommand()
  args.push(
    '-i',
    sourcePath,
    '-map',
    `0:s:${subtitle.ordinal}`,
    '-c:s',
    subtitleExtractionCodec(subtitle),
    output
  )
  return { args, output, label: `Subtitle ${displayLanguage(subtitle.language)}` }
}

export function buildProcessingPlan(input: BuildProcessingPlanInput): ProcessingPlan {
  const { plan, sourcePath, workDir } = input
  const burnSubtitle = plan.subtitles.find((subtitle) => subtitle.packaging === 'burn') ?? null
  let burnPreparation: FfmpegCommand | null = null
  let burnFile: string | null = null

  if (burnSubtitle) {
    if (burnSubtitle.isExternal) {
      const sourceFile = input.externalSubtitleFiles.get(burnSubtitle.index) ?? null
      if (!sourceFile) throw new Error('Missing external subtitle to burn')
      const extension = path.extname(sourceFile).slice(1).toLowerCase()
      if (extension === 'srt' || extension === 'ass' || extension === 'ssa') {
        burnFile = sourceFile
      } else {
        const output = path.join(workDir, `burn-${burnSubtitle.index}.srt`)
        const args = baseCommand()
        args.push('-i', sourceFile, '-c:s', 'srt', output)
        burnPreparation = {
          args,
          output,
          label: `Converting subtitle ${displayLanguage(burnSubtitle.language)}`,
        }
        burnFile = output
      }
    } else {
      burnPreparation = buildEmbeddedSubtitleExtraction(burnSubtitle, sourcePath, workDir, 'burn')
      burnFile = burnPreparation.output
    }
  }

  const video = buildVideoCommand({ ...input, burnFile })

  const audio: FfmpegCommand[] = []
  for (const track of plan.audio.filter((candidate) => candidate.packaging === 'separate')) {
    audio.push(buildAudioCommand(plan, track, sourcePath, workDir))
  }

  const subtitles: FfmpegCommand[] = []
  const artifacts: OutputArtifact[] = [
    {
      path: video.output,
      entryName: `video.${containerExtension(plan.container)}`,
      kind: 'video',
      contentType: contentTypeForExtension(containerExtension(plan.container)),
    },
  ]

  for (const track of plan.audio.filter((candidate) => candidate.packaging === 'separate')) {
    const command = audio.find((candidate) => candidate.output.includes(`audio-${track.index}.`))
    if (!command) continue
    const extension = path.extname(command.output).slice(1)
    artifacts.push({
      path: command.output,
      entryName: `audio-${safeLanguage(track.language)}-${track.index}.${extension}`,
      kind: 'audio',
      contentType: contentTypeForExtension(extension),
    })
  }

  for (const subtitle of plan.subtitles) {
    if (subtitle.packaging !== 'separate') continue
    if (subtitle.isExternal) {
      const file = input.externalSubtitleFiles.get(subtitle.index)
      if (!file) throw new Error(`Missing external subtitle ${subtitle.index}`)
      const extension = path.extname(file).slice(1) || subtitle.outputFormat
      artifacts.push({
        path: file,
        entryName: `subtitle-${safeLanguage(subtitle.language)}-${subtitle.index}.${extension}`,
        kind: 'subtitle',
        contentType: contentTypeForExtension(extension),
      })
    } else {
      const command = buildEmbeddedSubtitleExtraction(subtitle, sourcePath, workDir, 'subtitle')
      subtitles.push(command)
      const extension = path.extname(command.output).slice(1)
      artifacts.push({
        path: command.output,
        entryName: `subtitle-${safeLanguage(subtitle.language)}-${subtitle.index}.${extension}`,
        kind: 'subtitle',
        contentType: contentTypeForExtension(extension),
      })
    }
  }

  return { burnPreparation, video, audio, subtitles, artifacts, burnFile }
}

export function artifactFilename(plan: DownloadPlan, artifact: OutputArtifact): string {
  if (plan.outputKind === 'file') return plan.downloadName
  const base = plan.downloadName.replace(/\.zip$/i, '')
  const suffix = sanitizeFilenamePart(artifact.entryName, 120)
  return `${base} - ${suffix}`
}
