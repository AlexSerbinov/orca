import type { RestartMachineKey } from './native-chat-restart-machines'
import { requestNativeChatResumeOnRestartDialog } from './native-chat-resume-on-restart-dialog'

/**
 * The one way the resume dialog opens BY ITSELF: this computer's own launch found chats to resume.
 * Every other opening follows a click (status bar, toast) and goes straight to the dialog.
 *
 * Kept apart so dialogs that open by themselves after a restart can take turns here.
 */
export function requestLaunchResumePrompt(focus: RestartMachineKey): void {
  requestNativeChatResumeOnRestartDialog(focus)
}
