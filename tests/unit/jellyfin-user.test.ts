import assert from 'node:assert/strict'
import test from 'node:test'
import { pickJellyfinUser } from '#api/_shared/jellyfin-user.ts'

test('pickJellyfinUser prefers an enabled administrator', () => {
  const id = pickJellyfinUser([
    { Id: 'user-1', Policy: { IsAdministrator: false } },
    { Id: 'admin', Policy: { IsAdministrator: true } },
  ])
  assert.equal(id, 'admin')
})

test('pickJellyfinUser skips disabled users', () => {
  const id = pickJellyfinUser([
    { Id: 'disabled-admin', Policy: { IsAdministrator: true, IsDisabled: true } },
    { Id: 'enabled', Policy: { IsAdministrator: false } },
  ])
  assert.equal(id, 'enabled')
})

test('pickJellyfinUser falls back to the first enabled user', () => {
  const id = pickJellyfinUser([
    { Id: 'first', Policy: { IsAdministrator: false } },
    { Id: 'second', Policy: { IsAdministrator: false } },
  ])
  assert.equal(id, 'first')
})

test('pickJellyfinUser ignores users without an Id', () => {
  assert.equal(pickJellyfinUser([{ Name: 'no id' }, { Id: 'valid' }]), 'valid')
})

test('pickJellyfinUser returns null when there is no usable user', () => {
  assert.equal(pickJellyfinUser([]), null)
  assert.equal(pickJellyfinUser([{ Id: 'x', Policy: { IsDisabled: true } }]), null)
})
