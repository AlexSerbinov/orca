// @vitest-environment happy-dom

import { toast } from 'sonner'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { useAppStore } from '../store'
import type { ResumeCandidate } from './native-chat-resume-on-restart-grouping'
import {
  consumeNativeChatResumeOnRestartDialogRequest,
  getNativeChatResumeLaunchDecided,
  getNativeChatResumeOnRestartDialogRequest
} from './native-chat-resume-on-restart-dialog'
import {
  getNativeChatRestartOffers,
  readNativeChatRestartMachine
} from './native-chat-resume-on-restart-store'
import {
  continueNativeChatRestartOffer,
  dismissNativeChatRestartOffer
} from './native-chat-restart-offer-actions'
import {
  _resetNativeChatRestartOffer,
  readPairedMachineOnConnection,
  useNativeChatRestartOfferSources
} from './native-chat-restart-offer-triggers'
import { renderHook } from '@testing-library/react'
import type { Worktree } from '../../../shared/worktree/types'
import { makeWorktree } from '../store/slices/store-test-helpers'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import {
  AUTOMATION_PROVENANCE,
  pairedEnvironment,
  verifiedConnection
} from './native-chat-restart-offer-test-support'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), supported: vi.fn(async () => true) }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.rpc,
  supportsStructuredAgentSessionPairedRestartOffers: mocks.supported,
  subscribeStructuredAgentSessionStatus: () => new Promise(() => {})
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))

const SERVER = 'studio'
const MACHINE = `environment:${SERVER}`
const MY_DEVICE = 'device-me'

function row(sessionId: string, workspaceId: string, trigger: 'quit' | 'update' = 'update') {
  return {
    sessionId,
    workspaceId,
    agent: 'codex',
    trigger,
    latestPrompt: `Prompt ${sessionId}`,
    recordedAt: 1_800_000_000_000,
    // The server's own terms: its host is `local` there.
    executionHostId: 'local',
    workspaceKind: 'git-worktree'
  } satisfies ResumeCandidate
}

/** Workspaces as this desktop knows them on the server, by who created them. */
type Provenance = Pick<Worktree, 'creatorProvenance' | 'automationProvenance'>
const provenance: Record<string, Provenance> = {
  mine: { creatorProvenance: { kind: 'paired-device', deviceId: MY_DEVICE } },
  theirs: { creatorProvenance: { kind: 'paired-device', deviceId: 'device-other' } },
  robot: {
    creatorProvenance: { kind: 'paired-device', deviceId: MY_DEVICE },
    automationProvenance: AUTOMATION_PROVENANCE
  },
  server: { creatorProvenance: { kind: 'host' } },
  legacy: {}
}
const lookups: [string, string | undefined][] = []

function stageServer(status: {
  runtimeId: string
  epoch?: number
  priorRuntimeId?: string | null
  pairingRevision?: number
}) {
  const pairingRevision = status.pairingRevision ?? 1
  replaceRuntimeEnvironmentRevisions([{ id: SERVER, createdAt: 1, pairingRevision }])
  useAppStore.setState({
    runtimeEnvironments: [pairedEnvironment(SERVER, 'studio-mac', MY_DEVICE)],
    runtimeStatusByEnvironmentId: new Map([
      [
        SERVER,
        verifiedConnection({
          environmentId: SERVER,
          runtimeId: status.runtimeId,
          pairedDeviceId: MY_DEVICE,
          hostContactEpoch: status.epoch,
          priorRuntimeId: status.priorRuntimeId,
          pairingRevision
        })
      ]
    ])
  })
}

function continueCalls(): unknown[] {
  return mocks.rpc.mock.calls
    .filter(([, method]) => method === 'agentSession.restartContinue')
    .map(([target, , params]) => [target, params])
}

function offerReads(): number {
  return mocks.rpc.mock.calls.filter(([, method]) => method === 'agentSession.restartResumable')
    .length
}

/** Sonner types a toast button as a labelled action or arbitrary content; only the former can be
 *  pressed. */
function press(entry: unknown): void {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('onClick' in entry) ||
    typeof entry.onClick !== 'function'
  ) {
    throw new Error('toast button is not clickable')
  }
  entry.onClick()
}

function label(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null && 'label' in entry ? entry.label : undefined
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

beforeEach(() => {
  vi.mocked(toast).mockClear()
  mocks.rpc.mockReset()
  mocks.supported.mockReset()
  mocks.supported.mockResolvedValue(true)
  lookups.length = 0
  _resetNativeChatRestartOffer()
  consumeNativeChatResumeOnRestartDialogRequest()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: { ...getDefaultSettings(''), experimentalStructuredNativeChat: false },
    getKnownWorktreeById: (id, hostId) => {
      lookups.push([id, hostId])
      const known = provenance[id]
      // Only who made it matters here; the rest of the row is the sidebar's.
      return known ? makeWorktree({ id, repoId: 'repo', ...known }) : undefined
    }
  })
  mocks.rpc.mockImplementation(async (_target, method) =>
    method === 'agentSession.restartResumable'
      ? { sessions: [row('a', 'mine'), row('b', 'theirs')], failed: [] }
      : { continued: [], sessions: [] }
  )
})

afterEach(() => {
  _resetNativeChatRestartOffer()
  consumeNativeChatResumeOnRestartDialogRequest()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it("rewrites a server's rows to its runtime host, so its workspaces are found under it", async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, false)
  const offer = getNativeChatRestartOffers().get(MACHINE)
  expect(offer?.candidates.map((candidate) => candidate.executionHostId)).toEqual([
    'runtime:studio',
    'runtime:studio'
  ])
  expect(lookups).toContainEqual(['mine', 'runtime:studio'])
})

it('toasts once, for own chats only, when the server restarted', async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  expect(vi.mocked(toast).mock.calls).toEqual([
    [
      'studio-mac restarted for an update',
      expect.objectContaining({
        description:
          '1 of your chats there was stopped mid-reply. It shows where it stopped, and nothing was lost.'
      })
    ]
  ])
  // The same interruption read again (another flap, another restart edge) is never announced twice.
  await readPairedMachineOnConnection(SERVER, true)
  expect(toast).toHaveBeenCalledTimes(1)
})

it('names a plain quit by the server being restarted', async () => {
  mocks.rpc.mockResolvedValue({ sessions: [row('a', 'mine', 'quit')] })
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  expect(vi.mocked(toast).mock.calls[0]?.[0]).toBe('Orca on studio-mac was restarted')
})

it('raises no toast without a restart this desktop can name', async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, false)
  expect(toast).not.toHaveBeenCalled()
  // The status bar still carries it.
  expect(getNativeChatRestartOffers().get(MACHINE)?.candidates).toHaveLength(2)
})

it('raises no toast when none of the chats are provably the user’s', async () => {
  mocks.rpc.mockResolvedValue({
    sessions: [row('a', 'theirs'), row('b', 'robot'), row('c', 'server'), row('d', 'legacy')]
  })
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  expect(toast).not.toHaveBeenCalled()
})

it("the toast's buttons resume exactly the own chats there, or open the dialog on that server", async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  const options = vi.mocked(toast).mock.calls[0]?.[1]
  expect([label(options?.action), label(options?.cancel)]).toEqual(['Resume 1 chat', 'Show chats'])
  press(options?.cancel)
  expect(getNativeChatResumeOnRestartDialogRequest()).toEqual({ origin: 'user', focus: MACHINE })
  press(options?.action)
  await settle()
  expect(continueCalls()).toEqual([
    [{ kind: 'environment', environmentId: SERVER }, { sessionIds: ['a'] }]
  ])
})

it('resumes only own chats without asking, once per interruption, when the preference is on', async () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings(''), nativeChatResumeWorkOnRestart: true }
  })
  mocks.rpc.mockImplementation(async (_target, method) =>
    method === 'agentSession.restartResumable'
      ? { sessions: [row('a', 'mine'), row('b', 'legacy'), row('c', 'robot')] }
      : { continued: [{ sessionId: 'a', outcome: 'refused' }], sessions: [] }
  )
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  await readPairedMachineOnConnection(SERVER, true)
  expect(continueCalls()).toEqual([
    [{ kind: 'environment', environmentId: SERVER }, { sessionIds: ['a'] }]
  ])
  // The result toast says where; no reconnect toast on top of it.
  expect(vi.mocked(toast).mock.calls.map(([title]) => title)).not.toContain(
    'studio-mac restarted for an update'
  )
})

it('never asks a server that does not advertise paired restart offers', async () => {
  mocks.supported.mockResolvedValue(false)
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  expect(offerReads()).toBe(0)
  expect(getNativeChatRestartOffers().size).toBe(0)
})

it("keeps a server's offer through a failed read, and drops it only for an unsupported host", async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, false)
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost'))
  expect(
    (await readNativeChatRestartMachine({ kind: 'environment', environmentId: SERVER })).kind
  ).toBe('unavailable')
  expect(getNativeChatRestartOffers().get(MACHINE)?.candidates).toHaveLength(2)
  mocks.rpc.mockRejectedValueOnce(
    Object.assign(new Error('Unknown method'), { code: 'method_not_found' })
  )
  expect(
    (await readNativeChatRestartMachine({ kind: 'environment', environmentId: SERVER })).kind
  ).toBe('unsupported')
  expect(getNativeChatRestartOffers().has(MACHINE)).toBe(false)
})

it('names every chat when dismissing on a server, and sends nothing to a server that cannot', async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, false)
  mocks.supported.mockResolvedValue(false)
  await dismissNativeChatRestartOffer(MACHINE)
  expect(mocks.rpc.mock.calls.map(([, method]) => method)).not.toContain(
    'agentSession.restartResumableDismiss'
  )
  mocks.supported.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ dismissed: 2, sessions: [], failed: [] })
  await dismissNativeChatRestartOffer(MACHINE)
  expect(mocks.rpc.mock.calls.at(-1)?.slice(1)).toEqual([
    'agentSession.restartResumableDismiss',
    { sessionIds: ['a', 'b'] },
    { expectedEnvironmentPairingRevision: 1, expectedEnvironmentRuntimeId: 'r2' }
  ])
})

it('acts under the pairing and runtime the offer was listed from, not the ones current at the click', async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, true)
  const options = vi.mocked(toast).mock.calls[0]?.[1]
  // The server restarts (same pairing) before the click: the listing still names r2.
  stageServer({ runtimeId: 'r3' })
  press(options?.action)
  await settle()
  const sent = mocks.rpc.mock.calls.find(([, method]) => method === 'agentSession.restartContinue')
  expect(sent?.[3]).toEqual({
    expectedEnvironmentPairingRevision: 1,
    expectedEnvironmentRuntimeId: 'r2'
  })
})

it('says nothing was unconfirmed when the server refused a stale action before running it', async () => {
  stageServer({ runtimeId: 'r2' })
  await readPairedMachineOnConnection(SERVER, false)
  mocks.rpc.mockImplementation(async (_target, method) => {
    if (method === 'agentSession.restartContinue') {
      throw Object.assign(new Error('runtime_environment_changed'), {
        code: 'runtime_environment_changed'
      })
    }
    return { sessions: [row('a', 'mine')] }
  })
  await continueNativeChatRestartOffer(MACHINE, ['a'])
  expect(vi.mocked(toast).mock.calls.map(([title]) => String(title))).not.toContainEqual(
    expect.stringContaining('unconfirmed')
  )
})

it('retires the old pairing’s offers and toast on a re-pair, even with the same runtime id', async () => {
  stageServer({ runtimeId: 'r2', priorRuntimeId: 'r1' })
  renderHook(() => useNativeChatRestartOfferSources(false))
  await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  const options = vi.mocked(toast).mock.calls[0]?.[1]
  // The new pairing cannot be read yet: nothing from the old one may stand in for its answer.
  mocks.rpc.mockRejectedValue(new Error('connection lost'))
  stageServer({ runtimeId: 'r2', priorRuntimeId: 'r1', pairingRevision: 2 })
  await vi.waitFor(() => expect(getNativeChatRestartOffers().has(MACHINE)).toBe(false))
  press(options?.action)
  press(options?.cancel)
  await settle()
  expect(continueCalls()).toEqual([])
  expect(getNativeChatResumeOnRestartDialogRequest()).toBeNull()
  // A new pairing is not proof of the same server restarting: no toast for it.
  expect(toast).toHaveBeenCalledTimes(1)
})

it('keeps the restart toast owed through a failed read and pays it on the next good one', async () => {
  stageServer({ runtimeId: 'r2' })
  mocks.rpc.mockRejectedValueOnce(new Error('connection lost'))
  await readPairedMachineOnConnection(SERVER, true)
  expect(toast).not.toHaveBeenCalled()
  // The same runtime back after lost contact: no new restart, but the debt is still owed.
  await readPairedMachineOnConnection(SERVER, false)
  expect(toast).toHaveBeenCalledTimes(1)
})

it('retires an owed toast when the server answers that nothing is left', async () => {
  stageServer({ runtimeId: 'r2' })
  mocks.rpc.mockResolvedValueOnce({ sessions: [], failed: [] })
  await readPairedMachineOnConnection(SERVER, true)
  await readPairedMachineOnConnection(SERVER, false)
  expect(toast).not.toHaveBeenCalled()
})

it('reads a server on each verified connection and compares against the id from before this run', async () => {
  stageServer({ runtimeId: 'r2', priorRuntimeId: 'r1' })
  renderHook(() => useNativeChatRestartOfferSources(false))
  await settle()
  await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  expect(offerReads()).toBe(1)
  // A return after lost contact to the same runtime: read again, but no restart to announce.
  mocks.rpc.mockResolvedValue({ sessions: [row('a', 'mine'), row('z', 'mine')] })
  stageServer({ runtimeId: 'r2', priorRuntimeId: 'r1', epoch: 1 })
  await vi.waitFor(() => expect(offerReads()).toBe(2))
  await settle()
  expect(toast).toHaveBeenCalledTimes(1)
  // A newer runtime is a restart: its fresh interruption is announced.
  stageServer({ runtimeId: 'r3', priorRuntimeId: 'r1', epoch: 1 })
  await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(2))
})

it('raises no toast on a first connection with no earlier runtime on record', async () => {
  stageServer({ runtimeId: 'r2', priorRuntimeId: null })
  renderHook(() => useNativeChatRestartOfferSources(false))
  await vi.waitFor(() => expect(offerReads()).toBe(1))
  await settle()
  expect(toast).not.toHaveBeenCalled()
  expect(getNativeChatRestartOffers().has(MACHINE)).toBe(true)
})

it('forgets a server this desktop no longer pairs with', async () => {
  stageServer({ runtimeId: 'r2' })
  renderHook(() => useNativeChatRestartOfferSources(false))
  await vi.waitFor(() => expect(getNativeChatRestartOffers().has(MACHINE)).toBe(true))
  useAppStore.setState({ runtimeEnvironments: [] })
  expect(getNativeChatRestartOffers().has(MACHINE)).toBe(false)
})

// Only this computer's launch read raises the dialog by itself and decides the launch wait.
it("asks for this computer's launch turn and decides the wait when its read decides", async () => {
  mocks.rpc.mockImplementation(async (target) =>
    target.kind === 'local' ? { sessions: [row('l1', 'here')] } : { sessions: [] }
  )
  expect(getNativeChatResumeLaunchDecided()).toBe(false)
  renderHook(() => useNativeChatRestartOfferSources(true))
  await vi.waitFor(() => expect(getNativeChatResumeLaunchDecided()).toBe(true))
  expect(getNativeChatResumeOnRestartDialogRequest()).toEqual({ origin: 'launch', focus: 'local' })
})

it('never opens the dialog by itself for a paired server, nor counts toward the launch wait', async () => {
  stageServer({ runtimeId: 'r2', priorRuntimeId: 'r1' })
  renderHook(() => useNativeChatRestartOfferSources(false))
  await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  expect(getNativeChatResumeOnRestartDialogRequest()).toBeNull()
  expect(getNativeChatResumeLaunchDecided()).toBe(false)
})
