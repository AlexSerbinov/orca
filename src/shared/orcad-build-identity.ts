import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ORCAD_LAUNCHER_FILENAME, ORCAD_SERVER_ENTRY_FILENAME } from './orcad-artifacts'

export const ORCAD_BUILD_HASH_LENGTH = 16

/** Keep single-entry rollback identities while binding split builds to both entry files. */
export function hashOrcadEntryFiles(entryPath: string): string {
  const directory = dirname(entryPath)
  const server = join(directory, ORCAD_SERVER_ENTRY_FILENAME)
  const entries = existsSync(server)
    ? [join(directory, ORCAD_LAUNCHER_FILENAME), server]
    : [entryPath]
  const hash = createHash('sha256')
  for (const entry of entries) {
    hash.update(readFileSync(entry))
  }
  return hash.digest('hex').slice(0, ORCAD_BUILD_HASH_LENGTH)
}
