import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useNativeChatRestartOfferEnabled } from './native-chat-restart-offer-gate'
import { RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { useAppStore } from '../store'
import { translate } from '@/i18n/i18n'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { ResumeOnRestartGroups } from './NativeChatResumeOnRestartGroups'
import { ResumeMachineSection } from './NativeChatResumeOnRestartMachineSection'
import type { ResumeFailureAction } from './native-chat-resume-failure-guidance'
import type { ResumeFailure } from './native-chat-resume-on-restart-grouping'
import {
  consumeNativeChatResumeOnRestartDialogRequest,
  getNativeChatResumeOnRestartDialogRequest,
  subscribeNativeChatResumeOnRestartDialog
} from './native-chat-resume-on-restart-dialog'
import {
  continueNativeChatRestartOffer,
  dismissNativeChatRestartOffer,
  useNativeChatRestartOffers,
  useNativeChatRestartResuming,
  type NativeChatRestartMachineOffer
} from './native-chat-resume-on-restart-store'
import { useNativeChatRestartOfferSources } from './native-chat-restart-offer-triggers'
import { LOCAL_RESTART_MACHINE, type RestartMachineKey } from './native-chat-restart-machines'
import { restartMachineNameFromState } from './native-chat-restart-machine-name'
import {
  parseResumeOwnership,
  resumeCandidateOwnership,
  resumeOwnershipLabel
} from './native-chat-resume-ownership'
import {
  chosenResumeRows,
  resumeRowKey,
  resumeRowSelectedByDefault,
  selectableResumeRows,
  type ResumeSelectionMachine
} from './native-chat-resume-selection'

/**
 * What would be resumed, shown before anything runs — on every machine with chats to resume.
 *
 * Resuming reattaches a chat AND asks the agent to carry on, so the list is the point: the user
 * sees which chats each machine's last teardown recorded as mid-turn before a message goes
 * anywhere. Every string here has to say that a message is sent and that the user's own prompt is
 * not re-sent.
 *
 * Each machine is a row with a select-all box, opening onto its workspaces and chats. The user's
 * own chats start ticked; chats another device, an automation or the server itself started are
 * listed unticked with where they came from. Only this computer, alone, keeps the flat list.
 *
 * The "don't ask again" box removes the PROMPT, never a safety check — an opted-in launch or
 * reconnect calls the same RPC, which re-derives the same predicate and staggers the same way.
 *
 * Resume closes the dialog at once and the status-bar entry carries the run, then any chat it could
 * not carry on. A chat an earlier resume could not carry on is listed too, as the same row plus
 * what went wrong and what to do; selecting it and resuming is a retry. Row actions act on their
 * row and leave the dialog open. It closes only on the user's own way out, or once no machine has
 * anything left.
 *
 * Closing is a SNOOZE, so looking around before deciding cannot remove the recovery. Dismiss all is
 * the explicit path that deletes the durable records.
 */

type MachineView = ResumeSelectionMachine & {
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
function useMachineViews(
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
        offer,
        name: facts?.name ?? offer.machine,
        rows,
        failureFor: (sessionId: string) => failureById.get(sessionId),
        ownershipFor: (sessionId: string) => ownershipById.get(sessionId) ?? 'unknown'
      }
    })
  }, [joined, offers])
}

export function NativeChatResumeOnRestartModal(): React.JSX.Element | null {
  const localEnabled = useNativeChatRestartOfferEnabled()
  useNativeChatRestartOfferSources(localEnabled)
  const offers = useNativeChatRestartOffers()
  const machines = useMachineViews(offers)
  // Open is an external request, never mirrored into local state: the launch load, the status-bar
  // entry and a reconnect toast all raise it, and a copy here would go stale against the last one.
  const request = useSyncExternalStore(
    subscribeNativeChatResumeOnRestartDialog,
    getNativeChatResumeOnRestartDialogRequest,
    getNativeChatResumeOnRestartDialogRequest
  )
  const updateSettings = useAppStore((store) => store.updateSettings)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  // The store's: the resume outlives this dialog, which can close or reopen mid-run.
  const resuming = useNativeChatRestartResuming()
  const busy = resuming.size > 0
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map()
  )
  // Each opening starts from the rows' defaults. This component never unmounts, so an untick made
  // before a close would otherwise greet a reopen, e.g. as "Resume 0 chats" over what a run left.
  const [openedWith, setOpenedWith] = useState(request)
  if (openedWith !== request) {
    setOpenedWith(request)
    if (request) {
      setOverrides(new Map())
      setExpandedOverrides(new Map())
    }
  }
  const chosen = useMemo(
    () => machines.map((machine) => ({ machine, ids: chosenResumeRows(machine, overrides) })),
    [machines, overrides]
  )
  const chosenCount = chosen.reduce((total, entry) => total + entry.ids.length, 0)

  const toggle = useCallback((machine: RestartMachineKey, sessionId: string, checked: boolean) => {
    setOverrides((current) => new Map(current).set(resumeRowKey(machine, sessionId), checked))
  }, [])

  /** Applied on whichever action the user takes, so the box means the same thing every way out. */
  const persistPreference = useCallback(async (): Promise<void> => {
    if (dontAskAgain) {
      await updateSettings({ nativeChatResumeWorkOnRestart: true }).catch(() => undefined)
    }
  }, [dontAskAgain, updateSettings])

  /** Closing is a snooze: each host keeps its offer and the status bar keeps the way back. */
  const snooze = useCallback((): void => {
    consumeNativeChatResumeOnRestartDialogRequest()
    void persistPreference()
  }, [persistPreference])

  const dismissAll = async (): Promise<void> => {
    void persistPreference()
    // Bookkeeping never gates the user's own action: the dialog closes here whatever each host
    // answers, rather than being trapped open behind a rejected promise.
    consumeNativeChatResumeOnRestartDialogRequest()
    await Promise.all(
      machines.map((machine) =>
        // This computer forgets everything it listed; a paired server is told which chats.
        machine.offer.target.kind === 'local'
          ? dismissNativeChatRestartOffer(machine.machine)
          : dismissNativeChatRestartOffer(
              machine.machine,
              machine.rows.map((row) => row.sessionId)
            )
      )
    )
  }

  const actOnFailure = async (
    machine: MachineView,
    action: ResumeFailureAction,
    sessionId: string
  ): Promise<void> => {
    if (action === 'dismiss') {
      await dismissNativeChatRestartOffer(machine.machine, [sessionId])
      return
    }
    if (action === 'retry') {
      void persistPreference()
      await continueNativeChatRestartOffer(machine.machine, [sessionId])
      return
    }
    const failure = machine.failureFor(sessionId)
    if (!failure) {
      return
    }
    // Opening is read-only and keeps the record: the user's own send in that chat settles it. The
    // dialog gets out of the way of the chat it just opened.
    consumeNativeChatResumeOnRestartDialogRequest()
    await activateAiVaultStructuredSession({
      structuredSession: {
        workspaceId: failure.workspaceId,
        sessionId,
        // The machine that listed it, never re-derived from whichever workspace shares its id.
        executionHostId: failure.executionHostId
      }
    })
  }

  if (!request || machines.length === 0) {
    return null
  }

  const flat = machines.length === 1 && machines[0]!.offer.target.kind === 'local'
  const rowsAcrossMachines = machines.flatMap((machine) => machine.rows)
  const interruptedByUpdate = rowsAcrossMachines.some((row) => row.trigger === 'update')
  const tickedFor = (machine: MachineView): ReadonlySet<string> =>
    new Set(
      // Mid-run the ticks show what is running; this opening's own ticks may name chats left out.
      busy
        ? (resuming.get(machine.machine) ?? [])
        : (chosen.find((entry) => entry.machine === machine)?.ids ?? [])
    )
  const originLabelFor = (machine: MachineView) => (sessionId: string) =>
    resumeOwnershipLabel(machine.ownershipFor(sessionId), machine.name)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          snooze()
        }
      }}
    >
      {/* Height is capped, never the data: the list scrolls inside the dialog so the header and
          the primary action stay put however many chats were interrupted. */}
      {/* Wide enough for a sidebar card's chat row to keep its name, model and age on one line. */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>
            {/* Plain wrapper owns the icon spacing; DialogTitle owns its own. */}
            <span className="flex items-center gap-2">
              <RotateCcw className="size-4 text-muted-foreground" />
              {translate(
                'auto.components.NativeChatResumeOnRestartModal.title',
                'Resume interrupted chats?'
              )}
            </span>
          </DialogTitle>
          <DialogDescription>
            {!flat
              ? translate(
                  'auto.components.NativeChatResumeOnRestartModal.machinesBody',
                  'These chats were working when Orca on their machine closed or installed an update. Resuming restores each one where it stopped, with its full context, and asks the agent to check what it was doing before carrying on. Your own prompt is not re-sent.'
                )
              : interruptedByUpdate
                ? translate(
                    'auto.components.NativeChatResumeOnRestartModal.updateBody',
                    'These chats were working when Orca installed an update. Resuming restores each one where it stopped, with its full context, and asks the agent to check what it was doing before carrying on. Your own prompt is not re-sent.'
                  )
                : translate(
                    'auto.components.NativeChatResumeOnRestartModal.body',
                    'These chats were working when Orca closed. Resuming restores each one where it stopped, with its full context, and asks the agent to check what it was doing before carrying on. Your own prompt is not re-sent.'
                  )}
          </DialogDescription>
        </DialogHeader>

        <div
          tabIndex={0}
          aria-label={translate(
            'auto.components.NativeChatResumeOnRestartModal.listLabel',
            'Chats that would be resumed'
          )}
          // The sidebar's own surface, so its cards read here as they do there.
          className="min-h-0 overflow-y-auto scrollbar-sleek rounded-md border bg-worktree-sidebar p-1.5"
        >
          {flat ? (
            <ResumeOnRestartGroups
              candidates={machines[0]!.rows}
              listedAt={machines[0]!.offer.listedAt}
              busy={busy}
              selected={tickedFor(machines[0]!)}
              onToggle={(sessionId, checked) => toggle(machines[0]!.machine, sessionId, checked)}
              failureFor={machines[0]!.failureFor}
              onFailureAction={(action, sessionId) =>
                void actOnFailure(machines[0]!, action, sessionId)
              }
              originLabelFor={originLabelFor(machines[0]!)}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {machines.map((machine) => {
                const ticked = tickedFor(machine)
                const selectable = selectableResumeRows(machine)
                // Opened for this machine, or nothing on it starts ticked (so its empty box is
                // explained), or it is the only machine listed.
                const expandedByDefault =
                  request.focus === machine.machine ||
                  machines.length === 1 ||
                  !machine.rows.some((row) =>
                    resumeRowSelectedByDefault(
                      machine.ownershipFor(row.sessionId),
                      machine.failureFor(row.sessionId)
                    )
                  )
                return (
                  <ResumeMachineSection
                    key={machine.machine}
                    offer={machine.offer}
                    name={machine.name}
                    expanded={expandedOverrides.get(machine.machine) ?? expandedByDefault}
                    onExpandedChange={(expanded) =>
                      setExpandedOverrides((current) =>
                        new Map(current).set(machine.machine, expanded)
                      )
                    }
                    selected={ticked}
                    selectable={selectable}
                    busy={busy}
                    onToggle={(sessionId, checked) => toggle(machine.machine, sessionId, checked)}
                    onToggleAll={(checked) =>
                      setOverrides((current) => {
                        const next = new Map(current)
                        for (const sessionId of selectable) {
                          next.set(resumeRowKey(machine.machine, sessionId), checked)
                        }
                        return next
                      })
                    }
                    failureFor={machine.failureFor}
                    onFailureAction={(action, sessionId) =>
                      void actOnFailure(machine, action, sessionId)
                    }
                    originLabelFor={originLabelFor(machine)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Two controls: one deletes the offers, one acts on them. Closing snoozes, so it needs none. */}
        <DialogFooter className="sm:items-center">
          <label className="flex min-w-0 items-start gap-2.5 sm:mr-auto">
            <Checkbox
              checked={dontAskAgain}
              disabled={busy}
              onCheckedChange={(next) => setDontAskAgain(next === true)}
              className="mt-0.5"
            />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm">
                {translate(
                  'auto.components.NativeChatResumeOnRestartModal.dontAskAgain',
                  "Don't ask again (resume automatically)"
                )}
              </span>
              {/* Where to undo it; what it does is the body copy's job. */}
              <span className="block text-xs text-muted-foreground">
                {translate(
                  'auto.components.NativeChatResumeOnRestartModal.dontAskAgainHint',
                  'You can turn this off in Settings → Experimental → Chat UI.'
                )}
              </span>
            </span>
          </label>
          {/* Quiet, explicit cleanup of the durable records. */}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void dismissAll()}>
            {translate('auto.components.NativeChatResumeOnRestartModal.dismissAll', 'Dismiss all')}
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={busy || chosenCount === 0}
            onClick={() => {
              // Resume hands the run to the status bar.
              consumeNativeChatResumeOnRestartDialogRequest()
              void persistPreference()
              for (const entry of chosen) {
                void continueNativeChatRestartOffer(entry.machine.machine, entry.ids)
              }
            }}
          >
            {busy
              ? translate('auto.components.NativeChatResumeOnRestartModal.resuming', 'Resuming…')
              : chosenCount === 1
                ? translate(
                    'auto.components.NativeChatResumeOnRestartModal.resumeSelectedOne',
                    'Resume 1 chat'
                  )
                : translate(
                    'auto.components.NativeChatResumeOnRestartModal.resumeSelected',
                    'Resume {{value0}} chats',
                    { value0: chosenCount }
                  )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
