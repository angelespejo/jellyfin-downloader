import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type BannerMode = 'development' | 'production'

const TITLE = String.raw`
     ██╗ ███████╗ ██╗      ██╗      ██╗   ██╗ ███████╗ ██╗ ███╗   ██╗
     ██║ ██╔════╝ ██║      ██║      ╚██╗ ██╔╝ ██╔════╝ ██║ ████╗  ██║
     ██║ █████╗   ██║      ██║       ╚████╔╝  █████╗   ██║ ██╔██╗ ██║
██   ██║ ██╔══╝   ██║      ██║        ╚██╔╝   ██╔══╝   ██║ ██║╚██╗██║
╚█████╔╝ ███████╗ ███████╗ ███████╗    ██║    ██║      ██║ ██║ ╚████║
 ╚════╝  ╚══════╝ ╚══════╝ ╚══════╝    ╚═╝    ╚═╝      ╚═╝ ╚═╝  ╚═══╝
                     D O W N L O A D E R
`

function colorize(code: string, text: string, enabled: boolean): string {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text
}

function packageInfo(): { name: string; version: string } {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      name?: string
      version?: string
      extra?: { productName?: string }
    }
    return {
      name: pkg.extra?.productName ?? pkg.name ?? 'Jellyfin Downloader',
      version: pkg.version ?? 'unknown',
    }
  } catch {
    return { name: 'Jellyfin Downloader', version: 'unknown' }
  }
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function cliPort(args: string[]): string | undefined {
  const index = args.indexOf('--port')
  return index >= 0 ? args[index + 1] : undefined
}

function forwardedArgs(args: string[]): string[] {
  return args.filter((arg) => arg !== '--')
}

/** Prints the startup banner before Vite or the production server starts. */
export function printBanner(mode: BannerMode = 'production', args: string[] = []): void {
  const forwarded = forwardedArgs(args)
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
  const dim = (text: string) => colorize('2', text, color)
  const info = packageInfo()
  const port =
    process.env.PORT?.trim() || cliPort(forwarded) || (mode === 'development' ? '5173' : '3000')
  const url = process.env.ORIGIN?.trim() || `http://localhost:${port}`
  const jellyfin =
    process.env.JELLYFIN_URL?.trim() || process.env.JELLYFIN_SERVER?.trim() || 'not configured'
  const settingsFile = process.env.SERVER_SETTINGS_FILE?.trim() || './data/settings.json'
  const data = path.dirname(path.resolve(process.cwd(), settingsFile))
  const storage = envFlag('SERVER_LOCAL_DOWNLOADS_ENABLED', true)
    ? 'local downloads enabled'
    : 'local downloads disabled'

  console.log(colorize('36', TITLE, color))
  console.log(`  ${dim('URL      ')} ${url}`)
  console.log(`  ${dim('Jellyfin ')} ${jellyfin}`)
  console.log(`  ${dim('Data     ')} ${data}`)
  console.log(`  ${dim('Storage  ')} ${storage}`)
  console.log(`  ${dim('Node     ')} ${process.version} · ${mode}`)
  console.log(`  ${dim('Product  ')} ${info.name} ${info.version}`)
  console.log('')
}

function startVite(args: string[]): void {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(pnpm, ['exec', 'vite', 'dev', ...forwardedArgs(args)], {
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
}

async function startServer(): Promise<void> {
  try {
    const entry = pathToFileURL(path.join(process.cwd(), 'build/index.js')).href
    await import(entry)
  } catch (error) {
    console.error('[startup] Could not start the server. Run "pnpm build" first.')
    console.error(error)
    process.exitCode = 1
  }
}

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntryPoint) {
  const command = process.argv[2]
  if (command === 'dev') {
    printBanner('development', process.argv.slice(3))
    startVite(process.argv.slice(3))
  } else {
    printBanner('production')
    await startServer()
  }
}
