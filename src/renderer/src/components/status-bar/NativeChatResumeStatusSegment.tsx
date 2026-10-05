import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { useNativeChatRestartOfferEnabled } from '../native-chat-restart-offer-gate'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { requestNativeChatResumeOnRestartDialog } from '../native-chat-resume-on-restart-dialog'
import {
  getNativeChatRestartResuming,
  refreshNativeChatRestartOffers,
  useNativeChatRestartOffers,
  useNativeChatRestartResuming
} from '../native-chat-resume-on-restart-store'
import { useNativeChatRestartOfferSources } from '../native-chat-restart-offer-triggers'
import { LOCAL_RESTART_MACHINE, type RestartMachineKey } from '../native-chat-restart-machines'
import { restartMachineNameFromState } from '../native-chat-restart-machine-name'
import { useAppStore } from '../../store'

// Why: closing the resume dialog is a snooze, not a decline — each host keeps its offer. This is
// then the only surface left carrying it, so it is always rendered rather than gated by
// `statusBarItems`. Pressing Resume closes the dialog too, so this entry carries the run while it
// is in flight. A chat the resume could not carry on is kept the same way: the toast that reported
// it is gone in seconds, and this entry is what still names it.
//
// ONE entry across every machine: the dialog covers them all. It names the machine only when there
// is just one, and its tooltip breaks the count down by machine.

/** The machine to open the dialog on: the only one listed, or none in particular. */
function focusOf(machines: readonly RestartMachineKey[]): RestartMachineKey | null {
  return machines.length === 1 ? machines[0]! : null
}

/** Opens at once on the last confirmed offers, then re-reads each listed machine on its own, so an
 *  unreachable machine never holds the dialog back. A machine whose host now lists nothing drops
 *  out of the open dialog; the dialog closes once none is left. Opening the chat itself is
 *  read-only and does not retire the offer. */
function reopenOffer(machines: readonly RestartMachineKey[]): void {
  requestNativeChatResumeOnRestartDialog('user', focusOf(machines))
  // Mid-resume the host's answer is already on its way; a re-read racing it could undo it.
  if (getNativeChatRestartResuming().size === 0) {
    void refreshNativeChatRestartOffers(machines)
  }
}

function Segment({
  icon,
  label,
  ariaLabel,
  tooltip,
  iconOnly,
  count,
  machines
}: {
  icon: React.ReactNode
  label: string
  ariaLabel: string
  tooltip: string
  iconOnly: boolean
  count: number
  machines: readonly RestartMachineKey[]
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => reopenOffer(machines)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/70"
          aria-label={ariaLabel}
        >
          {icon}
          <span className="text-[11px]">{iconOnly ? count : label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

type SegmentText = { label: string; ariaLabel: string; tooltip: string }

function resumingText(count: number): SegmentText {
  return {
    label:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.resumingLabelOne',
            'Resuming 1 chat'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.resumingLabel',
            'Resuming {{value0}} chats',
            { value0: count }
          ),
    ariaLabel:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.resumingAriaOne',
            'Resuming 1 chat. Click to open details.'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.resumingAria',
            'Resuming {{value0}} chats. Click to open details.',
            { value0: count }
          ),
    tooltip: translate(
      'auto.components.status.bar.NativeChatResumeStatusSegment.resumingTooltip',
      'Restoring interrupted chats and asking them to carry on…'
    )
  }
}

function failedText(count: number): SegmentText {
  return {
    label:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.failedLabelOne',
            '1 chat failed to resume'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.failedLabel',
            '{{value0}} chats failed to resume',
            { value0: count }
          ),
    ariaLabel:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.failedAriaOne',
            '1 chat failed to resume. Click for details.'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.failedAria',
            '{{value0}} chats failed to resume. Click for details.',
            { value0: count }
          ),
    tooltip: translate(
      'auto.components.status.bar.NativeChatResumeStatusSegment.failedTooltip',
      'Chats Orca could not resume after the restart. Click for details.'
    )
  }
}

/** True of a refused chat and an unconfirmed one alike, for a list holding either. */
function checkText(count: number): SegmentText {
  return {
    label:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.checkLabelOne',
            '1 chat to check'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.checkLabel',
            '{{value0}} chats to check',
            { value0: count }
          ),
    ariaLabel:
      count === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.checkAriaOne',
            '1 chat to check after resuming. Click for details.'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.checkAria',
            '{{value0}} chats to check after resuming. Click for details.',
            { value0: count }
          ),
    tooltip: translate(
      'auto.components.status.bar.NativeChatResumeStatusSegment.checkTooltip',
      'Chats Orca couldn’t resume, or couldn’t confirm it resumed, after the restart. Click for details.'
    )
  }
}

/** "on studio-mac" after the count, when a paired server is the only machine with chats. */
export function nativeChatResumePendingText(
  pending: number,
  onlyMachineName: string | null,
  breakdown: readonly { count: number; name: string }[]
): SegmentText {
  const label =
    onlyMachineName === null
      ? pending === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.labelOne',
            '1 chat to resume'
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.label',
            '{{value0}} chats to resume',
            { value0: pending }
          )
      : pending === 1
        ? translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.labelOneOnMachine',
            '1 chat to resume on {{value0}}',
            { value0: onlyMachineName }
          )
        : translate(
            'auto.components.status.bar.NativeChatResumeStatusSegment.labelOnMachine',
            '{{value0}} chats to resume on {{value1}}',
            { value0: pending, value1: onlyMachineName }
          )
  const ariaLabel =
    pending === 1
      ? translate(
          'auto.components.status.bar.NativeChatResumeStatusSegment.ariaLabelOne',
          '1 chat available to resume'
        )
      : translate(
          'auto.components.status.bar.NativeChatResumeStatusSegment.ariaLabel',
          '{{value0}} chats available to resume',
          { value0: pending }
        )
  const tooltip =
    breakdown.length > 1
      ? translate(
          'auto.components.status.bar.NativeChatResumeStatusSegment.tooltipByMachine',
          '{{value0}} chats to resume: {{value1}}. Click to choose.',
          {
            value0: pending,
            value1: breakdown
              .map(({ count, name }) =>
                translate(
                  'auto.components.status.bar.NativeChatResumeStatusSegment.tooltipMachinePart',
                  '{{value0}} on {{value1}}',
                  { value0: count, value1: name }
                )
              )
              .join(', ')
          }
        )
      : translate(
          'auto.components.status.bar.NativeChatResumeStatusSegment.tooltip',
          'Open interrupted chats available to resume'
        )
  return { label, ariaLabel, tooltip }
}

export function NativeChatResumeStatusSegment({
  iconOnly
}: {
  iconOnly: boolean
}): React.JSX.Element | null {
  const localEnabled = useNativeChatRestartOfferEnabled()
  useNativeChatRestartOfferSources(localEnabled)
  const offers = useNativeChatRestartOffers()
  const resumingByMachine = useNativeChatRestartResuming()
  const machines = [...offers.keys()]
  // Joined so the selector returns a primitive and re-renders only when a name changes.
  const names = useAppStore((state) =>
    machines.map((machine) => restartMachineNameFromState(state, machine)).join('\u0000')
  ).split('\u0000')
  const nameByMachine = new Map(machines.map((machine, index) => [machine, names[index]]))
  let resuming = 0
  let pending = 0
  let failures = 0
  let unconfirmed = false
  const breakdown: { machine: RestartMachineKey; count: number; name: string }[] = []
  for (const [machine, offer] of offers) {
    // A chat being resumed is counted once, as in flight, until the host answers for it.
    const inFlight = new Set(resumingByMachine.get(machine) ?? [])
    const waiting = offer.failed.filter((failure) => !inFlight.has(failure.sessionId))
    const machinePending = offer.candidates.filter(
      (candidate) => !inFlight.has(candidate.sessionId)
    ).length
    pending += machinePending
    failures += waiting.length
    // An unconfirmed chat may be working, so "failed" would invite a duplicate "continue".
    unconfirmed ||= waiting.some((failure) => failure.outcome === 'unconfirmed')
    if (machinePending > 0) {
      breakdown.push({
        machine,
        count: machinePending,
        name: nameByMachine.get(machine) ?? machine
      })
    }
  }
  for (const ids of resumingByMachine.values()) {
    resuming += ids.length
  }
  const onlyPairedName =
    breakdown.length === 1 && breakdown[0]!.machine !== LOCAL_RESTART_MACHINE
      ? breakdown[0]!.name
      : null
  return (
    <>
      {resuming > 0 && (
        <Segment
          iconOnly={iconOnly}
          count={resuming}
          machines={[...resumingByMachine.keys()]}
          icon={<Loader2 className="size-3 animate-spin text-muted-foreground" />}
          {...resumingText(resuming)}
        />
      )}
      {pending > 0 && (
        <Segment
          iconOnly={iconOnly}
          count={pending}
          machines={breakdown.map((entry) => entry.machine)}
          icon={<RotateCcw className="size-3 text-muted-foreground" />}
          {...nativeChatResumePendingText(pending, onlyPairedName, breakdown)}
        />
      )}
      {failures > 0 && (
        // A different fact from the offer — the outcome of acting on it — so a second entry, not a
        // merged count. Same yellow the skill-update segment uses for its own failed state.
        <Segment
          iconOnly={iconOnly}
          count={failures}
          machines={machines.filter((machine) => (offers.get(machine)?.failed.length ?? 0) > 0)}
          icon={<AlertCircle className="size-3 text-status-warning" />}
          {...(unconfirmed ? checkText(failures) : failedText(failures))}
        />
      )}
    </>
  )
}
