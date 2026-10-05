import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import { useStructuredAgentSessionHostCapability } from '@/runtime/structured-agent-session-host-capability'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import { latestNativeChatOrcaStopCut } from '../../../../shared/native-chat-orca-stop-cut'
import { AGENT_SESSION_CONTINUE_INTERRUPTED_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'

type ContinueAnswer = { outcome?: string }

/**
 * Continue, while the chat's latest turn is a reply an Orca stop cut off and nothing was sent since.
 * Shown only for a host that has the operation; an older host writes no row naming the stop, so it
 * never has a cut to show this for. The chat itself reports what the continuation did.
 */
export function NativeChatInterruptedContinue({
  target,
  sessionId,
  journalItems,
  submissions,
  isWorking,
  onError
}: {
  target: RuntimeClientTarget
  sessionId: string
  journalItems: readonly AgentJournalRenderItem[]
  submissions: readonly Pick<AgentJournalSubmission, 'dispatchState'>[]
  isWorking: boolean
  onError: (message: string | null) => void
}): React.JSX.Element | null {
  const supported = useStructuredAgentSessionHostCapability(
    target,
    AGENT_SESSION_CONTINUE_INTERRUPTED_RUNTIME_CAPABILITY
  )
  const cut = useMemo(
    () => latestNativeChatOrcaStopCut(journalItems, submissions),
    [journalItems, submissions]
  )
  // The cut this client already asked to continue: hidden until the journal shows what came of it.
  const [asked, setAsked] = useState<string | null>(null)
  if (!supported || !cut || isWorking || asked === cut.turnItemId) {
    return null
  }
  const turnItemId = cut.turnItemId
  const onContinue = (): void => {
    setAsked(turnItemId)
    onError(null)
    void callStructuredAgentSession<ContinueAnswer>(target, 'agentSession.continueInterrupted', {
      sessionId,
      turnItemId
    }).then(
      (answer) => {
        // Refused before anything was sent: the host's note says why, and Continue may try again.
        if (answer.outcome === 'refused') {
          setAsked((current) => (current === turnItemId ? null : current))
        }
      },
      () => {
        setAsked((current) => (current === turnItemId ? null : current))
        onError(
          translate(
            'components.native-chat.interruptedContinue.failed',
            "Couldn't continue this chat. Try again, or send a message."
          )
        )
      }
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-end px-4 py-1">
      <Button type="button" variant="ghost" size="xs" onClick={onContinue}>
        <Play className="size-3" />
        {translate('components.native-chat.interruptedContinue.continue', 'Continue')}
      </Button>
    </div>
  )
}
