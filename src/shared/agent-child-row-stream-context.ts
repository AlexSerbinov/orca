import type { AgentChildRowContext } from './agent-child-row-model'

/** The context a structured session's own stream gives the children it publishes, for a reader
 *  holding no status row for that session (the phone). The host owns the session, so its evidence
 *  never ages out (as a host-owned row's does not); only losing the stream makes a live claim
 *  unverifiable. `hostClock` is the stream's last host clock sample. */
export function agentChildRowContextForSessionStream(
  streamLive: boolean,
  hostClock: { hostNow: number; receivedAt: number } | undefined
): AgentChildRowContext {
  return {
    parentEvidenceFresh: true,
    transportObservation: streamLive ? 'live' : 'unverifiable',
    parentObservedAt: hostClock?.receivedAt ?? 0,
    hostClockOffsetMs: hostClock ? hostClock.receivedAt - hostClock.hostNow : 0
  }
}
