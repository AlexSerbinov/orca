// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../store'
import { getDefaultSettings } from '../../../shared/constants'
import { NativeChatResumeOnRestartModal } from './NativeChatResumeOnRestartModal'
import { TooltipProvider } from './ui/tooltip'
import type { ResumeCandidate } from './native-chat-resume-on-restart-grouping'
import {
  consumeNativeChatResumeOnRestartDialogRequest,
  requestNativeChatResumeOnRestartDialog
} from './native-chat-resume-on-restart-dialog'
import { readNativeChatRestartMachine } from './native-chat-resume-on-restart-store'
import { _resetNativeChatRestartOffer } from './native-chat-restart-offer-triggers'
import { pairedEnvironment } from './native-chat-restart-offer-test-support'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: rpc,
  supportsStructuredAgentSessionPairedRestartOffers: async () => true,
  subscribeStructuredAgentSessionStatus: () => new Promise(() => {})
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))
// Who made each workspace, by name; the modal's cards then fall back to plain headers.
vi.mock('./native-chat-resume-ownership', async (importActual) => {
  const actual: object = await importActual()
  return {
    ...actual,
    resumeCandidateOwnership: (_state: unknown, _machine: unknown, row: ResumeCandidate) =>
      row.workspaceId.startsWith('mine')
        ? 'own'
        : row.workspaceId.startsWith('robot')
          ? 'automation'
          : 'other-device'
  }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement

function row(sessionId: string, workspaceId: string): ResumeCandidate {
  return {
    sessionId,
    workspaceId,
    agent: 'codex',
    trigger: 'update',
    latestPrompt: `Prompt ${sessionId}`,
    recordedAt: 1_800_000_000_000,
    executionHostId: 'local',
    workspaceKind: 'git-worktree'
  }
}

const LOCAL_ROWS = [row('l1', 'mine-local')]
const SERVER_ROWS = [row('s1', 'mine-server'), row('s2', 'theirs'), row('s3', 'robot')]
const OTHERS_ONLY = [row('o1', 'theirs-too')]

async function stage(servers: Record<string, ResumeCandidate[]>): Promise<void> {
  rpc.mockImplementation(async (target, method) => {
    if (method !== 'agentSession.restartResumable') {
      return { continued: [], sessions: [] }
    }
    return {
      sessions: target.kind === 'local' ? LOCAL_ROWS : (servers[target.environmentId] ?? [])
    }
  })
  await act(async () => {
    await readNativeChatRestartMachine({ kind: 'local' })
    for (const environmentId of Object.keys(servers)) {
      await readNativeChatRestartMachine({ kind: 'environment', environmentId })
    }
  })
}

async function open(focus: string | null): Promise<void> {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <NativeChatResumeOnRestartModal />
      </TooltipProvider>
    )
  )
  await act(async () => requestNativeChatResumeOnRestartDialog('user', focus))
}

function machineToggle(name: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[aria-label="Resume every chat on ${name}"]`)
  if (!found) {
    throw new Error(`Missing machine checkbox: ${name}`)
  }
  return found
}

function machineRow(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(
    (entry) => entry.textContent?.startsWith(name)
  )
  if (!found) {
    throw new Error(`Missing machine row: ${name}`)
  }
  return found
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === text
  )
  if (!found) {
    throw new Error(`Missing button: ${text}`)
  }
  return found
}

function actionCalls(method: string): unknown[] {
  return rpc.mock.calls.filter((call) => call[1] === method).map((call) => [call[0], call[2]])
}

beforeEach(() => {
  rpc.mockReset()
  _resetNativeChatRestartOffer()
  consumeNativeChatResumeOnRestartDialogRequest()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: { ...getDefaultSettings(''), experimentalStructuredNativeChat: false },
    runtimeEnvironments: [
      pairedEnvironment('studio', 'studio-mac'),
      pairedEnvironment('build', 'build-box')
    ]
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  _resetNativeChatRestartOffer()
  consumeNativeChatResumeOnRestartDialogRequest()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('lists each machine with only the user’s own chats ticked, opening the one it was asked for', async () => {
  await stage({ studio: SERVER_ROWS })
  await open('environment:studio')
  expect(machineRow('studio-mac').getAttribute('aria-expanded')).toBe('true')
  expect(machineRow('studio-mac').textContent).toContain('1 of 3 chats selected')
  // This computer's own chats all start ticked, and it stays closed but listed.
  expect(machineRow('Local').getAttribute('aria-expanded')).toBe('false')
  expect(machineToggle('studio-mac').getAttribute('data-state')).toBe('indeterminate')
  expect(document.body.textContent).toContain('Another device')
  expect(document.body.textContent).toContain('Automation')
  expect(button('Resume 2 chats')).toBeTruthy()
})

it('opens a machine with nothing ticked so its empty box is explained', async () => {
  await stage({ studio: SERVER_ROWS, build: OTHERS_ONLY })
  await open(null)
  expect(machineRow('build-box').getAttribute('aria-expanded')).toBe('true')
  expect(machineRow('studio-mac').getAttribute('aria-expanded')).toBe('false')
  expect(machineToggle('build-box').getAttribute('data-state')).toBe('unchecked')
})

it('resumes each machine’s picked chats on that machine, and the machine box picks them all', async () => {
  await stage({ studio: SERVER_ROWS })
  await open('environment:studio')
  await act(async () => machineToggle('studio-mac').click())
  expect(machineToggle('studio-mac').getAttribute('data-state')).toBe('checked')
  await act(async () => button('Resume 4 chats').click())
  expect(actionCalls('agentSession.restartContinue')).toEqual([
    [{ kind: 'local' }, { sessionIds: ['l1'] }],
    [{ kind: 'environment', environmentId: 'studio' }, { sessionIds: ['s1', 's2', 's3'] }]
  ])
})

it('dismisses everything here by naming nothing, and on a server by naming every chat', async () => {
  await stage({ studio: SERVER_ROWS })
  await open(null)
  await act(async () => button('Dismiss all').click())
  expect(actionCalls('agentSession.restartResumableDismiss')).toEqual([
    [{ kind: 'local' }, {}],
    [{ kind: 'environment', environmentId: 'studio' }, { sessionIds: ['s1', 's2', 's3'] }]
  ])
})

it('keeps the flat list when only this computer has chats', async () => {
  await stage({})
  await open('local')
  expect(document.querySelector('button[aria-expanded]')).toBeNull()
  expect(button('Resume 1 chat')).toBeTruthy()
})
