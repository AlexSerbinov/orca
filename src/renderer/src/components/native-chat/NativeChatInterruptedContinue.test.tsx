// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const hostLabel = (): string | null => 'studio-mac'
  const capability = (): 'unknown' | 'supported' | 'unsupported' => 'supported'
  const resuming: readonly string[] = []
  return { call: vi.fn(), capability: capability(), hostLabel: hostLabel(), resuming }
})

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapabilityState: () => mocks.capability
}))
vi.mock('../native-chat-resume-on-restart-store', () => ({
  useNativeChatRestartResuming: () => mocks.resuming
}))
vi.mock('./use-structured-agent-session-host-label', () => ({
  useStructuredAgentSessionHostLabel: () => mocks.hostLabel
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { agentJournalItemKey } from '../../../../shared/agent-session-journal-item-key'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  NativeChatInterruptedContinue,
  useNativeChatInterruptedContinuation
} from './NativeChatInterruptedContinue'

const TURN = agentJournalItemKey({ provider: 'codex', threadId: 't', turnId: 'cut', ordinal: 1 })
const PAIRED: RuntimeClientTarget = { kind: 'environment', environmentId: 'studio-mac' }

const cutChat: AgentJournalRenderItem[] = [
  {
    itemId: TURN,
    revision: 2,
    sequence: 1,
    observedAt: 1,
    body: { kind: 'turn', turnId: 'cut', state: 'interrupted', startedAt: 1, completedAt: 5 }
  },
  {
    itemId: agentJournalItemKey({ provider: 'orca', clientMessageId: 'stale-session:s:death-1-5' }),
    revision: 1,
    sequence: 2,
    observedAt: 6,
    turnScope: { kind: 'turn', turnItemId: TURN },
    body: { kind: 'status', text: 'Codex stopped.', tone: 'error', orcaStop: { cause: 'crash' } }
  }
]

type Props = {
  journalItems?: readonly AgentJournalRenderItem[]
  submissions?: readonly Pick<AgentJournalSubmission, 'dispatchState'>[]
  isWorking?: boolean
  onError?: (message: string | null) => void
}

function Harness(props: Props): React.JSX.Element {
  const continuation = useNativeChatInterruptedContinuation({
    target: PAIRED,
    sessionId: 'session-1',
    journalItems: props.journalItems ?? cutChat,
    submissions: props.submissions ?? [],
    isWorking: props.isWorking ?? false,
    onError: props.onError ?? vi.fn()
  })
  return (
    <TooltipProvider delayDuration={0}>
      <span data-testid="offered">{continuation.offeredTurnItemId ?? 'none'}</span>
      <span data-testid="available">{String(continuation.view.continueAvailable)}</span>
      <NativeChatInterruptedContinue continuation={continuation} />
    </TooltipProvider>
  )
}

const continueButton = () => screen.queryByRole('button', { name: 'Continue' })

beforeEach(() => {
  mocks.capability = 'supported'
  mocks.resuming = []
  mocks.hostLabel = 'studio-mac'
  mocks.call.mockReset()
})

afterEach(cleanup)

describe('Continue on a reply an Orca stop cut off', () => {
  it("asks the chat's own host, paired or local, to continue that cut turn", () => {
    mocks.call.mockResolvedValue({ outcome: 'pending' })
    render(<Harness />)
    expect(screen.getByTestId('offered')).toHaveTextContent(TURN)

    fireEvent.click(continueButton()!)

    expect(mocks.call).toHaveBeenCalledExactlyOnceWith(PAIRED, 'agentSession.continueInterrupted', {
      sessionId: 'session-1',
      turnItemId: TURN
    })
    // Gone once asked, and the row gets its own way on back: the journal shows what came of it.
    expect(continueButton()).toBeNull()
    expect(screen.getByTestId('offered')).toHaveTextContent('none')
  })

  it('says what it does, for a reader and on hover', () => {
    render(<Harness />)
    expect(continueButton()).toHaveAccessibleDescription(
      'Continue, and the agent first checks whether its last step finished.'
    )
  })

  it('is not offered by a host without the operation; the user continues by sending', () => {
    mocks.capability = 'unsupported'
    render(<Harness />)
    expect(continueButton()).toBeNull()
    expect(screen.getByTestId('available')).toHaveTextContent('false')
  })

  it('tells the rows the same thing before the host answers, after it answers, and after a click', () => {
    mocks.capability = 'unknown'
    mocks.call.mockResolvedValue({ outcome: 'pending' })
    const { rerender } = render(<Harness />)
    expect(screen.getByTestId('available')).toHaveTextContent('true')
    expect(continueButton()).toBeNull()

    mocks.capability = 'supported'
    rerender(<Harness />)
    expect(screen.getByTestId('available')).toHaveTextContent('true')
    fireEvent.click(continueButton()!)

    expect(screen.getByTestId('available')).toHaveTextContent('true')
  })

  it('is not offered while the restart prompt or the launch is resuming this chat', () => {
    mocks.resuming = ['session-1']
    render(<Harness />)
    expect(continueButton()).toBeNull()
  })

  it('is not offered once anything was sent, or while the agent works', () => {
    render(<Harness submissions={[{ dispatchState: 'pending' }]} />)
    expect(continueButton()).toBeNull()
    cleanup()
    render(<Harness isWorking />)
    expect(continueButton()).toBeNull()
  })

  it('is not offered for a cut no Orca stop explains', () => {
    render(<Harness journalItems={cutChat.slice(0, 1)} />)
    expect(continueButton()).toBeNull()
  })

  it('says so and offers it again when the request fails', async () => {
    mocks.call.mockRejectedValue(new Error('offline'))
    const onError = vi.fn()
    render(<Harness onError={onError} />)

    fireEvent.click(continueButton()!)

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        "Couldn't continue this chat. Try again, or send a message."
      )
    )
    expect(continueButton()).toBeInTheDocument()
  })
})
