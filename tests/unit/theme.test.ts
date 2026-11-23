import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const css = readFileSync(path.join(process.cwd(), 'src/app.css'), 'utf8')

function block(selector: string): string {
  const start = css.indexOf(selector)
  assert.notEqual(start, -1, `missing CSS block ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  assert.ok(open >= 0 && close > open, `invalid CSS block ${selector}`)
  return css.slice(open + 1, close)
}

function tokens(value: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of value.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    map.set(match[1], match[2].trim())
  }
  return map
}

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ]
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return [...hex.slice(1)].map((digit) => Number.parseInt(digit + digit, 16)) as [
      number,
      number,
      number,
    ]
  }
  throw new Error(`Unsupported colour ${value}`)
}

function luminance(color: [number, number, number]): number {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string): number {
  const first = luminance(rgb(foreground))
  const second = luminance(rgb(background))
  const [lighter, darker] = first > second ? [first, second] : [second, first]
  return (lighter + 0.05) / (darker + 0.05)
}

const light = tokens(block(":root[data-theme='light']"))
const dark = tokens(block(":root[data-theme='dark']"))
const systemDark = tokens(block(":root[data-theme='system']"))

test('system dark uses the same tokens as the explicit dark theme', () => {
  for (const [name, value] of dark) {
    assert.equal(systemDark.get(name), value, `system dark is missing ${name}`)
  }
  assert.equal(systemDark.size, dark.size, 'system dark has extra tokens')
})

test('text tokens keep an accessible contrast on their surfaces', () => {
  const pairs = [
    ['--text', '--surface'],
    ['--text', '--bg'],
    ['--muted', '--surface'],
    ['--info', '--info-soft'],
    ['--success', '--success-soft'],
    ['--warning', '--warning-soft'],
    ['--danger', '--danger-soft'],
  ] as const
  for (const [theme, palette] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [foreground, background] of pairs) {
      const fg = palette.get(foreground)
      const bg = palette.get(background)
      assert.ok(fg, `${theme} is missing ${foreground}`)
      assert.ok(bg, `${theme} is missing ${background}`)
      const ratio = contrast(fg, bg)
      assert.ok(
        ratio >= 4.5,
        `${theme}: ${foreground} on ${background} has a contrast of ${ratio.toFixed(2)}`
      )
    }
  }
})

test('every palette defines the modal surface tokens', () => {
  for (const palette of [light, dark, systemDark]) {
    for (const name of ['--modal-backdrop', '--modal-surface', '--modal-head']) {
      assert.ok(palette.has(name), `missing ${name}`)
    }
  }
})
