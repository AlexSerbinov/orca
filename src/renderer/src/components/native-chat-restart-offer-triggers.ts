import { useEffect } from 'react'
import { isRuntimeHostContactRevoked } from '../../../shared/runtime-host-status'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import type { ResumeCandidate } from './native-chat-resume-on-restart-grouping'
import {
  LOCAL_RESTART_MACHINE,
  restartMachineKey,
  restartMachineTarget,
  type RestartMachineKey
} from './native-chat-restart-machines'
import { restartMachineName } from './native-chat-restart-machine-name'
import { continueNativeChatRestartOffer } from './native-chat-restart-offer-actions'
import {
  _resetNativeChatRestartOfferState,
  forgetNativeChatRestartMachine,
  getNativeChatRestartOffers,
  readNativeChatRestartMachine,
  type RestartMachineRead
} from './native-chat-resume-on-restart-store'
import {
  resumeCandidateOwnership,
  resumeCandidateOwnershipSettled
} from './native-chat-resume-ownership'
import { requestLaunchResumePrompt } from './native-chat-resume-on-restart-launch-prompt'
import {
  _resetNativeChatResumeOnRestartDialog,
  markNativeChatResumeLaunchDecided,
  requestNativeChatResumeOnRestartDialog
} from './native-chat-resume-on-restart-dialog'
import { sameRestartMachineFence } from './native-chat-restart-machine-fence'
import { announceReconnectRestartOffer } from './native-chat-restart-reconnect-toast'

/**
 * When each machine is asked for its offer, and the one decision a fresh offer makes: ask, resume
 * the user's own chats without asking, or (for a paired server that restarted) say so in a toast.
 *
 * This computer is asked once, at launch. Each paired server is asked on every verified connection
 * — the first, a new runtime, and a return after lost contact — never from its chat status feed,
 * which needs a host that may not exist yet.
 */

const LAUNCH_READ_RETRY_DELAYS_MS = [100, 250, 500] as const
/** How long a paired server's offer waits for its workspaces to load before ownership is judged on
 *  what is known; an unloaded workspace is then `unknown` and never toasted or auto-resumed. */
const OWNERSHIP_SETTLE_TIMEOUT_MS = 5_000

let launch: Promise<void> | undefined
/** Interruptions already continued without asking, this app run: never twice, never retried. */
const attempted = new Set<string>()
/** Interruptions a reconnect toast already named, this app run. */
const announced = new Set<string>()
/** Servers seen restarting whose offer has not been read successfully since: a failed read keeps
 *  the debt, a successful one (or a new pairing) settles it. */
const owedAnnouncement = new Set<string>()

function interruptionKey(machine: RestartMachineKey, candidate: ResumeCandidate): string {
  return `${machine}\u0000${candidate.sessionId}\u0000${candidate.recordedAt}`
}

function autoResumeEnabled(): boolean {
  return useAppStore.getState().settings?.nativeChatResumeWorkOnRestart === true
}

function ownershipSettled(target: RuntimeClientTarget, candidates: readonly ResumeCandidate[]) {
  const state = useAppStore.getState()
  return candidates.every((candidate) => resumeCandidateOwnershipSettled(state, target, candidate))
}

/** Resolves once every candidate's workspace is loaded, or the bounded wait runs out. */
function waitForOwnership(
  target: RuntimeClientTarget,
  candidates: readonly ResumeCandidate[]
): Promise<void> {
  if (ownershipSettled(target, candidates)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, OWNERSHIP_SETTLE_TIMEOUT_MS)
    const unsubscribe = useAppStore.subscribe(() => {
      if (ownershipSettled(target, candidates)) {
        finish()
      }
    })
  })
}

/** The user's own chats among those the machine still offers right now. */
function ownCandidates(
  target: RuntimeClientTarget,
  read: readonly ResumeCandidate[]
): ResumeCandidate[] {
  const machine = restartMachineKey(target)
  const stillOffered = new Set(
    getNativeChatRestartOffers()
      .get(machine)
      ?.candidates.map((candidate) => candidate.sessionId) ?? []
  )
  const state = useAppStore.getState()
  return read.filter(
    (candidate) =>
      stillOffered.has(candidate.sessionId) &&
      resumeCandidateOwnership(state, target, candidate) === 'own'
  )
}

/** "Resume automatically": the user's own chats on this machine, each interruption once. */
async function autoResume(
  machine: RestartMachineKey,
  own: readonly ResumeCandidate[]
): Promise<void> {
  const fresh = own.filter((candidate) => !attempted.has(interruptionKey(machine, candidate)))
  for (const candidate of fresh) {
    attempted.add(interruptionKey(machine, candidate))
  }
  await continueNativeChatRestartOffer(
    machine,
    fresh.map((candidate) => candidate.sessionId)
  )
}

/**
 * This launch's single read of this computer's offer.
 *
 * Runs once however many surfaces mount, so the count and the dialog describe the same answer and
 * an opted-in launch cannot dispatch twice.
 */
async function loadLaunchOffer(): Promise<void> {
  // The preference belongs to this launch's request; later saves cannot dispatch another.
  const resumeWithoutAsking = autoResumeEnabled()
  const target: RuntimeClientTarget = { kind: 'local' }
  let read: RestartMachineRead = await readNativeChatRestartMachine(target)
  // Host startup can race the renderer. Retry only failed reads, never a confirmed empty result,
  // so a transient startup gap does not strand a durable offer or add steady-state polling.
  for (const delay of LAUNCH_READ_RETRY_DELAYS_MS) {
    if (read.kind !== 'unavailable') {
      break
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delay))
    read = await readNativeChatRestartMachine(target)
  }
  // Failures left from an earlier launch are the status bar's to show; only a fresh offer asks.
  if (read.kind !== 'answered' || read.candidates.length === 0) {
    return
  }
  if (!resumeWithoutAsking) {
    requestLaunchResumePrompt(LOCAL_RESTART_MACHINE)
    return
  }
  // Nothing will ask, so other launch prompts need not wait for the resume to settle.
  markNativeChatResumeLaunchDecided()
  await autoResume(LOCAL_RESTART_MACHINE, ownCandidates(target, read.candidates))
}

/** One verified connection to a paired server: read its offer, then auto-resume or announce. */
export async function readPairedMachineOnConnection(
  environmentId: string,
  incarnationChanged: boolean
): Promise<void> {
  const target: RuntimeClientTarget = { kind: 'environment', environmentId }
  const machine = restartMachineKey(target)
  if (incarnationChanged) {
    owedAnnouncement.add(environmentId)
  }
  const read = await readNativeChatRestartMachine(target)
  if (read.kind === 'unavailable') {
    return
  }
  if (read.kind === 'unsupported' || read.candidates.length === 0) {
    owedAnnouncement.delete(environmentId)
    return
  }
  await waitForOwnership(target, read.candidates)
  const own = ownCandidates(target, read.candidates)
  const owed = owedAnnouncement.delete(environmentId)
  if (autoResumeEnabled()) {
    await autoResume(machine, own)
    return
  }
  // Without a restart this desktop can name, the status bar alone carries the offer.
  if (!owed) {
    return
  }
  // The listing the toast names; its buttons act only while the server still answers under it.
  const fence = getNativeChatRestartOffers().get(machine)?.fence
  if (!fence) {
    return
  }
  const fresh = own.filter((candidate) => !announced.has(interruptionKey(machine, candidate)))
  for (const candidate of fresh) {
    announced.add(interruptionKey(machine, candidate))
  }
  announceReconnectRestartOffer({
    machine,
    machineName: restartMachineName(machine),
    own: fresh,
    resume: (sessionIds) =>
      void continueNativeChatRestartOffer(machine, sessionIds, sessionIds, fence),
    show: () => {
      if (sameRestartMachineFence(getNativeChatRestartOffers().get(machine)?.fence, fence)) {
        requestNativeChatResumeOnRestartDialog('user', machine)
      }
    }
  })
}

/** `runtimeId` null marks a pairing that was revoked: whatever answers next is not known to be
 *  the same server restarting. */
type SeenConnection = { key: string; pairingRevision: number | undefined; runtimeId: string | null }
const seenConnections = new Map<string, SeenConnection>()
let stopWatchingConnections: (() => void) | null = null

/**
 * Reads a paired server's offer on each verified connection transition. Loss of contact reads
 * nothing and keeps the offer; only a revoked pairing or a removed server forgets it.
 */
function noticeConnections(state: AppState): void {
  const paired = new Set(state.runtimeEnvironments.map((environment) => environment.id))
  for (const [environmentId, entry] of state.runtimeStatusByEnvironmentId) {
    if (!paired.has(environmentId)) {
      continue
    }
    if (isRuntimeHostContactRevoked(entry)) {
      seenConnections.set(environmentId, {
        key: '',
        pairingRevision: entry.snapshot?.pairingRevision,
        runtimeId: null
      })
      owedAnnouncement.delete(environmentId)
      forgetNativeChatRestartMachine(restartMachineKey({ kind: 'environment', environmentId }))
      continue
    }
    const runtimeId = entry.status?.runtimeId
    if (!runtimeId) {
      continue
    }
    const pairingRevision = entry.snapshot?.pairingRevision
    const key = `${pairingRevision ?? ''}\u0000${runtimeId}\u0000${entry.hostContactEpoch ?? 0}`
    let seen = seenConnections.get(environmentId)
    if (seen?.key === key) {
      continue
    }
    if (seen && seen.pairingRevision !== pairingRevision) {
      // Re-paired under the same id: the old pairing's offers, ticks and toast are not this one's,
      // and nothing proves the new pairing is the same server restarting.
      forgetNativeChatRestartMachine(restartMachineKey({ kind: 'environment', environmentId }))
      owedAnnouncement.delete(environmentId)
      seen = undefined
    }
    // This window's own last sighting first; on its first, the id persisted before this run.
    const previous = seen
      ? seen.runtimeId
      : seenConnections.has(environmentId)
        ? null
        : (entry.snapshot?.priorRuntimeId ?? null)
    seenConnections.set(environmentId, { key, pairingRevision, runtimeId })
    void readPairedMachineOnConnection(environmentId, previous !== null && previous !== runtimeId)
  }
  for (const machine of getNativeChatRestartOffers().keys()) {
    const target = restartMachineTarget(machine)
    if (target.kind === 'environment' && !paired.has(target.environmentId)) {
      seenConnections.delete(target.environmentId)
      owedAnnouncement.delete(target.environmentId)
      forgetNativeChatRestartMachine(machine)
    }
  }
}

function watchPairedConnections(): void {
  // A browser client has no paired servers of its own to ask.
  if (stopWatchingConnections || isWebClientLocation()) {
    return
  }
  let last: AppState | null = null
  const check = (state: AppState): void => {
    if (
      last &&
      last.runtimeStatusByEnvironmentId === state.runtimeStatusByEnvironmentId &&
      last.runtimeEnvironments === state.runtimeEnvironments
    ) {
      return
    }
    last = state
    noticeConnections(state)
  }
  stopWatchingConnections = useAppStore.subscribe(check)
  check(useAppStore.getState())
}

/**
 * Starts every source of restart offers. `localEnabled` gates only this computer's launch read:
 * settings arrive after the first render, so the read waits for the flag rather than being lost.
 */
export function useNativeChatRestartOfferSources(localEnabled: boolean): void {
  useEffect(() => {
    watchPairedConnections()
  }, [])
  useEffect(() => {
    if (localEnabled) {
      // Fetched after mount, never awaited by startup: the workspace is usable first.
      // Decided either way, so other launch prompts stop waiting on this read. Only this
      // computer's read is waited on; a paired server's never holds them.
      launch ??= loadLaunchOffer().finally(markNativeChatResumeLaunchDecided)
    }
  }, [localEnabled])
}

/** @internal - tests need a clean module between cases: every offer, action and trigger. */
export function _resetNativeChatRestartOffer(): void {
  _resetNativeChatRestartOfferState()
  _resetNativeChatResumeOnRestartDialog()
  launch = undefined
  attempted.clear()
  announced.clear()
  owedAnnouncement.clear()
  seenConnections.clear()
  stopWatchingConnections?.()
  stopWatchingConnections = null
}
