// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  supported: true
}))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapability: () => mocks.supported
}))

import { agentSessionFailureFact } from '../../../../shared/agent-session-failure'
import { agentJournalItemKey } from '../../../../shared/agent-session-journal-item-key'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { NativeChatInterruptedContinue } from './NativeChatInterruptedContinue'

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
    body: {
      kind: 'status',
      text: 'Codex stopped.',
      tone: 'error',
      failure: agentSessionFailureFact('providerExited', { orcaStop: { cause: 'crash' } })
    }
  }
]

function renderContinue(
  overrides: Partial<Parameters<typeof NativeChatInterruptedContinue>[0]> = {}
) {
  const onError = vi.fn()
  render(
    <NativeChatInterruptedContinue
      target={PAIRED}
      sessionId="session-1"
      journalItems={cutChat}
      submissions={[]}
      isWorking={false}
      onError={onError}
      {...overrides}
    />
  )
  return { onError }
}

beforeEach(() => {
  mocks.supported = true
  mocks.call.mockReset()
})

afterEach(cleanup)

describe('Continue on a reply an Orca stop cut off', () => {
  it("asks the chat's own host, paired or local, to continue that cut turn", async () => {
    mocks.call.mockResolvedValue({ outcome: 'pending' })
    renderContinue()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mocks.call).toHaveBeenCalledExactlyOnceWith(PAIRED, 'agentSession.continueInterrupted', {
      sessionId: 'session-1',
      turnItemId: TURN
    })
    // Gone once asked: the journal shows what came of it.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('is not offered by a host without the operation', () => {
    mocks.supported = false
    renderContinue()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('is not offered once anything was sent, or while the agent works', () => {
    renderContinue({ submissions: [{ dispatchState: 'pending' }] })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    cleanup()
    renderContinue({ isWorking: true })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('is not offered for a cut no Orca stop explains', () => {
    renderContinue({ journalItems: cutChat.slice(0, 1) })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('says so and offers it again when the request fails', async () => {
    mocks.call.mockRejectedValue(new Error('offline'))
    const { onError } = renderContinue()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        "Couldn't continue this chat. Try again, or send a message."
      )
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })
})
