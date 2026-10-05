import { ChevronDown, ChevronRight, Laptop, Server } from 'lucide-react'
import { Checkbox } from './ui/checkbox'
import { translate } from '@/i18n/i18n'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { ResumeOnRestartGroups } from './NativeChatResumeOnRestartGroups'
import type { ResumeFailure } from './native-chat-resume-on-restart-grouping'
import type { ResumeFailureAction } from './native-chat-resume-failure-guidance'
import type { NativeChatRestartMachineOffer } from './native-chat-resume-on-restart-store'

/**
 * One machine in the resume dialog: a row naming it, why it stopped and how many of its chats are
 * picked, with a select-all box and a chevron; open, the machine's workspaces and chats below.
 */
export function ResumeMachineSection({
  offer,
  name,
  expanded,
  onExpandedChange,
  selected,
  selectable,
  busy,
  onToggle,
  onToggleAll,
  failureFor,
  onFailureAction,
  originLabelFor
}: {
  offer: NativeChatRestartMachineOffer
  name: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** The ticked chats on this machine. */
  selected: ReadonlySet<string>
  /** The chats a tick can include; a failure no retry can fix is left out. */
  selectable: readonly string[]
  busy: boolean
  onToggle: (sessionId: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  failureFor: (sessionId: string) => ResumeFailure | undefined
  onFailureAction: (action: ResumeFailureAction, sessionId: string) => void
  originLabelFor: (sessionId: string) => string | undefined
}): React.JSX.Element {
  const rows = [...offer.candidates, ...offer.failed]
  const ticked = rows.filter((row) => selected.has(row.sessionId)).length
  const allTicked = selectable.length > 0 && selectable.every((id) => selected.has(id))
  const latest = Math.max(...rows.map((row) => row.recordedAt))
  const local = offer.target.kind === 'local'
  const cause = rows.some((row) => row.trigger === 'update')
    ? translate(
        'auto.components.NativeChatResumeOnRestartModal.machineCauseUpdate',
        'Installed an update'
      )
    : translate('auto.components.NativeChatResumeOnRestartModal.machineCauseQuit', 'Was quit')
  const count =
    ticked === rows.length
      ? rows.length === 1
        ? translate('auto.components.NativeChatResumeOnRestartModal.machineChatsOne', '1 chat')
        : translate(
            'auto.components.NativeChatResumeOnRestartModal.machineChatsMany',
            '{{value0}} chats',
            { value0: rows.length }
          )
      : translate(
          'auto.components.NativeChatResumeOnRestartModal.machineSelected',
          '{{value0}} of {{value1}} chats selected',
          { value0: ticked, value1: rows.length }
        )
  const MachineIcon = local ? Laptop : Server
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <section className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
        {/* Same select-all box as Orca's other checklists: a dash when only some are ticked. */}
        <Checkbox
          checked={allTicked ? true : ticked > 0 ? 'indeterminate' : false}
          disabled={busy || selectable.length === 0}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
          aria-label={translate(
            'auto.components.NativeChatResumeOnRestartModal.selectMachine',
            'Resume every chat on {{value0}}',
            { value0: name }
          )}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <MachineIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0 text-sm font-medium">{name}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {cause} · {formatShortTimeAgo(latest, offer.listedAt)} · {count}
          </span>
          <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div className="pl-6">
          <ResumeOnRestartGroups
            candidates={rows}
            listedAt={offer.listedAt}
            busy={busy}
            selected={selected}
            onToggle={onToggle}
            failureFor={failureFor}
            onFailureAction={onFailureAction}
            hideHostChip
            originLabelFor={originLabelFor}
          />
        </div>
      )}
    </section>
  )
}
