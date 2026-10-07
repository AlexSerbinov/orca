// The running child work a structured session's stream publishes, for the strip above the composer:
// desktop's view of the same roster, the verdict its rows read, and the Stop that reaches them.

import { useCallback, useMemo } from 'react'
import type { AgentChildRowContext } from '../../../src/shared/agent-child-row-model'
import { agentChildRowContextForSessionStream } from '../../../src/shared/agent-child-row-stream-context'
import type { StructuredAgentSessionState } from '../../../src/shared/structured-agent-session-reducer'
import {
  structuredSessionBackgroundTasksView,
  type StructuredSessionBackgroundTasksView
} from '../../../src/shared/structured-session-background-tasks-view'
import type { MobileStructuredAgentMutate } from './use-mobile-structured-agent-mutation'

export type MobileStructuredBackgroundTasks = {
  view: StructuredSessionBackgroundTasksView
  /** The verdict every child row reads: unverifiable once this phone stops hearing the stream. */
  rowContext: AgentChildRowContext
  /** One child by its provider id, or, with none, every background task the host can stop. */
  stop: (taskId?: string) => Promise<unknown>
}

export function useMobileStructuredBackgroundTasks(args: {
  state: StructuredAgentSessionState
  turnId: string | null
  /** Live transport; without it the kept roster is the last thing heard, not what runs now. */
  connected: boolean
  mutate: MobileStructuredAgentMutate
}): MobileStructuredBackgroundTasks {
  const { connected, mutate, state, turnId } = args
  const view = useMemo(
    () => structuredSessionBackgroundTasksView(state.backgroundTasks, turnId),
    [state.backgroundTasks, turnId]
  )
  // A disconnected or failed stream keeps the last roster on screen; its live claims then stand
  // for nothing, so they read unverifiable rather than working.
  const streamLive = connected && state.status === 'ready'
  const hostClock = state.hostClock
  const rowContext = useMemo(
    () => agentChildRowContextForSessionStream(streamLive, hostClock),
    [streamLive, hostClock]
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
  return useMemo(() => ({ view, rowContext, stop }), [view, rowContext, stop])
}
