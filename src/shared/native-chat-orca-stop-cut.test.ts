import { describe, expect, it } from 'vitest'
import { agentSessionFailureFact, readAgentSessionFailureFact } from './agent-session-failure'
import { agentSessionFailureWords } from './agent-session-failure-words'
import { agentJournalItemKey } from './agent-session-journal-item-key'
import type { AgentJournalRenderItem } from './agent-session-journal-types'
import { withNativeChatCutTurnNotices } from './native-chat-cut-turn-notice'
import {
  latestNativeChatOrcaStopCut,
  orcaShutdownRowClientMessageId
} from './native-chat-orca-stop-cut'

const LEGACY_TEXT =
  'Codex stopped while this response was in progress. You can continue in this conversation.'

const turnId = agentJournalItemKey({ provider: 'codex', threadId: 't', turnId: 'cut', ordinal: 1 })

function userMessage(sequence: number): AgentJournalRenderItem {
  return {
    itemId: agentJournalItemKey({ provider: 'orca', clientMessageId: `user-${sequence}` }),
    revision: 1,
    sequence,
    observedAt: sequence,
    body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'go' }] }
  }
}

function cutTurn(outcome?: string): AgentJournalRenderItem {
  return {
    itemId: turnId,
    revision: 2,
    sequence: 2,
    observedAt: 2,
    body: {
      kind: 'turn',
      turnId: 'cut',
      state: 'interrupted',
      startedAt: 1,
      completedAt: 5,
      ...(outcome ? { outcome } : {})
    }
  }
}

/** The host's row, as a host this build or a newer one writes it. */
function stopRow(failure: unknown, scoped = true): AgentJournalRenderItem {
  return {
    itemId: agentJournalItemKey({
      provider: 'orca',
      clientMessageId: orcaShutdownRowClientMessageId('session-1', 3, 'gen-1')
    }),
    revision: 1,
    sequence: 3,
    observedAt: 6,
    body: { kind: 'status', text: LEGACY_TEXT, tone: 'error', failure },
    ...(scoped ? { turnScope: { kind: 'turn' as const, turnItemId: turnId } } : {})
  }
}

const updateFact = agentSessionFailureFact('providerExited', { orcaStop: { cause: 'update' } })

describe('the cause on a stopped row', () => {
  it('is read when known and dropped when a newer host names one this build does not know', () => {
    expect(readAgentSessionFailureFact(updateFact)?.orcaStop).toEqual({ cause: 'update' })
    expect(
      readAgentSessionFailureFact({ kind: 'providerExited', orcaStop: { cause: 'power-loss' } })
    ).toEqual({ kind: 'providerExited' })
  })

  it("keeps today's sentence, so a client that reads no cause prints the same row", () => {
    expect(agentSessionFailureWords(updateFact, { agentName: 'Codex', surface: 'row' }).text).toBe(
      LEGACY_TEXT
    )
  })
})

describe('a client that predates the cause', () => {
  it("reads the host row as the cut turn's one explanation and adds none of its own", () => {
    // An older client keeps only the kind (as this build does for an unknown cause).
    const items = [userMessage(1), cutTurn(), stopRow({ kind: 'providerExited' })]
    const read = withNativeChatCutTurnNotices(items, { agentName: 'Codex' })
    expect(read).toBe(items)
    expect(read.filter((item) => item.body.kind === 'status')).toHaveLength(1)
  })
})

describe('the cut Continue answers', () => {
  it('is the latest turn when an Orca stop cut it and nothing was sent since', () => {
    expect(
      latestNativeChatOrcaStopCut([userMessage(1), cutTurn(), stopRow(updateFact)], [])
    ).toEqual({ turnItemId: turnId, cause: 'update' })
  })

  it('is gone once a message follows the cut', () => {
    expect(
      latestNativeChatOrcaStopCut(
        [userMessage(1), cutTurn(), stopRow(updateFact), userMessage(4)],
        []
      )
    ).toBeNull()
  })

  it('is gone while a send is on its way', () => {
    expect(
      latestNativeChatOrcaStopCut(
        [userMessage(1), cutTurn(), stopRow(updateFact)],
        [{ dispatchState: 'pending' }]
      )
    ).toBeNull()
  })

  it("is none for a stop with no Orca cause, a person's Stop, or an unscoped row", () => {
    expect(
      latestNativeChatOrcaStopCut([cutTurn(), stopRow({ kind: 'providerExited' })], [])
    ).toBeNull()
    expect(
      latestNativeChatOrcaStopCut([cutTurn('cancellation'), stopRow(updateFact)], [])
    ).toBeNull()
    expect(latestNativeChatOrcaStopCut([cutTurn(), stopRow(updateFact, false)], [])).toBeNull()
  })
})
