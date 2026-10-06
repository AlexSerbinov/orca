// What the restart-resume offer exposes to the host: teardown recording, listing, acting on and
// turning down offers, and ending one when the chat's agent starts again.

import type { ListedRestartOffer } from '../../runtime/agent-session-recovery-capsule'
import type { AgentSessionResumeTrigger } from '../../../shared/agent-session-resume-marker'
import type { StructuredAgentSessionContinuationOutcome } from './structured-agent-session-restart-continuation'
import type {
  StructuredAgentSessionResumeCandidate,
  StructuredAgentSessionResumeFailure
} from './structured-agent-session-restart-resume-set'
import type { StructuredAgentSessionResumeOutcome } from './structured-agent-session-restart-resume-runner'

/** One continue: what was reattached, how each continuation went, and what the host still lists
 *  (absent when that read failed). */
export type StructuredAgentSessionRestartContinueResult = {
  resumed: StructuredAgentSessionResumeOutcome[]
  continued: StructuredAgentSessionContinuationOutcome[]
  sessions?: StructuredAgentSessionResumeCandidate[]
  failed?: StructuredAgentSessionResumeFailure[]
}

export type StructuredAgentSessionRestartResume = {
  /** Teardown: begin, then per session a snapshot right before its child stops and a confirmation
   *  once the stop is proven, then one write of the confirmed offers. */
  beginTeardown: (trigger: AgentSessionResumeTrigger) => void
  captureBeforeStop: (sessionId: string) => void
  confirmStopped: (sessionId: string) => void
  recordMarkers: () => Promise<void>
  list: () => Promise<StructuredAgentSessionResumeCandidate[]>
  /** Offers already acted on whose agent did not carry on. Read-only; nothing here is spent. */
  listFailures: () => Promise<StructuredAgentSessionResumeFailure[]>
  continueAfterRestart: (
    sessionIds: readonly string[] | undefined,
    owner: string
  ) => Promise<StructuredAgentSessionRestartContinueResult>
  /** Named sessions forget their offer or failure; unnamed, every record this host
   *  lists goes (a newer Orca's stay). */
  dismiss: (sessionIds?: readonly string[]) => Promise<number>
  /** Forgets offers exactly as a client listed them: a chat interrupted again since, or being
   *  resumed by another action right now, keeps its record. */
  dismissListed: (listed: readonly ListedRestartOffer[]) => Promise<number>
  /** The chat's agent proved a start: its offer ends unless the start is a resume's own. */
  onAgentStarted: (sessionId: string) => void
}
