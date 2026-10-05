import type { WorkspaceCreatorProvenance } from '../../../shared/worktree/types'
import type { RpcContext } from './core'

/** The client id this host's own desktop window calls its runtime with, over local IPC. */
export const DESKTOP_RENDERER_RPC_CLIENT_ID = 'desktop-renderer'

export function resolveRpcWorkspaceCreatorProvenance(
  context: Pick<RpcContext, 'pairedDeviceId' | 'clientId' | 'clientKind' | 'connectionId'>
): WorkspaceCreatorProvenance {
  if (context.pairedDeviceId) {
    return { kind: 'paired-device', deviceId: context.pairedDeviceId }
  }
  if (context.clientId || context.clientKind || context.connectionId) {
    throw new Error('authenticated_device_identity_missing')
  }
  return { kind: 'host' }
}
