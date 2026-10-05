import { lastVerifiedRuntimeStatus } from '../../../shared/runtime-host-status'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type { StructuredAgentSessionCallFence } from '@/runtime/structured-agent-session-client'
import { useAppStore } from '../store'

/**
 * The pairing and runtime a paired server's offer was read under. Every action on that offer is
 * sent with it, so a server re-paired or restarted since refuses the call before it runs rather
 * than acting on chats this desktop listed from an earlier incarnation. This computer has none.
 */
export type RestartMachineFence = Readonly<{ pairingRevision?: number; runtimeId?: string }>

export function currentRestartMachineFence(target: RuntimeClientTarget): RestartMachineFence {
  if (target.kind === 'local') {
    return {}
  }
  const pairingRevision = getRuntimeEnvironmentRevision(target.environmentId)
  const runtimeId = lastVerifiedRuntimeStatus(
    useAppStore.getState().runtimeStatusByEnvironmentId.get(target.environmentId)
  )?.runtimeId
  return {
    ...(pairingRevision === undefined ? {} : { pairingRevision }),
    ...(runtimeId ? { runtimeId } : {})
  }
}

export function sameRestartMachineFence(
  left: RestartMachineFence | undefined,
  right: RestartMachineFence | undefined
): boolean {
  return left?.pairingRevision === right?.pairingRevision && left?.runtimeId === right?.runtimeId
}

/** The call options a fenced action carries; none for this computer, which cannot be re-paired. */
export function restartMachineCallFence(
  target: RuntimeClientTarget,
  fence: RestartMachineFence
): StructuredAgentSessionCallFence | undefined {
  if (target.kind === 'local') {
    return undefined
  }
  return {
    ...(fence.pairingRevision === undefined
      ? {}
      : { expectedEnvironmentPairingRevision: fence.pairingRevision }),
    ...(fence.runtimeId === undefined ? {} : { expectedEnvironmentRuntimeId: fence.runtimeId })
  }
}
