import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ORCAD_SERVER_ENTRY_FILENAME } from '../../shared/orcad-artifacts'
import { assertOrcadServerRuntime, handoffToBundledOrcad } from './orcad-bundled-runtime'

try {
  if (!handoffToBundledOrcad()) {
    assertOrcadServerRuntime()
    const entry = realpathSync(process.argv[1] ?? __filename)
    createRequire(entry)(join(dirname(entry), ORCAD_SERVER_ENTRY_FILENAME))
  }
} catch (error) {
  console.error('orcad: failed to launch:', error)
  process.exit(78)
}
