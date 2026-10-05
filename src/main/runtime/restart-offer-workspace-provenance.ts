import type { RestartOfferWorkspaceProvenance } from '../../shared/restart-offer-origin'
import type { RuntimeStore } from './runtime-store-contract'

const FOLDER_WORKSPACE_PREFIX = 'folder:'

/** The creator and automation records of the workspace an offered chat ran in, as this host keeps
 *  them; undefined for one it has no record of (a repo's main checkout, a removed workspace). */
export function readRestartOfferWorkspaceProvenance(
  store: Pick<RuntimeStore, 'getWorktreeMeta' | 'getFolderWorkspaces'> | null,
  workspaceId: string
): RestartOfferWorkspaceProvenance | undefined {
  if (!store) {
    return undefined
  }
  if (workspaceId.startsWith(FOLDER_WORKSPACE_PREFIX)) {
    const id = workspaceId.slice(FOLDER_WORKSPACE_PREFIX.length)
    const workspace = store.getFolderWorkspaces?.().find((entry) => entry.id === id)
    return workspace ? { creatorProvenance: workspace.creatorProvenance } : undefined
  }
  const meta = store.getWorktreeMeta(workspaceId)
  return meta
    ? { creatorProvenance: meta.creatorProvenance, automationProvenance: meta.automationProvenance }
    : undefined
}
