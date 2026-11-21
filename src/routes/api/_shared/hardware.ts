import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import type { HardwareMode, VideoCodec } from '#lib/types.js'
import { getConfig } from './config.js'

export interface HardwareRuntime {
  mode: HardwareMode
  device: string | null
  encoders: Partial<Record<Exclude<VideoCodec, 'copy' | 'vp9'>, string>>
}

const HARDWARE_ENCODERS: Record<
  HardwareMode,
  Partial<Record<Exclude<VideoCodec, 'copy' | 'vp9'>, string>>
> = {
  videotoolbox: {
    h264: 'h264_videotoolbox',
    h265: 'hevc_videotoolbox',
  },
  nvenc: {
    h264: 'h264_nvenc',
    h265: 'hevc_nvenc',
    av1: 'av1_nvenc',
  },
  qsv: {
    h264: 'h264_qsv',
    h265: 'hevc_qsv',
    av1: 'av1_qsv',
  },
  vaapi: {
    h264: 'h264_vaapi',
    h265: 'hevc_vaapi',
    av1: 'av1_vaapi',
  },
}

function defaultOrder(): HardwareMode[] {
  if (process.platform === 'darwin') return ['videotoolbox']
  return ['nvenc', 'qsv', 'vaapi']
}

async function hasDevice(device: string): Promise<boolean> {
  try {
    await access(device, fsConstants.R_OK | fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

async function availableEncoders(
  mode: HardwareMode,
  encoders: readonly string[]
): Promise<Partial<Record<Exclude<VideoCodec, 'copy' | 'vp9'>, string>>> {
  const supported: Partial<Record<Exclude<VideoCodec, 'copy' | 'vp9'>, string>> = {}
  for (const [codec, encoder] of Object.entries(HARDWARE_ENCODERS[mode])) {
    if (encoders.includes(encoder)) {
      supported[codec as Exclude<VideoCodec, 'copy' | 'vp9'>] = encoder
    }
  }
  if (Object.keys(supported).length === 0) return {}
  if (mode === 'vaapi') {
    const device = getConfig().ffmpegVaapiDevice
    if (!(await hasDevice(device))) return {}
  }
  if (mode === 'nvenc' && process.platform === 'linux') {
    const device = (await hasDevice('/dev/nvidiactl')) || (await hasDevice('/dev/nvidia0'))
    if (!device) return {}
  }
  if (mode === 'qsv' && process.platform !== 'win32' && process.platform !== 'darwin') {
    const device = getConfig().ffmpegVaapiDevice
    if (!(await hasDevice(device))) return {}
  }
  return supported
}

export async function detectHardware(encoders: readonly string[]): Promise<HardwareRuntime | null> {
  const preference = getConfig().ffmpegHwaccel
  if (preference === 'none') return null
  const candidates = preference === 'auto' ? defaultOrder() : [preference]
  for (const mode of candidates) {
    const supported = await availableEncoders(mode, encoders)
    if (Object.keys(supported).length === 0) continue
    return {
      mode,
      device: mode === 'vaapi' || mode === 'qsv' ? getConfig().ffmpegVaapiDevice : null,
      encoders: supported,
    }
  }
  return null
}

export function hardwareCodecs(hardware: HardwareRuntime | null): VideoCodec[] {
  if (!hardware) return []
  return Object.keys(hardware.encoders) as VideoCodec[]
}

export function hardwareModeLabel(mode: HardwareMode | null): string | null {
  switch (mode) {
    case 'videotoolbox':
      return 'VideoToolbox'
    case 'nvenc':
      return 'NVENC'
    case 'qsv':
      return 'Intel QSV'
    case 'vaapi':
      return 'VAAPI'
    default:
      return null
  }
}
