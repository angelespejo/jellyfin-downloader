import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = ['src', '.dovenv/scripts', '.dovenv/dev', 'tests']
const ignored = new Set([
  'node_modules',
  '.svelte-kit',
  'build',
  'fixtures',
  'generated',
  'media',
  'posters',
  'subs',
])
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs'])

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

async function main(): Promise<void> {
  const problems: string[] = []
  for (const root of roots) {
    let files: string[]
    try {
      files = await walk(root)
    } catch {
      continue
    }
    for (const file of files) {
      const extension = path.extname(file)
      if (sourceExtensions.has(extension)) {
        problems.push(`${file}: hand-written JavaScript source is not allowed`)
        continue
      }
      if (extension === '.svelte') {
        const content = await readFile(file, 'utf8')
        const tags = content.match(/<script\b[^>]*>/gi) ?? []
        for (const tag of tags) {
          if (!/\blang\s*=\s*["']ts["']/i.test(tag)) {
            problems.push(`${file}: <script> is missing lang="ts"`)
          }
        }
      }
    }
  }

  for (const config of [
    'svelte.config.js',
    'vite.config.js',
    'svelte.config.mjs',
    'vite.config.mjs',
  ]) {
    try {
      await readFile(config, 'utf8')
      problems.push(`${config}: JavaScript configuration is not allowed; use TypeScript`)
    } catch {
      // correcto: no existe
    }
  }

  if (problems.length) {
    console.error('Files violate the TypeScript-only rule:\n')
    for (const problem of problems) console.error(` - ${problem}`)
    process.exit(1)
  }
  console.log('TypeScript-only: no hand-written JavaScript source found.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
