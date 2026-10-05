import {
  callStructuredAgentSession,
  supportsStructuredAgentSessionPairedRestartOffers
} from '@/runtime/structured-agent-session-client'
import { hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'
import {
  announceRestartDismissUnconfirmed,
  announceRestartResults,
  announceRestartUnconfirmed,
  type RestartContinuationOutcome
} from './native-chat-restart-action-notifications'
import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'
import {
  projectRestartMachineRows,
  restartMachineTarget,
  type RestartMachineKey
} from './native-chat-restart-machines'
import { restartMachineName } from './native-chat-restart-machine-name'
import {
  restartMachineCallFence,
  sameRestartMachineFence,
  type RestartMachineFence
} from './native-chat-restart-machine-fence'
import { failedFrom, type HostOfferPayload } from './native-chat-restart-offer-payload'
import {
  beginNativeChatRestartAction,
  getNativeChatRestartOffers,
  publishNativeChatRestartAnswer,
  readNativeChatRestartMachine,
  type NativeChatRestartMachineOffer
} from './native-chat-resume-on-restart-store'

/**
 * Acting on one machine's offer: continue the chats, or turn them down for good.
 *
 * Every action is aimed at the offer this desktop listed, under the pairing and runtime it was
 * listed from: a server re-paired or restarted since refuses the call before it runs, so a click
 * on an old list can never act on a newer incarnation's chats. A caller holding a fence from an
 * earlier listing (a toast) acts only while the machine still answers under that fence.
 */

/** The machine's listed offer, if it is still the one the caller saw. */
function currentOffer(
  machine: RestartMachineKey,
  expected: RestartMachineFence | undefined
): NativeChatRestartMachineOffer | undefined {
  const offer = getNativeChatRestartOffers().get(machine)
  if (!offer || (expected !== undefined && !sameRestartMachineFence(expected, offer.fence))) {
    return undefined
  }
  return offer
}

/** The server changed under the listing, so the call was refused before anything was sent. */
function refusedAsStale(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, 'runtime_environment_changed')
}

function failureToastActions(machine: RestartMachineKey, fence: RestartMachineFence) {
  return {
    show: () => {
      if (currentOffer(machine, fence)) {
        requestNativeChatResumeOnRestartDialog(machine)
      }
    },
    dismiss: (sessionIds: readonly string[]) => {
      void dismissNativeChatRestartOffer(machine, [...sessionIds], fence)
    }
  }
}

/**
 * Reattach the named chats on one machine, ask each agent to carry on, then replace that machine's
 * offer with its host's authoritative remaining list.
 *
 * `sessionIds` always names the chats: an action never continues one this side did not choose,
 * which on a shared server could be another device's. `reported` is what the toasts count.
 *
 * Never rejects. The payload is unvalidated, and a shape this side did not expect is reported as
 * an unconfirmed delivery — the message may well have gone out.
 */
export async function continueNativeChatRestartOffer(
  machine: RestartMachineKey,
  sessionIds: readonly string[],
  reported: readonly string[] = sessionIds,
  expected?: RestartMachineFence
): Promise<void> {
  const offer = currentOffer(machine, expected)
  if (sessionIds.length === 0 || !offer) {
    return
  }
  const target = restartMachineTarget(machine)
  const callFence = restartMachineCallFence(target, offer.fence)
  const machineName = target.kind === 'local' ? undefined : restartMachineName(machine)
  const settle = beginNativeChatRestartAction(machine, reported)
  try {
    const params = { sessionIds: [...sessionIds] }
    const result = await (callFence
      ? callStructuredAgentSession<ContinueReply>(
          target,
          'agentSession.restartContinue',
          params,
          callFence
        )
      : callStructuredAgentSession<ContinueReply>(target, 'agentSession.restartContinue', params))
    const failed = projectRestartMachineRows(target, failedFrom(result))
    announceRestartResults(
      reported,
      result.continued,
      Array.isArray(result.failed) ? failed : undefined,
      failureToastActions(machine, offer.fence),
      machineName
    )
    if (Array.isArray(result.sessions)) {
      publishNativeChatRestartAnswer(target, result.sessions, failedFrom(result), offer.fence)
    } else {
      await readNativeChatRestartMachine(target)
    }
  } catch (error) {
    await readNativeChatRestartMachine(target)
    if (!refusedAsStale(error)) {
      announceRestartUnconfirmed(reported.length)
    }
  } finally {
    settle()
  }
}

type ContinueReply = HostOfferPayload & {
  /** Which chats the host reattached. */
  resumed?: { sessionId: string }[]
  continued: RestartContinuationOutcome[]
}

/**
 * Turning offers down for good, which explicitly deletes the durable records.
 *
 * This computer may dismiss everything it listed by naming nothing. A paired server is always told
 * which chats: unnamed, its dismissal would delete every device's offers. A server is only ever
 * listed when it advertises named dismissal, so one that does not is never sent one.
 *
 * A failed write or unreachable host leaves the durable record untouched; a later read can restore
 * the offer after the host is available again.
 */
export async function dismissNativeChatRestartOffer(
  machine: RestartMachineKey,
  sessionIds?: readonly string[],
  expected?: RestartMachineFence
): Promise<void> {
  const offer = currentOffer(machine, expected)
  if (!offer) {
    return
  }
  const target = restartMachineTarget(machine)
  let named = sessionIds
  if (target.kind === 'environment') {
    named = sessionIds ?? [...offer.candidates, ...offer.failed].map((row) => row.sessionId)
    // Checked again rather than assumed from the listing: never an unnamed or unknown dismissal.
    if (named.length === 0 || !(await supportsStructuredAgentSessionPairedRestartOffers(target))) {
      return
    }
  }
  const callFence = restartMachineCallFence(target, offer.fence)
  const settle = beginNativeChatRestartAction(machine)
  try {
    const params = named ? { sessionIds: [...named] } : {}
    const result = await (callFence
      ? callStructuredAgentSession<HostOfferPayload>(
          target,
          'agentSession.restartResumableDismiss',
          params,
          callFence
        )
      : callStructuredAgentSession<HostOfferPayload>(
          target,
          'agentSession.restartResumableDismiss',
          params
        ))
    if (Array.isArray(result.sessions)) {
      publishNativeChatRestartAnswer(target, result.sessions, failedFrom(result), offer.fence)
    } else {
      await readNativeChatRestartMachine(target)
    }
  } catch (error) {
    await readNativeChatRestartMachine(target)
    if (!refusedAsStale(error)) {
      announceRestartDismissUnconfirmed()
    }
  } finally {
    settle()
  }
}
