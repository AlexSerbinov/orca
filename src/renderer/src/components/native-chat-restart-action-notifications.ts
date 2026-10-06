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
function continuedText(count: number, machineName: string | undefined): string {
  if (machineName !== undefined) {
    return count === 1
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
  }
  return count === 1
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.continuedOne',
        'Resumed 1 chat and asked it to continue'
      )
    : translate(
        'auto.components.NativeChatResumeOnRestartModal.continuedMany',
        'Resumed {{value0}} chats and asked them to continue',
        { value0: count }
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
function noLongerNeededText(count: number): string {
  return count === 1
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.noLongerNeededOne',
        '1 chat no longer needs resuming'
      )
    : translate(
        'auto.components.NativeChatResumeOnRestartModal.noLongerNeededMany',
        '{{value0}} chats no longer need resuming',
        { value0: count }
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
}

function tallyAnswer(
  requested: readonly string[],
  results: readonly RestartContinuationOutcome[],
  hostFailed: readonly Pick<ResumeFailure, 'sessionId' | 'outcome'>[] | undefined
): Omit<MachineTally, 'machine' | 'machineName'> {
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
      return { ...base, ...tallyAnswer(result.requested, result.results, result.hostFailed) }
    case 'unconfirmed':
      // The call's answer was lost: every named chat may have been resumed, and nothing is known.
      return { ...base, ...none, unconfirmed: [...new Set(result.requested)] }
    case 'not-sent':
      return { ...base, ...none, refused: [...new Set(result.requested)] }
  }
}

/** One machine's name when it alone holds the counted chats; otherwise the count needs no "where"
 *  and the dialog it opens lists each machine. */
function soleMachineName(tallies: readonly MachineTally[]): string | undefined {
  return tallies.length === 1 ? tallies[0]!.machineName : undefined
}

function sum(tallies: readonly MachineTally[], count: (entry: MachineTally) => number): number {
  return tallies.reduce((total, entry) => total + count(entry), 0)
}

/**
 * What one resume did, across every machine it reached, as ONE notice: what went wrong leads, and
 * the rest of the outcome rides beneath it. No chat names: the dialog has the list. Unconfirmed
 * chats are counted apart from refused ones because the agent may well be working; "couldn't be
 * resumed" would invite a duplicate send.
 *
 * `quiet` is a resume nobody clicked (opted in): chats that no longer needed it go unmentioned.
 */
export function announceRestartResults(
  results: readonly RestartContinueResult[],
  actions: RestartFailureActions,
  options: { quiet?: boolean } = {}
): void {
  const tallies = results.map(tally)
  const failing = tallies.filter((entry) => entry.refused.length + entry.unconfirmed.length > 0)
  const continuing = tallies.filter((entry) => entry.continued > 0)
  const refused = sum(failing, (entry) => entry.refused.length)
  const unconfirmed = sum(failing, (entry) => entry.unconfirmed.length)
  const continued = sum(continuing, (entry) => entry.continued)
  const noLonger = options.quiet ? 0 : sum(tallies, (entry) => entry.noLonger)
  const parts = [
    ...(failing.length > 0
      ? [
          refused > 0
            ? refusedCountText(refused, soleMachineName(failing))
            : unconfirmedCountText(unconfirmed, soleMachineName(failing))
        ]
      : []),
    ...(refused > 0 && unconfirmed > 0 ? [otherUnconfirmedCountText(unconfirmed)] : []),
    ...(continued > 0 ? [continuedText(continued, soleMachineName(continuing))] : []),
    ...(noLonger > 0 ? [noLongerNeededText(noLonger)] : [])
  ]
  const [title, ...rest] = parts
  if (title === undefined) {
    return
  }
  const dismissable = failing.filter((entry) => entry.dismissable.length > 0)
  const details = {
    ...(rest.length > 0 ? { description: rest.join(' · ') } : {}),
    ...(failing.length === 0
      ? {}
      : {
          action: {
            label: translate('auto.components.NativeChatResumeOnRestartModal.show', 'Show'),
            onClick: () => actions.show(failing.length === 1 ? failing[0]!.machine : null)
          }
        }),
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
  }
  if (Object.keys(details).length === 0) {
    toast(title)
  } else {
    toast(title, details)
  }
}
