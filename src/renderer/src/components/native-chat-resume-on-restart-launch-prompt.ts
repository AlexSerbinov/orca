import type { RestartMachineKey } from './native-chat-restart-machines'
import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'

/**
 * The one way the resume dialog opens BY ITSELF: this computer's own launch found chats to resume.
 * It takes its turn among the dialogs that open by themselves; every other opening follows a click
 * (status bar, toast) and shows at once.
 */
export function requestLaunchResumePrompt(focus: RestartMachineKey): void {
  requestNativeChatResumeOnRestartDialog('launch', focus)
}
