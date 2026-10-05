import { translate } from '@/i18n/i18n'
import { normalizeWorkspaceCreatorProvenance } from '../../../shared/workspace-creator-provenance'
import type { Worktree } from '../../../shared/worktree/types'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type { AppState } from '../store/types'
import { getPairedDeviceIdsByEnvironment } from './sidebar/workspace-creator-visibility'
import type { ResumeCandidate } from './native-chat-resume-on-restart-grouping'

/**
 * Whose interrupted chat this is, decided per WORKSPACE.
 *
 * Only `own` is ticked by default, announced by a reconnect toast, or continued without asking.
 * Every other answer is still listed, unticked, with where it came from.
 *
 * Unlike the sidebar's "hide workspaces from other devices" filter — which shows a workspace when
 * it cannot tell — a missing fact here is `unknown`, never `own`: continuing a stranger's chat
 * sends a message in their name. The exception is THIS computer, whose chats belong to the person
 * at it unless a record says another device or an automation made the workspace.
 */
export type ResumeWorkspaceOwnership =
  | 'own'
  | 'other-device'
  | 'automation'
  | 'server-made'
  | 'unknown'

const OWNERSHIPS: readonly ResumeWorkspaceOwnership[] = [
  'own',
  'other-device',
  'automation',
  'server-made',
  'unknown'
]

/** Reads a serialized ownership back; anything else is `unknown`. */
export function parseResumeOwnership(value: string | undefined): ResumeWorkspaceOwnership {
  return OWNERSHIPS.find((ownership) => ownership === value) ?? 'unknown'
}

export function classifyResumeWorkspaceOwnership(
  worktree: Pick<Worktree, 'creatorProvenance' | 'automationProvenance'> | undefined,
  machine: RuntimeClientTarget,
  /** This desktop's device id as the paired server knows it; unused for this computer. */
  myPairedDeviceId: string | undefined
): ResumeWorkspaceOwnership {
  if (worktree?.automationProvenance?.kind === 'created-by-automation') {
    return 'automation'
  }
  const creator = normalizeWorkspaceCreatorProvenance(worktree?.creatorProvenance)
  if (machine.kind === 'local') {
    return creator?.kind === 'paired-device' ? 'other-device' : 'own'
  }
  if (!worktree || !creator || !myPairedDeviceId) {
    return 'unknown'
  }
  if (creator.kind === 'host') {
    return 'server-made'
  }
  return creator.deviceId === myPairedDeviceId ? 'own' : 'other-device'
}

type OwnershipState = Pick<
  AppState,
  'getKnownWorktreeById' | 'runtimeEnvironments' | 'runtimeStatusByEnvironmentId'
>

/** The ownership of one offered chat's workspace, read from the store as it stands. */
export function resumeCandidateOwnership(
  state: OwnershipState,
  machine: RuntimeClientTarget,
  candidate: Pick<ResumeCandidate, 'workspaceId' | 'executionHostId'>
): ResumeWorkspaceOwnership {
  const worktree = state.getKnownWorktreeById(candidate.workspaceId, candidate.executionHostId)
  const myPairedDeviceId =
    machine.kind === 'environment'
      ? getPairedDeviceIdsByEnvironment(
          state.runtimeEnvironments,
          state.runtimeStatusByEnvironmentId
        ).get(machine.environmentId)
      : undefined
  return classifyResumeWorkspaceOwnership(worktree, machine, myPairedDeviceId)
}

/** Whether the store knows enough to judge this chat: its workspace is loaded. This computer's
 *  chats never wait — they are the user's unless a loaded record says otherwise. */
export function resumeCandidateOwnershipSettled(
  state: OwnershipState,
  machine: RuntimeClientTarget,
  candidate: Pick<ResumeCandidate, 'workspaceId' | 'executionHostId'>
): boolean {
  return (
    machine.kind === 'local' ||
    state.getKnownWorktreeById(candidate.workspaceId, candidate.executionHostId) !== undefined
  )
}

/** The label beside a chat that does not start ticked; none for the user's own. */
export function resumeOwnershipLabel(
  ownership: ResumeWorkspaceOwnership,
  machineName: string
): string | undefined {
  switch (ownership) {
    case 'own':
      return undefined
    case 'automation':
      return translate(
        'auto.components.NativeChatResumeOnRestartModal.originAutomation',
        'Automation'
      )
    case 'other-device':
      return translate(
        'auto.components.NativeChatResumeOnRestartModal.originOtherDevice',
        'Another device'
      )
    case 'server-made':
      return translate(
        'auto.components.NativeChatResumeOnRestartModal.originServer',
        'Made on {{value0}}',
        { value0: machineName }
      )
    case 'unknown':
      return translate(
        'auto.components.NativeChatResumeOnRestartModal.originUnknown',
        'Unknown origin'
      )
  }
}
