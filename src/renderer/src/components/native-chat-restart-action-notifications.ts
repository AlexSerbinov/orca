import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ResumeFailure } from './native-chat-resume-on-restart-grouping'
import type { RestartMachineKey } from './native-chat-restart-machines'

/**
 * What Orca tells the user after acting on a restart offer.
 *
 * Resuming sends a message, so every string here has to say one went out — and an opted-in launch
 * has no dialog in front of it, which makes these toasts the only place that user learns it did.
 */

/** One `continued` row as the host reports it. */
export type RestartContinuationOutcome = {
  sessionId: string
  outcome: 'continued' | 'pending' | 'unknown' | 'refused'
}

/** `machineName` names a paired server; this computer's own chats need no "where". */
function announceContinued(count: number, machineName: string | undefined): void {
  if (count <= 0) {
    return
  }
  if (machineName !== undefined) {
    toast(
      count === 1
        ? translate(
            'auto.components.NativeChatResumeOnRestartModal.continuedOneOnMachine',
            'Resumed 1 chat on {{value0}} and asked it to continue',
            { value0: machineName }
          )
        : translate(
            'auto.components.NativeChatResumeOnRestartModal.continuedManyOnMachine',
            'Resumed {{value0}} chats on {{value1}} and asked them to continue',
            { value0: count, value1: machineName }
          )
    )
    return
  }
  toast(
    count === 1
      ? translate(
          'auto.components.NativeChatResumeOnRestartModal.continuedOne',
          'Resumed 1 chat and asked it to continue'
        )
      : translate(
          'auto.components.NativeChatResumeOnRestartModal.continuedMany',
          'Resumed {{value0}} chats and asked them to continue',
          { value0: count }
        )
  )
}

/** Delivery the host never confirmed. Reported, never retried — a second send is the user's call. */
export function announceRestartUnconfirmed(count: number): void {
  if (count <= 0) {
    return
  }
  toast(
    translate(
      'auto.components.NativeChatResumeOnRestartModal.continueUnconfirmed',
      'Continuation delivery is unconfirmed for {{value0}} chats. Open them to check before sending another message.',
      { value0: count, count }
    )
  )
}

/** What the failure toast can do: open the modal on the machine that failed (or on none in
 *  particular), or forget the failures. Passed in because the offer store owns both and this module
 *  must not import it back. */
export type RestartFailureActions = {
  show: (machine: RestartMachineKey | null) => void
  dismiss: (machine: RestartMachineKey, sessionIds: readonly string[]) => void
}

/** How one machine's part of a resume ended: the host's answer, a call whose delivery is unknown,
 *  or one refused before it was sent (the server was re-paired). */
export type RestartContinueResult = {
  machine: RestartMachineKey
  /** Names a paired server; this computer's own chats need no "where". */
  machineName?: string
  requested: readonly string[]
} & (
  | {
      kind: 'answered'
      results: readonly RestartContinuationOutcome[]
      /** The host's own failure list after the action; undefined from an older host. */
      hostFailed: readonly Pick<ResumeFailure, 'sessionId' | 'outcome'>[] | undefined
    }
  | { kind: 'unconfirmed' }
  | { kind: 'not-sent' }
)

function refusedCountText(count: number, machineName: string | undefined): string {
  if (machineName !== undefined) {
    return count === 1
      ? translate(
          'auto.components.NativeChatResumeOnRestartModal.notContinuedOneOnMachine',
          '1 chat on {{value0}} couldn’t be resumed',
          { value0: machineName }
        )
      : translate(
          'auto.components.NativeChatResumeOnRestartModal.notContinuedManyOnMachine',
          '{{value0}} chats on {{value1}} couldn’t be resumed',
          { value0: count, value1: machineName }
        )
  }
  return count === 1
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.notContinuedOne',
        '1 chat couldn’t be resumed'
      )
    : translate(
        'auto.components.NativeChatResumeOnRestartModal.notContinuedMany',
        '{{value0}} chats couldn’t be resumed',
        { value0: count }
      )
}

function unconfirmedCountText(count: number, machineName: string | undefined): string {
  if (machineName !== undefined) {
    return count === 1
      ? translate(
          'auto.components.NativeChatResumeOnRestartModal.notConfirmedOneOnMachine',
          'Couldn’t confirm 1 chat on {{value0}} was resumed',
          { value0: machineName }
        )
      : translate(
          'auto.components.NativeChatResumeOnRestartModal.notConfirmedManyOnMachine',
          'Couldn’t confirm {{value0}} chats on {{value1}} were resumed',
          { value0: count, value1: machineName }
        )
  }
  return count === 1
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.notConfirmedOne',
        'Couldn’t confirm 1 chat was resumed'
      )
    : translate(
        'auto.components.NativeChatResumeOnRestartModal.notConfirmedMany',
        'Couldn’t confirm {{value0}} chats were resumed',
        { value0: count }
      )
}

/** Beneath a refused count, so it cannot read as the same chat restated. */
function otherUnconfirmedCountText(count: number): string {
  return count === 1
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.notConfirmedOtherOne',
        'Couldn’t confirm 1 other chat was resumed'
      )
    : translate(
        'auto.components.NativeChatResumeOnRestartModal.notConfirmedOtherMany',
        'Couldn’t confirm {{value0}} other chats were resumed',
        { value0: count }
      )
}

/** Chats that dropped out of the offer before this resume reached them: another device resumed or
 *  dismissed them, or the chat moved on. Nothing failed, and nothing was sent. */
function announceNoLongerNeeded(count: number): void {
  toast(
    count === 1
      ? translate(
          'auto.components.NativeChatResumeOnRestartModal.noLongerNeededOne',
          '1 chat no longer needs resuming'
        )
      : translate(
          'auto.components.NativeChatResumeOnRestartModal.noLongerNeededMany',
          '{{value0}} chats no longer need resuming',
          { value0: count }
        )
  )
}

/** A dismissal Orca could not confirm. The offer belongs to the host, so say it may still be there. */
export function announceRestartDismissUnconfirmed(): void {
  toast(
    translate(
      'auto.components.NativeChatResumeOnRestartModal.dismissUnconfirmed',
      'Dismissing the resume offer was not confirmed — it may still be in the status bar.'
    )
  )
}

/** Which of the requested chats the host did not carry on: refused, unconfirmed, or — since
 *  eligibility can change after listing — omitted from the answer altogether. */
export function restartChatsNotContinued(
  requested: readonly string[],
  results: readonly RestartContinuationOutcome[]
): string[] {
  const bySession = new Map(results.map((result) => [result.sessionId, result.outcome]))
  return [...new Set(requested)].filter((sessionId) => bySession.get(sessionId) !== 'continued')
}

type MachineTally = {
  machine: RestartMachineKey
  machineName: string | undefined
  continued: number
  refused: string[]
  unconfirmed: string[]
  /** Only chats the host listed as failed: one that merely dropped out may still be a live offer. */
  dismissable: string[]
  noLonger: number
  deliveryUnknown: number
}

function tallyAnswer(
  requested: readonly string[],
  results: readonly RestartContinuationOutcome[],
  hostFailed: readonly Pick<ResumeFailure, 'sessionId' | 'outcome'>[] | undefined
): Omit<MachineTally, 'machine' | 'machineName' | 'deliveryUnknown'> {
  const notContinued = restartChatsNotContinued(requested, results)
  const failed = new Map(hostFailed?.map((failure) => [failure.sessionId, failure.outcome]))
  // A host that lists failures has already dropped chats that moved on by themselves or that the
  // user answered; counting those would report a failure nothing on screen can show.
  const reported =
    hostFailed === undefined
      ? notContinued
      : notContinued.filter((sessionId) => failed.has(sessionId))
  const outcomes = new Map(results.map((result) => [result.sessionId, result.outcome]))
  const sentUnconfirmed = (sessionId: string): boolean =>
    outcomes.get(sessionId) === 'pending' || outcomes.get(sessionId) === 'unknown'
  // An unconfirmed send the host no longer lists was seen carrying on (or answered by the user), so
  // it was resumed and asked to continue; left out of both counts, the action would say nothing.
  const seenCarryingOn = notContinued.filter(
    (sessionId) => !reported.includes(sessionId) && sentUnconfirmed(sessionId)
  )
  // The host's filed outcome is what the list shows, so the toast uses it too.
  const unconfirmed = (sessionId: string): boolean =>
    (failed.get(sessionId) ?? (sentUnconfirmed(sessionId) ? 'unconfirmed' : 'refused')) ===
    'unconfirmed'
  return {
    continued: new Set(requested).size - notContinued.length + seenCarryingOn.length,
    refused: reported.filter((sessionId) => !unconfirmed(sessionId)),
    unconfirmed: reported.filter(unconfirmed),
    dismissable: reported.filter((sessionId) => failed.has(sessionId)),
    noLonger: notContinued.length - reported.length - seenCarryingOn.length
  }
}

function tally(result: RestartContinueResult): MachineTally {
  const base = { machine: result.machine, machineName: result.machineName }
  const none = { continued: 0, refused: [], unconfirmed: [], dismissable: [], noLonger: 0 }
  switch (result.kind) {
    case 'answered':
      return {
        ...base,
        ...tallyAnswer(result.requested, result.results, result.hostFailed),
        deliveryUnknown: 0
      }
    case 'unconfirmed':
      return { ...base, ...none, deliveryUnknown: new Set(result.requested).size }
    case 'not-sent':
      return { ...base, ...none, refused: [...new Set(result.requested)], deliveryUnknown: 0 }
  }
}

/** One machine's name when it alone holds the counted chats; otherwise the count needs no "where"
 *  and the dialog it opens lists each machine. */
function soleMachineName(tallies: readonly MachineTally[]): string | undefined {
  return tallies.length === 1 ? tallies[0]!.machineName : undefined
}

/** The chats an action did not carry on, as one notice across every machine. No chat names: the
 *  modal has the list. Unconfirmed chats get their own count because the agent may well be
 *  working; "couldn't be resumed" would invite a duplicate send. */
function announceNotContinued(tallies: readonly MachineTally[], actions: RestartFailureActions) {
  const failing = tallies.filter((entry) => entry.refused.length + entry.unconfirmed.length > 0)
  if (failing.length === 0) {
    return
  }
  const refused = failing.reduce((total, entry) => total + entry.refused.length, 0)
  const unconfirmed = failing.reduce((total, entry) => total + entry.unconfirmed.length, 0)
  const name = soleMachineName(failing)
  const dismissable = failing.filter((entry) => entry.dismissable.length > 0)
  toast(refused > 0 ? refusedCountText(refused, name) : unconfirmedCountText(unconfirmed, name), {
    ...(refused > 0 && unconfirmed > 0
      ? { description: otherUnconfirmedCountText(unconfirmed) }
      : {}),
    action: {
      label: translate('auto.components.NativeChatResumeOnRestartModal.show', 'Show'),
      onClick: () => actions.show(failing.length === 1 ? failing[0]!.machine : null)
    },
    ...(dismissable.length === 0
      ? {}
      : {
          cancel: {
            label: translate('auto.components.NativeChatResumeOnRestartModal.dismiss', 'Dismiss'),
            onClick: () => {
              for (const entry of dismissable) {
                actions.dismiss(entry.machine, entry.dismissable)
              }
            }
          }
        })
  })
}

/** What one resume did, across every machine it reached: at most one notice per kind of result. */
export function announceRestartResults(
  results: readonly RestartContinueResult[],
  actions: RestartFailureActions
): void {
  const tallies = results.map(tally)
  const continuing = tallies.filter((entry) => entry.continued > 0)
  const continued = continuing.reduce((total, entry) => total + entry.continued, 0)
  announceContinued(continued, soleMachineName(continuing))
  announceNotContinued(tallies, actions)
  const deliveryUnknown = tallies.reduce((total, entry) => total + entry.deliveryUnknown, 0)
  announceRestartUnconfirmed(deliveryUnknown)
  const failures = tallies.reduce(
    (total, entry) => total + entry.refused.length + entry.unconfirmed.length,
    0
  )
  const noLonger = tallies.reduce((total, entry) => total + entry.noLonger, 0)
  // Said only when nothing else was: a click must not end in silence.
  if (noLonger > 0 && continued === 0 && failures === 0 && deliveryUnknown === 0) {
    announceNoLongerNeeded(noLonger)
  }
}
