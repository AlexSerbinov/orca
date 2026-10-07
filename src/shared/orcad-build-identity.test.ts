import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { hashOrcadEntryFiles } from './orcad-build-identity'

let directory = ''
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'orca-entry-identity-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

it('preserves an older single-entry build identity for rollback', () => {
  const entry = join(directory, 'orcad.js')
  writeFileSync(entry, 'old-server')
  expect(hashOrcadEntryFiles(entry)).toBe(
    createHash('sha256').update('old-server').digest('hex').slice(0, 16)
  )
})

it('binds direct and compatibility launches to both shipped entry files', () => {
  const launcher = join(directory, 'orcad.js')
  const server = join(directory, 'orcad-server.js')
  writeFileSync(launcher, 'launcher-a')
  writeFileSync(server, 'server-a')
  const first = hashOrcadEntryFiles(launcher)
  expect(hashOrcadEntryFiles(server)).toBe(first)
  writeFileSync(server, 'server-b')
  const second = hashOrcadEntryFiles(server)
  expect(second).not.toBe(first)
  writeFileSync(launcher, 'launcher-b')
  expect(hashOrcadEntryFiles(server)).not.toBe(second)
})
