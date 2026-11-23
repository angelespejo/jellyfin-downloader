import assert from 'node:assert/strict'
import test from 'node:test'
import { jellyfinWebUrl } from '#api/_shared/jellyfin-links.ts'

test('builds the Jellyfin web details URL', () => {
  assert.equal(
    jellyfinWebUrl('https://jellyfin.example.com', 'a'.repeat(32)),
    `https://jellyfin.example.com/web/index.html#!/details?id=${'a'.repeat(32)}`
  )
})

test('keeps a base path and tolerates a trailing slash', () => {
  assert.equal(
    jellyfinWebUrl('https://example.com/jellyfin/', 'b'.repeat(32)),
    `https://example.com/jellyfin/web/index.html#!/details?id=${'b'.repeat(32)}`
  )
})
