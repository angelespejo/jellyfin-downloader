import type { AudioCodec, Capabilities, Container, VideoCodec } from '#lib/types.js'
import { getConfig } from './config.js'
import { getFfmpegInfo } from './ffmpeg.js'
import { detectHardware, hardwareCodecs } from './hardware.js'
import { getLocalDownloadsStore } from './local-downloads.js'

function has(encoders: string[], name: string): boolean {
  return encoders.includes(name)
}

export async function getCapabilities(): Promise<Capabilities> {
  const ffmpeg = await getFfmpegInfo()
  const hardware = await detectHardware(ffmpeg.encoders)
  const availableVideo: VideoCodec[] = ['copy']
  if (has(ffmpeg.encoders, 'libx264')) availableVideo.push('h264')
  if (has(ffmpeg.encoders, 'libx265')) availableVideo.push('h265')
  if (has(ffmpeg.encoders, 'libvpx-vp9')) availableVideo.push('vp9')
  if (has(ffmpeg.encoders, 'libsvtav1') || has(ffmpeg.encoders, 'libaom-av1'))
    availableVideo.push('av1')

  const availableAudio: AudioCodec[] = ['copy']
  if (has(ffmpeg.encoders, 'aac')) availableAudio.push('aac')
  if (has(ffmpeg.encoders, 'ac3')) availableAudio.push('ac3')
  if (has(ffmpeg.encoders, 'eac3')) availableAudio.push('eac3')
  if (has(ffmpeg.encoders, 'libopus')) availableAudio.push('opus')
  if (has(ffmpeg.encoders, 'flac')) availableAudio.push('flac')
  if (has(ffmpeg.encoders, 'libmp3lame')) availableAudio.push('mp3')

  const containers: Container[] = ['mkv', 'mp4', 'webm']
  const videoByContainer: Record<Container, VideoCodec[]> = {
    mkv: availableVideo,
    mp4: availableVideo.filter((codec) => ['copy', 'h264', 'h265', 'av1'].includes(codec)),
    webm: availableVideo.filter((codec) => ['copy', 'vp9', 'av1'].includes(codec)),
  }
  const audioByContainer: Record<Container, AudioCodec[]> = {
    mkv: availableAudio,
    mp4: availableAudio.filter((codec) => ['copy', 'aac', 'ac3', 'eac3', 'mp3'].includes(codec)),
    webm: availableAudio.filter((codec) => ['copy', 'opus'].includes(codec)),
  }

  return {
    ffmpeg: { available: ffmpeg.available, version: ffmpeg.version },
    hardware: {
      available: Boolean(hardware),
      mode: hardware?.mode ?? null,
      codecs: hardwareCodecs(hardware),
    },
    burnIn: ffmpeg.filters.includes('subtitles'),
    containers,
    videoCodecs: videoByContainer,
    audioCodecs: audioByContainer,
    maxConcurrentJobs: getConfig().maxConcurrentJobs,
    maxQueuedJobs: getConfig().maxQueuedJobs,
    localDownloads: { enabled: getLocalDownloadsStore().isEnabled() },
  }
}
