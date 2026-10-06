import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'
import type { RestartMachineKey } from './native-chat-restart-machines'
import {
  getNativeChatRestartOffers,
  getNativeChatRestartResuming,
  refreshNativeChatRestartOffers
} from './native-chat-resume-on-restart-store'

/** The machine to open the dialog on: the only one named, or none in particular. */
function focusOf(machines: readonly RestartMachineKey[]): RestartMachineKey | null {
  return machines.length === 1 ? machines[0]! : null
}

/** The status bar entry and a toast's Show: opens at once on the last confirmed offers, then
 *  re-reads each named machine on its own, so an unreachable machine never holds the dialog back.
 *  A machine whose host now lists nothing drops out of the open dialog, which closes once none is
 *  left. Opening a chat from it is read-only and keeps the offer. */
export function reopenNativeChatRestartOffers(machines: readonly RestartMachineKey[]): void {
  const resuming = getNativeChatRestartResuming().size > 0
  // With nothing listed, a request would wait and later open the dialog by itself.
  if (getNativeChatRestartOffers().size === 0 && !resuming) {
    return
  }
  requestNativeChatResumeOnRestartDialog('user', focusOf(machines))
  // Mid-resume the host's answer is already on its way; a re-read racing it could undo it.
  if (!resuming) {
    void refreshNativeChatRestartOffers(machines)
  }
}
