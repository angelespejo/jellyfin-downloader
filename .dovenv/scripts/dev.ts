import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { argv } from 'node:process'
import { printBanner } from '../../startup.ts'

const port = Number(process.env.MOCK_JELLYFIN_PORT ?? 8096)
const apiKey = process.env.MOCK_API_KEY ?? 'dev-key'
const manifest = '.dovenv/dev/fixtures/manifest.json'

const env = {
  ...process.env,
  JELLYFIN_URL: `http://127.0.0.1:${port}`,
  JELLYFIN_API_KEY: apiKey,
  SERVER_LOCAL_DOWNLOADS_ENABLED: 'true',
  SERVER_LOCAL_DOWNLOADS_DIR: './data/dev-downloads',
  SERVER_SETTINGS_FILE: './data/dev-settings.json',
  SERVER_JOBS_DIR: './data/dev-jobs',
}

Object.assign(process.env, env)
printBanner('development', argv.slice(2))

if (!existsSync(manifest)) {
  console.log('Generating development fixtures...')
  const result = spawnSync(process.execPath, ['.dovenv/scripts/fetch-mock-fixtures.ts'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const mock = spawn(process.execPath, ['.dovenv/scripts/mock-jellyfin.ts'], {
  stdio: 'inherit',
  env,
})

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
let vite: ReturnType<typeof spawn> | null = null

let closing = false
function close(code = 0): void {
  if (closing) return
  closing = true
  mock.kill('SIGTERM')
  vite?.kill('SIGTERM')
  setTimeout(() => process.exit(code), 150).unref()
}

mock.on('exit', (code) => {
  if (!closing) {
    console.error(`Jellyfin mock exited with code ${code ?? 1}`)
    close(code ?? 1)
  }
})
process.on('SIGINT', () => close(0))
process.on('SIGTERM', () => close(0))
const flags = argv.slice(2)
async function waitForMock(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/System/Info/Public`)
      if (response.ok) {
        console.log(`Jellyfin mock ready at http://127.0.0.1:${port}`)
        vite = spawn(pnpm, ['exec', 'vite', 'dev', ...flags], {
          stdio: 'inherit',
          env,
        })
        vite.on('exit', (code) => close(code ?? 0))
        return
      }
    } catch {
      // reintentar
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  console.error('Jellyfin mock did not respond in time')
  close(1)
}

void waitForMock()
