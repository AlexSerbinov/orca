import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { RuntimeEnvironmentStatus } from '../../../shared/runtime-host-status'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import type { AutomationWorkspaceProvenance } from '../../../shared/worktree/types'

/** A paired server as the desktop's saved list holds it. */
export function pairedEnvironment(
  id: string,
  name: string,
  pairedDeviceId?: string
): PublicKnownRuntimeEnvironment {
  return {
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [],
    preferredEndpointId: 'endpoint',
    ...(pairedDeviceId ? { pairedDeviceId } : {})
  }
}

/** A verified connection: the server's runtime, and the id persisted before this run. */
export function verifiedConnection(args: {
  environmentId: string
  runtimeId: string
  pairedDeviceId?: string
  hostContactEpoch?: number
  priorRuntimeId?: string | null
}): RuntimeEnvironmentStatus {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the offer triggers read only runtimeId and pairedDeviceId from a status; the rest of RuntimeStatus is irrelevant here.
  const status = {
    runtimeId: args.runtimeId,
    pairedDeviceId: args.pairedDeviceId
  } as RuntimeStatus
  return {
    status,
    checkedAt: 1,
    hostContactEpoch: args.hostContactEpoch ?? 0,
    snapshot: {
      environmentId: args.environmentId,
      pairingRevision: 1,
      sequence: 1,
      checkedAt: 1,
      status,
      verification: 'verified',
      transport: 'ready',
      priorRuntimeId: args.priorRuntimeId ?? null
    }
  }
}

export const AUTOMATION_PROVENANCE: AutomationWorkspaceProvenance = {
  kind: 'created-by-automation',
  automationId: 'automation-1',
  automationNameSnapshot: 'Nightly dependency bump',
  automationRunId: 'run-1',
  automationRunTitleSnapshot: 'Nightly',
  createdAt: 1,
  executionTargetType: 'local',
  executionTargetId: 'local',
  projectId: 'project-1'
}
