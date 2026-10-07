// The running child work a structured session's stream publishes, for the strip above the composer:
// desktop's view of the same roster, the verdict its rows read, and the Stop that reaches them.

import { useCallback, useMemo, useState } from 'react'
import type { AgentChildRowContext } from '../../../src/shared/agent-child-row-model'
import { agentChildRowContextForSessionStream } from '../../../src/shared/agent-child-row-stream-context'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
import {
  structuredSessionBackgroundTasksView,
  type StructuredSessionBackgroundTasksView
} from '../../../src/shared/structured-session-background-tasks-view'
import type { MobileStructuredAgentMutate } from './use-mobile-structured-agent-mutation'

export type MobileStructuredBackgroundTasks = {
  /** The conversation these tasks belong to; the strip's open and stopping state is kept per one. */
  sessionKey: string
  view: StructuredSessionBackgroundTasksView
  /** The verdict every child row reads: unverifiable once this phone stops hearing the stream. Its
   *  host clock offset also moves the rows' host-stamped clocks onto the phone's. */
  rowContext: AgentChildRowContext
  /** One child by its provider id, or, with none, every background task the host can stop. */
  stop: (taskId?: string) => Promise<unknown>
}

type OffsetLatch = { sessionKey: string; offsetMs: number }

export function useMobileStructuredBackgroundTasks(args: {
  sessionKey: string
  state: StructuredAgentSessionState
  turnId: string | null
  /** Live transport; without it the kept roster is the last thing heard, not what runs now. */
  connected: boolean
  mutate: MobileStructuredAgentMutate
}): MobileStructuredBackgroundTasks {
  const { connected, mutate, sessionKey, state, turnId } = args
  const view = useMemo(
    () => structuredSessionBackgroundTasksView(state.backgroundTasks, turnId),
    [state.backgroundTasks, turnId]
  )
  // A disconnected or failed stream keeps the last roster on screen; its live claims then stand
  // for nothing, so they read unverifiable rather than working.
  const streamLive = connected && state.status === 'ready'
  // Latched once per conversation from its first live host sample, as the turn bar latches its own
  // per turn: every frame's sample carries fresh delivery latency, and re-deriving it would move the
  // clocks and rebuild every row on every frame. Clock skew between two machines does not drift.
  const [latch, setLatch] = useState<OffsetLatch | null>(null)
  const hostClock = state.hostClock
  const nextLatch =
    latch?.sessionKey === sessionKey
      ? latch
      : streamLive && hostClock
        ? { sessionKey, offsetMs: hostClock.receivedAt - hostClock.hostNow }
        : null
  if (nextLatch !== latch) {
    setLatch(nextLatch)
  }
  const offsetMs = nextLatch?.offsetMs ?? 0
  const rowContext = useMemo(
    () => agentChildRowContextForSessionStream(streamLive, offsetMs),
    [streamLive, offsetMs]
  )
  const stop = useCallback(
    (taskId?: string) =>
      mutate('agentSession.cancel', 'agentSession.cancel', {
        turnId: 'background-tasks',
        scope: 'background-tasks',
        ...(taskId ? { taskId } : {})
      }),
    [mutate]
  )
  return useMemo(
    () => ({ sessionKey, view, rowContext, stop }),
    [sessionKey, view, rowContext, stop]
  )
}
