// The words for a reply Orca's own stop cut off, by cause and machine. One function, so the chat's
// row wording can change in one place.

import { translate } from '@/i18n/i18n'
import type { AgentSessionOrcaStopCause } from '../../../../shared/agent-session-orca-stop'
import { joinSentences } from '../../../../shared/sentence-joining'

const STOPPED: Record<AgentSessionOrcaStopCause, (machine: string) => string> = {
  update: (machine) =>
    translate(
      'components.native-chat.notices.orcaStopUpdate',
      'Orca on {{machine}} restarted for an update while this response was in progress.',
      { machine }
    ),
  quit: (machine) =>
    translate(
      'components.native-chat.notices.orcaStopQuit',
      'Orca on {{machine}} was closed while this response was in progress.',
      { machine }
    ),
  crash: (machine) =>
    translate(
      'components.native-chat.notices.orcaStopCrash',
      'Orca on {{machine}} stopped unexpectedly while this response was in progress.',
      { machine }
    )
}

/** The row's sentence. While Continue is offered beside it, the button is the way on, so the row
 *  does not say it again. */
export function nativeChatOrcaStopRowText(
  cause: AgentSessionOrcaStopCause,
  machine: string,
  options: { continueOffered: boolean }
): string {
  return options.continueOffered
    ? STOPPED[cause](machine)
    : joinSentences([
        STOPPED[cause](machine),
        translate(
          'components.native-chat.notices.orcaStopCanContinue',
          'You can continue in this conversation.'
        )
      ])
}
