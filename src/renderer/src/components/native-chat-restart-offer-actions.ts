import {
  callStructuredAgentSession,
  pairedRestartOffersSupport
} from '@/runtime/structured-agent-session-client'
import { hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'
import {
  announceRestartDismissUnconfirmed,
  announceRestartResults,
  type RestartContinuationOutcome,
  type RestartContinueResult,
  type RestartFailureActions
} from './native-chat-restart-action-notifications'
import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'
import {
  projectRestartMachineRows,
  restartMachineTarget,
  type RestartMachineKey
} from './native-chat-restart-machines'
import { restartMachineName } from './native-chat-restart-machine-name'
import {
  currentRestartMachineFence,
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
  restartTicketPairingCurrent,
  type NativeChatRestartMachineOffer,
  type RestartMachineTicket
} from './native-chat-resume-on-restart-store'

/**
 * Acting on one machine's offer: continue the chats, or turn them down for good.
 *
 * Every action names the chats it means and is sent under the pairing the offer was listed from:
 * a server re-paired since is refused before anything leaves. A restart of the same server needs no
 * fence — its host re-derives which named chats it still offers, and a dismissal names each chat
 * with the interruption it listed, so a newer one is never deleted by an older listing.
 */

/** The machine's listed offer, if it is still the one the caller saw. */
function currentOffer(
  machine: RestartMachineKey,
  expected: RestartMachineFence | undefined
): NativeChatRestartMachineOffer | 'gone' | 'moved' {
  // A caller holding an older listing (a toast) acts only while the machine is paired the same way.
  if (
    expected !== undefined &&
    !sameRestartMachineFence(expected, currentRestartMachineFence(restartMachineTarget(machine)))
  ) {
    return 'moved'
  }
  const offer = getNativeChatRestartOffers().get(machine)
  if (!offer) {
    return 'gone'
  }
  return expected !== undefined && !sameRestartMachineFence(expected, offer.fence) ? 'moved' : offer
}

/** The server was re-paired under the listing, so the call was refused before anything was sent. */
function refusedAsStale(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, 'runtime_environment_changed')
}

/** A later request published first: this answer is not the newest, so ask the host again. */
async function publishOrReread(
  ticket: RestartMachineTicket,
  payload: HostOfferPayload
): Promise<void> {
  const published =
    Array.isArray(payload.sessions) &&
    publishNativeChatRestartAnswer(ticket, payload.sessions, failedFrom(payload))
  if (!published && restartTicketPairingCurrent(ticket)) {
    await readNativeChatRestartMachine(ticket.target)
  }
}

const failureToastActions: RestartFailureActions = {
  show: (machine) => {
    if (getNativeChatRestartOffers().size > 0) {
      requestNativeChatResumeOnRestartDialog('user', machine)
    }
  },
  dismiss: (machine, sessionIds) => {
    void dismissNativeChatRestartOffer(machine, [...sessionIds])
  }
}

type ContinueReply = HostOfferPayload & {
  /** Which chats the host reattached. */
  resumed?: { sessionId: string }[]
  continued: RestartContinuationOutcome[]
}

export type RestartContinueRequest = {
  machine: RestartMachineKey
  sessionIds: readonly string[]
  /** What the notices count; by default the named chats. */
  reported?: readonly string[]
}

async function continueOnMachine(
  request: RestartContinueRequest,
  expected: RestartMachineFence | undefined
): Promise<RestartContinueResult> {
  const { machine, sessionIds } = request
  const reported = request.reported ?? sessionIds
  const target = restartMachineTarget(machine)
  const base = {
    machine,
    requested: reported,
    ...(target.kind === 'local' ? {} : { machineName: restartMachineName(machine) })
  }
  const offer = currentOffer(machine, expected)
  if (offer === 'gone') {
    return { ...base, kind: 'answered', results: [], hostFailed: [] }
  }
  if (offer === 'moved') {
    return { ...base, kind: 'not-sent' }
  }
  const { ticket, settle } = beginNativeChatRestartAction(target, reported)
  try {
    if (!sameRestartMachineFence(ticket.fence, offer.fence)) {
      return { ...base, kind: 'not-sent' }
    }
    const params = { sessionIds: [...sessionIds] }
    const callFence = restartMachineCallFence(target, offer.fence)
    const result = await (callFence
      ? callStructuredAgentSession<ContinueReply>(
          target,
          'agentSession.restartContinue',
          params,
          callFence
        )
      : callStructuredAgentSession<ContinueReply>(target, 'agentSession.restartContinue', params))
    await publishOrReread(ticket, result)
    if (!Array.isArray(result.continued)) {
      // A shape this side did not expect: the message may well have gone out.
      return { ...base, kind: 'unconfirmed' }
    }
    return {
      ...base,
      kind: 'answered',
      results: result.continued,
      hostFailed: Array.isArray(result.failed)
        ? projectRestartMachineRows(target, failedFrom(result))
        : undefined
    }
  } catch (error) {
    await readNativeChatRestartMachine(target)
    return { ...base, kind: refusedAsStale(error) ? 'not-sent' : 'unconfirmed' }
  } finally {
    settle()
  }
}

/**
 * Reattach the named chats on each machine, ask each agent to carry on, then replace each machine's
 * offer with its host's authoritative remaining list. One click is one notice, however many
 * machines it reached.
 *
 * `sessionIds` always names the chats: an action never continues one this side did not choose,
 * which on a shared server could be another device's. `expected` is the listing a caller saw (a
 * toast), which acts only while the machine is still paired that way. `quiet` is a resume nobody
 * clicked (opted in), whose notice leaves out chats that no longer needed it.
 *
 * Never rejects. The payload is unvalidated, and a shape this side did not expect is reported as
 * an unconfirmed delivery — the message may well have gone out.
 */
export async function continueNativeChatRestartOffers(
  requests: readonly RestartContinueRequest[],
  options: { expected?: RestartMachineFence; quiet?: boolean } = {}
): Promise<void> {
  const results = await Promise.all(
    requests
      .filter((request) => request.sessionIds.length > 0)
      .map((request) => continueOnMachine(request, options.expected))
  )
  announceRestartResults(results, failureToastActions, { quiet: options.quiet })
}

/** The offers a named dismissal lists back to the host, each with the interruption it showed. */
function listedOffers(offer: NativeChatRestartMachineOffer, sessionIds: readonly string[]) {
  const named = new Set(sessionIds)
  return [...offer.candidates, ...offer.failed]
    .filter((row) => named.has(row.sessionId))
    .map((row) => ({ sessionId: row.sessionId, recordedAt: row.recordedAt }))
}

/**
 * Turning offers down for good, which explicitly deletes the durable records.
 *
 * This computer may dismiss everything it listed by naming nothing. A paired server is always told
 * which chats: unnamed, its dismissal would delete every device's offers. A server is only ever
 * listed when it advertises named dismissal, so one that does not is never sent one.
 *
 * A failed write or unreachable host leaves the durable record untouched and says so; a later read
 * can restore the offer after the host is available again.
 */
export async function dismissNativeChatRestartOffer(
  machine: RestartMachineKey,
  sessionIds?: readonly string[],
  expected?: RestartMachineFence
): Promise<void> {
  const offer = currentOffer(machine, expected)
  if (offer === 'gone') {
    return
  }
  if (offer === 'moved') {
    announceRestartDismissUnconfirmed()
    return
  }
  const target = restartMachineTarget(machine)
  const named =
    target.kind === 'environment'
      ? (sessionIds ?? [...offer.candidates, ...offer.failed].map((row) => row.sessionId))
      : sessionIds
  if (named?.length === 0) {
    return
  }
  if (target.kind === 'environment') {
    // Checked again rather than assumed from the listing: never an unnamed or unknown dismissal.
    const support = await pairedRestartOffersSupport(target.environmentId)
    if (support !== 'supported') {
      void readNativeChatRestartMachine(target)
      announceRestartDismissUnconfirmed()
      return
    }
  }
  const { ticket, settle } = beginNativeChatRestartAction(target)
  try {
    const params = named ? { sessionIds: [...named], offers: listedOffers(offer, named) } : {}
    const callFence = restartMachineCallFence(target, offer.fence)
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
    await publishOrReread(ticket, result)
  } catch {
    await readNativeChatRestartMachine(target)
    announceRestartDismissUnconfirmed()
  } finally {
    settle()
  }
}
