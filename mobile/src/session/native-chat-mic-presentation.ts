import type { MobileDictationPhase } from './native-chat-dictation-toggle'

export type NativeChatMicPresentation = {
  label: string
  icon: 'mic' | 'stop' | 'spinner'
  busy: boolean
  /** The phase has nothing for a press to do, so the button is disabled rather than silently inert. */
  ignoresPress: boolean
}

/** Mirrors what a press does in each phase (nativeChatDictationToggleAction / HoldPressInAction). */
export function nativeChatMicPresentation(
  phase: MobileDictationPhase,
  hold: boolean
): NativeChatMicPresentation {
  switch (phase) {
    case 'starting':
      // Why: in hold mode the finger is still down, and its release must reach the button to cancel.
      return { label: 'Starting dictation', icon: 'mic', busy: true, ignoresPress: !hold }
    case 'recording':
      return { label: 'Stop dictation', icon: 'stop', busy: false, ignoresPress: false }
    case 'processing':
      // Why: both modes cancel an upload on a press (see nativeChatDictationHoldPressInAction).
      return { label: 'Cancel transcription', icon: 'spinner', busy: true, ignoresPress: false }
    case 'salvaging':
      return { label: 'Finishing dictation', icon: 'spinner', busy: true, ignoresPress: true }
    default:
      return { label: 'Dictate', icon: 'mic', busy: false, ignoresPress: false }
  }
}
