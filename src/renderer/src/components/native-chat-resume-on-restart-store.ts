import { useSyncExternalStore } from 'react'
import {
  callStructuredAgentSession,
  supportsStructuredAgentSessionPairedRestartOffers
} from '@/runtime/structured-agent-session-client'
import { hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  announceRestartDismissNeedsUpdate,
  announceRestartDismissUnconfirmed,
  announceRestartResults,
  announceRestartUnconfirmed,
  type RestartContinuationOutcome
} from './native-chat-restart-action-notifications'
import type { ResumeCandidate, ResumeFailure } from './native-chat-resume-on-restart-grouping'
import {
  consumeNativeChatResumeOnRestartDialogRequest,
  requestNativeChatResumeOnRestartDialog
} from './native-chat-resume-on-restart-dialog'
import {
  projectRestartMachineRows,
  restartMachineKey,
  restartMachineTarget,
  type RestartMachineKey
} from './native-chat-restart-machines'
import { restartMachineName } from './native-chat-restart-machine-name'
import {
  releaseOfferedChatWatches,
  syncOfferedChatWatch
} from './native-chat-restart-offer-activity-watch'

/**
 * Which interrupted chats each machine is still offering to resume, and every action that moves
 * that. A machine is this computer or one paired server; each answers for its own chats.
 *
 * The offer is each HOST's answer, shared by the dialog, the status bar and the reconnect toast
 * rather than held by whichever rendered first. Opening a chat is intentionally read-only; only an
 * explicit action changes the durable offer.
 */

export type NativeChatRestartMachineOffer = Readonly<{
  machine: RestartMachineKey
  target: RuntimeClientTarget
  /** Host ids already in this desktop's terms (a paired server's `local` is its runtime host). */
  candidates: readonly ResumeCandidate[]
  /** Acted-on offers whose agent did not carry on, as the host still records them. */
  failed: readonly ResumeFailure[]
  /** Stamped when the list arrived. Row ages read against this rather than a render-time
   *  `Date.now()`, so they stay stable across re-renders and the render stays pure. */
  listedAt: number
}>

export type NativeChatRestartOffers = ReadonlyMap<RestartMachineKey, NativeChatRestartMachineOffer>

/** `unavailable` is not an answer: the machine keeps the last one it gave. `unsupported` is an
 *  older or chat-less host that has no offers to give. */
export type RestartMachineRead =
  | { kind: 'answered'; candidates: readonly ResumeCandidate[]; failed: readonly ResumeFailure[] }
  | { kind: 'unsupported' }
  | { kind: 'unavailable' }

const NO_OFFERS: NativeChatRestartOffers = new Map()
let offers: NativeChatRestartOffers = NO_OFFERS
/** Per machine: continue and dismiss calls begun and settled. Each ends by publishing the host's
 *  answer, which a re-read that raced it must neither pre-empt nor undo. */
const actionsBegun = new Map<RestartMachineKey, number>()
const actionsSettled = new Map<RestartMachineKey, number>()
/** Per machine: the newest read issued, so an older answer arriving late never wins. */
const readsIssued = new Map<RestartMachineKey, number>()
/** The chats each in-flight continue call names, per machine, so the status bar can report the
 *  resume after the dialog that started it has closed. Held only for the call's lifetime. */
const resumeBatches = new Set<{ machine: RestartMachineKey; sessionIds: readonly string[] }>()
const NOTHING_RESUMING: ReadonlyMap<RestartMachineKey, readonly string[]> = new Map()
let resuming = NOTHING_RESUMING
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function hasRows(offer: NativeChatRestartMachineOffer | undefined): boolean {
  return Boolean(offer && (offer.candidates.length > 0 || offer.failed.length > 0))
}

/** The snapshot object is replaced HERE and nowhere else — never during a render — so every
 *  `useSyncExternalStore` reader sees the same reference until a host answer or a user action
 *  actually moves an offer. */
function publish(machine: RestartMachineKey, next: NativeChatRestartMachineOffer | null): void {
  const updated = new Map(offers)
  if (next && hasRows(next)) {
    updated.set(machine, next)
  } else {
    updated.delete(machine)
  }
  offers = updated.size === 0 ? NO_OFFERS : updated
  syncOfferedChatWatch(machine, offers.get(machine), refreshAfterOfferedChatActivity)
  emit()
}

/** A confirmed host answer. Once no machine has anything left, any open request for the dialog is
 *  retired too: it has nothing to show. */
function publishAnswer(
  target: RuntimeClientTarget,
  candidates: readonly ResumeCandidate[],
  failed: readonly ResumeFailure[]
): void {
  const machine = restartMachineKey(target)
  publish(machine, {
    machine,
    target,
    candidates: projectRestartMachineRows(target, candidates),
    failed: projectRestartMachineRows(target, failed),
    listedAt: Date.now()
  })
  if (offers.size === 0) {
    consumeNativeChatResumeOnRestartDialogRequest()
  }
}

function syncResuming(): void {
  const byMachine = new Map<RestartMachineKey, string[]>()
  for (const batch of resumeBatches) {
    const ids = byMachine.get(batch.machine) ?? []
    byMachine.set(batch.machine, [...new Set([...ids, ...batch.sessionIds])])
  }
  resuming = byMachine.size === 0 ? NOTHING_RESUMING : byMachine
  emit()
}

function actionsIdle(machine: RestartMachineKey): boolean {
  return (actionsBegun.get(machine) ?? 0) === (actionsSettled.get(machine) ?? 0)
}

function refreshAfterOfferedChatActivity(machine: RestartMachineKey): void {
  if (!actionsIdle(machine)) {
    return
  }
  const issued = actionsBegun.get(machine) ?? 0
  void readNativeChatRestartMachine(
    restartMachineTarget(machine),
    () => (actionsBegun.get(machine) ?? 0) === issued
  )
}

export function getNativeChatRestartOffers(): NativeChatRestartOffers {
  return offers
}

export function getNativeChatRestartResuming(): ReadonlyMap<RestartMachineKey, readonly string[]> {
  return resuming
}

export function subscribeNativeChatRestartOffers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The host's answer as this side understands it. `failed` is optional on the wire: an older host
 *  never sends it, and its absence means nothing to show, not an invalid answer. */
type HostOfferPayload = { sessions?: unknown; failed?: unknown }

function failedFrom(payload: HostOfferPayload): ResumeFailure[] {
  // SAFETY: the host is the single writer of this shape; a malformed row is a host bug, not input.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: see above.
  return Array.isArray(payload.failed) ? (payload.failed as ResumeFailure[]) : []
}

/** A host that cannot hold restart offers at all: it predates the method, or has no structured
 *  chat surface for this client. Distinct from a read that failed, which proves nothing. */
function hostCannotOffer(error: unknown): boolean {
  return (
    hasRuntimeRpcErrorCode(error, 'method_not_found') ||
    (error instanceof Error && error.message.includes('structured_agent_session_unsupported'))
  )
}

/**
 * Re-reads one machine's answer.
 *
 * A failed read is not an answer and leaves that machine's last answer in place: loss of contact
 * is never evidence the offer is gone, and an action re-derives eligibility on the host anyway.
 */
export async function readNativeChatRestartMachine(
  target: RuntimeClientTarget,
  current: () => boolean = () => true
): Promise<RestartMachineRead> {
  // Asking a paired host that cannot answer without building its chat host would open its journal
  // on a server that may never have run a chat; such a host is never asked.
  if (
    target.kind === 'environment' &&
    !(await supportsStructuredAgentSessionPairedRestartOffers(target))
  ) {
    return { kind: 'unsupported' }
  }
  const machine = restartMachineKey(target)
  const sequence = (readsIssued.get(machine) ?? 0) + 1
  readsIssued.set(machine, sequence)
  const latest = (): boolean => readsIssued.get(machine) === sequence && current()
  try {
    const offered = await callStructuredAgentSession<HostOfferPayload>(
      target,
      'agentSession.restartResumable'
    )
    if (!Array.isArray(offered.sessions)) {
      throw new Error('agent_session_restart_offer_invalid')
    }
    const candidates: ResumeCandidate[] = offered.sessions
    const failed = failedFrom(offered)
    if (latest()) {
      publishAnswer(target, candidates, failed)
    }
    return {
      kind: 'answered',
      candidates: projectRestartMachineRows(target, candidates),
      failed: projectRestartMachineRows(target, failed)
    }
  } catch (error) {
    if (hostCannotOffer(error)) {
      if (latest()) {
        publish(machine, null)
      }
      return { kind: 'unsupported' }
    }
    return { kind: 'unavailable' }
  }
}

/** Re-reads the named machines (by default every machine with something listed), so a count can
 *  never name a chat a host would now refuse. */
export async function refreshNativeChatRestartOffers(
  machines: readonly RestartMachineKey[] = [...offers.keys()]
): Promise<NativeChatRestartOffers> {
  await Promise.all(
    machines.map((machine) => readNativeChatRestartMachine(restartMachineTarget(machine)))
  )
  return offers
}

/** A machine this desktop no longer pairs with: its offers are not this desktop's to show. */
export function forgetNativeChatRestartMachine(machine: RestartMachineKey): void {
  readsIssued.set(machine, (readsIssued.get(machine) ?? 0) + 1)
  if (offers.has(machine)) {
    publish(machine, null)
  }
}

function failureToastActions(machine: RestartMachineKey) {
  return {
    show: () => requestNativeChatResumeOnRestartDialog(machine),
    dismiss: (sessionIds: readonly string[]) => {
      void dismissNativeChatRestartOffer(machine, [...sessionIds])
    }
  }
}

function beginAction(machine: RestartMachineKey): void {
  actionsBegun.set(machine, (actionsBegun.get(machine) ?? 0) + 1)
}

function settleAction(machine: RestartMachineKey): void {
  actionsSettled.set(machine, (actionsSettled.get(machine) ?? 0) + 1)
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
  reported: readonly string[] = sessionIds
): Promise<void> {
  if (sessionIds.length === 0) {
    return
  }
  const target = restartMachineTarget(machine)
  const machineName = target.kind === 'local' ? undefined : restartMachineName(machine)
  beginAction(machine)
  const batch = { machine, sessionIds: [...reported] }
  resumeBatches.add(batch)
  syncResuming()
  try {
    const result = await callStructuredAgentSession<
      HostOfferPayload & {
        /** Which chats the host reattached. */
        resumed?: { sessionId: string }[]
        continued: RestartContinuationOutcome[]
      }
    >(target, 'agentSession.restartContinue', { sessionIds: [...sessionIds] })
    const failed = projectRestartMachineRows(target, failedFrom(result))
    announceRestartResults(
      reported,
      result.continued,
      Array.isArray(result.failed) ? failed : undefined,
      failureToastActions(machine),
      machineName
    )
    if (Array.isArray(result.sessions)) {
      publishAnswer(target, result.sessions, failedFrom(result))
    } else {
      await readNativeChatRestartMachine(target)
    }
  } catch {
    await readNativeChatRestartMachine(target)
    announceRestartUnconfirmed(reported.length)
  } finally {
    settleAction(machine)
    resumeBatches.delete(batch)
    syncResuming()
  }
}

/**
 * Turning offers down for good, which explicitly deletes the durable records.
 *
 * This computer may dismiss everything it listed by naming nothing. A paired server is always told
 * which chats: unnamed, its dismissal would delete every device's offers there. A server too old to
 * take names is sent nothing at all, and says so.
 *
 * A failed write or unreachable host leaves the durable record untouched; a later read can restore
 * the offer after the host is available again.
 */
export async function dismissNativeChatRestartOffer(
  machine: RestartMachineKey,
  sessionIds?: readonly string[]
): Promise<void> {
  const target = restartMachineTarget(machine)
  if (target.kind === 'environment') {
    const named = sessionIds ?? allListedSessionIds(machine)
    if (named.length === 0) {
      return
    }
    if (!(await supportsStructuredAgentSessionPairedRestartOffers(target))) {
      announceRestartDismissNeedsUpdate(restartMachineName(machine))
      return
    }
    sessionIds = named
  }
  beginAction(machine)
  try {
    const result = await callStructuredAgentSession<HostOfferPayload>(
      target,
      'agentSession.restartResumableDismiss',
      sessionIds ? { sessionIds: [...sessionIds] } : {}
    )
    if (Array.isArray(result.sessions)) {
      publishAnswer(target, result.sessions, failedFrom(result))
    } else {
      await readNativeChatRestartMachine(target)
    }
  } catch {
    await readNativeChatRestartMachine(target)
    announceRestartDismissUnconfirmed()
  } finally {
    settleAction(machine)
  }
}

function allListedSessionIds(machine: RestartMachineKey): string[] {
  const offer = offers.get(machine)
  return offer ? [...offer.candidates, ...offer.failed].map((row) => row.sessionId) : []
}

export function useNativeChatRestartOffers(): NativeChatRestartOffers {
  return useSyncExternalStore(
    subscribeNativeChatRestartOffers,
    getNativeChatRestartOffers,
    getNativeChatRestartOffers
  )
}

/** The chats a resume is carrying on right now, per machine, whichever surface started it. */
export function useNativeChatRestartResuming(): ReadonlyMap<RestartMachineKey, readonly string[]> {
  return useSyncExternalStore(
    subscribeNativeChatRestartOffers,
    getNativeChatRestartResuming,
    getNativeChatRestartResuming
  )
}

/** @internal - tests need a clean module between cases. */
export function _resetNativeChatRestartOfferState(): void {
  releaseOfferedChatWatches()
  offers = NO_OFFERS
  resumeBatches.clear()
  resuming = NOTHING_RESUMING
  actionsBegun.clear()
  actionsSettled.clear()
  readsIssued.clear()
  listeners.clear()
}
