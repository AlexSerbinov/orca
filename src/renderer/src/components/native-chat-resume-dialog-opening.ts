import { useEffect, useSyncExternalStore } from 'react'
import { useNativeChatRestartOfferEnabled } from './native-chat-restart-offer-gate'
import {
  getNativeChatResumeOnRestartDialogRequest,
  markNativeChatResumeLaunchRequestShown,
  subscribeNativeChatResumeOnRestartDialog,
  type NativeChatResumeOnRestartDialogRequest
} from './native-chat-resume-on-restart-dialog'
import { LOCAL_RESTART_MACHINE } from './native-chat-restart-machines'
import { dismissReconnectRestartOffers } from './native-chat-restart-reconnect-toast'
import { hasOwnCandidate, useNativeChatRestartOffers } from './native-chat-resume-on-restart-store'
import { useMachineViews, type MachineView } from './native-chat-resume-machine-views'
import {
  markNativeChatRestartOffersShown,
  useNativeChatRestartOfferSources
} from './native-chat-restart-offer-triggers'
import {
  useAutomaticPromptTurn,
  usePromptBlockingDialog
} from './automatic-prompts/use-automatic-prompt-turn'
import { useNativeChatResumeLaunchDiscovery } from './native-chat-resume-launch-discovery'

/**
 * Whether the resume dialog is on screen, and over which machines. Starts every source of offers,
 * takes the launch's turn among the dialogs that open by themselves, and records what the dialog
 * shows as decided.
 */
export function useNativeChatResumeDialogOpening(): {
  machines: MachineView[]
  request: NativeChatResumeOnRestartDialogRequest | null
  showing: boolean
} {
  const localEnabled = useNativeChatRestartOfferEnabled()
  useNativeChatRestartOfferSources(localEnabled)
  const offers = useNativeChatRestartOffers()
  const machines = useMachineViews(offers)
  // Open is an external request, never mirrored into local state: the launch load, the status-bar
  // entry and a reconnect toast all raise it, and a copy here would go stale against the last one.
  const request = useSyncExternalStore(
    subscribeNativeChatResumeOnRestartDialog,
    getNativeChatResumeOnRestartDialogRequest,
    getNativeChatResumeOnRestartDialogRequest
  )
  // Only a dialog that can render asks for a turn, so a hidden one never holds others back.
  const renderable = machines.length > 0
  // Raised by this computer's launch, it takes its turn among the dialogs that open by themselves,
  // and only while this computer offers the user's own chats: it never opens by itself for a
  // server, an automation or another device. Once on screen it stays until the user closes it.
  // Opened by the user (status bar, toast), it shows at once and the others wait for it.
  const launchWanted =
    request?.origin === 'launch' &&
    (request.shown === true || hasOwnCandidate(offers.get(LOCAL_RESTART_MACHINE)))
  const [launchTurn, markLaunchShown] = useAutomaticPromptTurn('native-chat-resume', launchWanted)
  usePromptBlockingDialog('native-chat-resume', request?.origin === 'user' && renderable)
  // After the turn request above (effects run in order), so nothing takes the first turn between.
  // Only this computer's read is waited on; a paired server's read never holds the launch turn.
  useNativeChatResumeLaunchDiscovery(localEnabled)
  const open = request?.origin === 'user' || (launchTurn && launchWanted)
  useEffect(() => {
    if (launchTurn && launchWanted) {
      markLaunchShown()
      markNativeChatResumeLaunchRequestShown()
    }
  }, [launchTurn, markLaunchShown, launchWanted])
  // What the open dialog shows is decided: a later read of a paired server does not announce it,
  // and a restart toast still up goes, since the dialog lists its chats and blocks clicks on it.
  const showing = Boolean(request && open && renderable)
  useEffect(() => {
    if (showing) {
      markNativeChatRestartOffersShown(
        machines.map((machine) => ({
          machine: machine.machine,
          candidates: machine.offer.candidates
        }))
      )
      dismissReconnectRestartOffers(machines.map((machine) => machine.machine))
    }
  }, [showing, machines])
  return { machines, request, showing }
}
