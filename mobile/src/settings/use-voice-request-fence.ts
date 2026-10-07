import { useCallback, useEffect, useMemo, useRef } from 'react'

export type VoiceRequestTicket = { epoch: number; host: object | null }

/**
 * Fences async replies on the Voice screens. `begin()` starts a state-writing request (newer writes
 * win); `peek()` tags a read without superseding anything. A host swap supersedes every ticket.
 */
export function useVoiceRequestFence(host: object | null) {
  const epoch = useRef(0)
  const currentHost = useRef(host)

  // Why: replies from the previous desktop must never land on the new one's screen.
  useEffect(() => {
    if (currentHost.current !== host) {
      currentHost.current = host
      epoch.current += 1
    }
  }, [host])

  const peek = useCallback((): VoiceRequestTicket => ({ epoch: epoch.current, host }), [host])
  const begin = useCallback((): VoiceRequestTicket => {
    epoch.current += 1
    return { epoch: epoch.current, host }
  }, [host])
  /** No newer write and no host swap since the ticket: its reply may replace screen state. */
  const isLatest = useCallback(
    (ticket: VoiceRequestTicket) =>
      ticket.epoch === epoch.current && ticket.host === currentHost.current,
    []
  )
  /** Still the same desktop: errors and spinners from this reply are still the user's. */
  const isSameHost = useCallback(
    (ticket: VoiceRequestTicket) => ticket.host === currentHost.current,
    []
  )
  // Why: stable identity, since callers list the fence in their useCallback deps.
  return useMemo(() => ({ begin, peek, isLatest, isSameHost }), [begin, peek, isLatest, isSameHost])
}
