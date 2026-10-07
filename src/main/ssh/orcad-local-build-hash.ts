/** Shares the host build identity so activation verifies the shipped entry bytes. */
import { join } from 'node:path'
import { hashOrcadEntryFiles } from '../../shared/orcad-build-identity'
import { ORCAD_LAUNCHER_FILENAME } from '../../shared/orcad-artifacts'

export { ORCAD_BUILD_HASH_LENGTH } from '../../shared/orcad-build-identity'

export function computeLocalOrcadBuildHash(localOrcadDir: string): string {
  return hashOrcadEntryFiles(join(localOrcadDir, ORCAD_LAUNCHER_FILENAME))
}
