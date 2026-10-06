import { useAppStore } from '../store'
import {
  isConnectedRuntimeHostState,
  runtimeHostConnectionStateForEntry
} from '@/runtime/runtime-host-connection-state'
import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'
import { restartMachineTarget, type RestartMachineKey } from './native-chat-restart-machines'
import {
  getNativeChatRestartOffers,
  getNativeChatRestartResuming,
  readNativeChatRestartMachine
} from './native-chat-resume-on-restart-store'

/** The machine to open the dialog on: the only one named, or none in particular. */
function focusOf(machines: readonly RestartMachineKey[]): RestartMachineKey | null {
  return machines.length === 1 ? machines[0]! : null
}

/** A server out of contact would hold the dialog back until its call timed out; its last listing
 *  is what the dialog shows instead. */
function readableNow(machine: RestartMachineKey): boolean {
  const target = restartMachineTarget(machine)
  if (target.kind === 'local') {
    return true
  }
  const entry = useAppStore.getState().runtimeStatusByEnvironmentId.get(target.environmentId)
  return isConnectedRuntimeHostState(runtimeHostConnectionStateForEntry(entry))
}

/**
 * Every way back to the dialog — the status bar entry, a resume toast's Show, a reconnect toast's
 * Show chats — re-reads the named machines (by default every listed one), then opens only over
 * rows, since the dialog draws nothing without them. A failed read keeps that machine's last
 * listing, so a user's click is never lost to bookkeeping. Opening a chat from it is read-only and
 * keeps the offer.
 */
export async function reopenNativeChatRestartOffer(
  machines: readonly RestartMachineKey[] = [...getNativeChatRestartOffers().keys()]
): Promise<void> {
  // Mid-resume the host's answer is already on its way; a re-read racing it could undo it.
  if (getNativeChatRestartResuming().size === 0) {
    await Promise.all(
      machines
        .filter(readableNow)
        .map((machine) => readNativeChatRestartMachine(restartMachineTarget(machine)))
    )
  }
  if (getNativeChatRestartResuming().size > 0 || getNativeChatRestartOffers().size > 0) {
    requestNativeChatResumeOnRestartDialog('user', focusOf(machines))
  }
}
