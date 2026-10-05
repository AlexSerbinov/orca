import { useMemo } from 'react'
import { useAppStore } from '../store'
import type { ResumeFailure } from './native-chat-resume-on-restart-grouping'
import type { NativeChatRestartMachineOffer } from './native-chat-resume-on-restart-store'
import { LOCAL_RESTART_MACHINE, type RestartMachineKey } from './native-chat-restart-machines'
import { restartMachineNameFromState } from './native-chat-restart-machine-name'
import { parseResumeOwnership, resumeCandidateOwnership } from './native-chat-resume-ownership'
import { restartListingIdentity, type ResumeSelectionMachine } from './native-chat-resume-selection'

export type MachineView = ResumeSelectionMachine & {
  offer: NativeChatRestartMachineOffer
  name: string
}

/** This computer first, then each paired server by name. */
function orderedOffers(
  offers: ReadonlyMap<RestartMachineKey, NativeChatRestartMachineOffer>,
  nameOf: (machine: RestartMachineKey) => string
): NativeChatRestartMachineOffer[] {
  return [...offers.values()].sort((left, right) =>
    left.machine === LOCAL_RESTART_MACHINE
      ? -1
      : right.machine === LOCAL_RESTART_MACHINE
        ? 1
        : nameOf(left.machine).localeCompare(nameOf(right.machine))
  )
}

/**
 * Each listed chat's ownership, as one narrow subscription. Selected as a joined string so the
 * selector returns a PRIMITIVE and the dialog re-renders only when an answer actually changes.
 */
export function useMachineViews(
  offers: ReadonlyMap<RestartMachineKey, NativeChatRestartMachineOffer>
): MachineView[] {
  const joined = useAppStore((state) =>
    [...offers.values()]
      .map((offer) =>
        [
          offer.machine,
          restartMachineNameFromState(state, offer.machine),
          ...[...offer.candidates, ...offer.failed].map((row) =>
            resumeCandidateOwnership(state, offer.target, row)
          )
        ].join('\u0001')
      )
      .join('\u0002')
  )
  return useMemo(() => {
    const parsed = new Map(
      joined
        .split('\u0002')
        .filter(Boolean)
        .map((entry) => {
          const [machine = '', name = '', ...ownership] = entry.split('\u0001')
          return [machine, { name, ownership }] as const
        })
    )
    return orderedOffers(offers, (machine) => parsed.get(machine)?.name ?? machine).map((offer) => {
      const rows = [...offer.candidates, ...offer.failed]
      const facts = parsed.get(offer.machine)
      const ownershipById = new Map(
        rows.map((row, index) => [row.sessionId, parseResumeOwnership(facts?.ownership[index])])
      )
      const failureById = new Map<string, ResumeFailure>(
        offer.failed.map((failure) => [failure.sessionId, failure])
      )
      return {
        machine: offer.machine,
        identity: restartListingIdentity(offer.machine, offer.fence.pairingRevision),
        offer,
        name: facts?.name ?? offer.machine,
        rows,
        failureFor: (sessionId: string) => failureById.get(sessionId),
        ownershipFor: (sessionId: string) => ownershipById.get(sessionId) ?? 'unknown'
      }
    })
  }, [joined, offers])
}
