import type { UseMobileDictationResult } from '../hooks/use-mobile-dictation'

export type NativeChatDictationToggleAction = 'start' | 'stop' | 'cancel' | 'ignore'

/** Toggle mode: one tap starts, the next stops; a tap while processing cancels the upload. */
export function nativeChatDictationToggleAction(
  dictation: Pick<
    UseMobileDictationResult,
    'isProcessing' | 'isStarting' | 'isRecording' | 'isFinishingFailedStream'
  >
): NativeChatDictationToggleAction {
  if (dictation.isProcessing) {
    // Why: a failed stream is finishing on its own to keep its text; a tap meant "stop", not "discard".
    return dictation.isFinishingFailedStream() ? 'ignore' : 'cancel'
  }
  if (dictation.isStarting) {
    // The start request is still settling; a second toggle is intentionally ignored.
    return 'ignore'
  }
  return dictation.isRecording ? 'stop' : 'start'
}
