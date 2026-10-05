import { useSyncExternalStore } from 'react'
import {
  callStructuredAgentSession,
  supportsStructuredAgentSessionPairedRestartOffers
} from '@/runtime/structured-agent-session-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type { ResumeCandidate, ResumeFailure } from './native-chat-resume-on-restart-grouping'
import {
  failedFrom,
  hostCannotOffer,
  type HostOfferPayload
} from './native-chat-restart-offer-payload'
import { consumeNativeChatResumeOnRestartDialogRequest } from './native-chat-resume-on-restart-dialog'
import {
  projectRestartMachineRows,
  restartMachineKey,
  restartMachineTarget,
  type RestartMachineKey
} from './native-chat-restart-machines'
import {
  currentRestartMachineFence,
  restartMachineCallFence,
  type RestartMachineFence
} from './native-chat-restart-machine-fence'
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
  /** The pairing and runtime this answer came from; every action on it is sent with it. */
  fence: RestartMachineFence
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
  // With nothing left on any machine, an open request for the dialog has nothing to show.
  if (offers.size === 0) {
    consumeNativeChatResumeOnRestartDialogRequest()
  }
}

/** A confirmed host answer for one machine. */
export function publishNativeChatRestartAnswer(
  target: RuntimeClientTarget,
  candidates: readonly ResumeCandidate[],
  failed: readonly ResumeFailure[],
  fence: RestartMachineFence
): void {
  const machine = restartMachineKey(target)
  publish(machine, {
    machine,
    target,
    fence,
    candidates: projectRestartMachineRows(target, candidates),
    failed: projectRestartMachineRows(target, failed),
    listedAt: Date.now()
  })
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
  const fence = currentRestartMachineFence(target)
  const callFence = restartMachineCallFence(target, fence)
  try {
    const offered = await (callFence
      ? callStructuredAgentSession<HostOfferPayload>(
          target,
          'agentSession.restartResumable',
          undefined,
          callFence
        )
      : callStructuredAgentSession<HostOfferPayload>(target, 'agentSession.restartResumable'))
    if (!Array.isArray(offered.sessions)) {
      throw new Error('agent_session_restart_offer_invalid')
    }
    const candidates: ResumeCandidate[] = offered.sessions
    const failed = failedFrom(offered)
    if (latest()) {
      publishNativeChatRestartAnswer(target, candidates, failed, fence)
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

/** Bookkeeping for an action (continue or dismiss) on one machine: a re-read racing it is dropped,
 *  and a resume's chats show as in flight until the host answers. Used by the action module. */
export function beginNativeChatRestartAction(
  machine: RestartMachineKey,
  resumingIds?: readonly string[]
): () => void {
  actionsBegun.set(machine, (actionsBegun.get(machine) ?? 0) + 1)
  const batch = resumingIds ? { machine, sessionIds: [...resumingIds] } : null
  if (batch) {
    resumeBatches.add(batch)
    syncResuming()
  }
  return () => {
    actionsSettled.set(machine, (actionsSettled.get(machine) ?? 0) + 1)
    if (batch) {
      resumeBatches.delete(batch)
      syncResuming()
    }
  }
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
