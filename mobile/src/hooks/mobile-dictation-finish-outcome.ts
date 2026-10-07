import { dictationFinishReplySchema } from '../dictation/dictation-reply-schema'

export const MOBILE_DICTATION_NO_SPEECH_MESSAGE = 'No speech detected.'

export type MobileDictationFinishOutcome = {
  /** Trimmed transcript to insert; empty when nothing was committed. */
  text: string
  /** Shown after the text is inserted, or alone when there is no text. */
  errorMessage: string | null
}

/**
 * Reads a current finish reply. `streamFailure` is the provider message a chunk already reported;
 * the host repeats that same failure in the reply's `error`, so it is shown once, not twice.
 */
export function readMobileDictationFinishOutcome(
  finished: unknown,
  streamFailure: string | null
): MobileDictationFinishOutcome {
  const reply = dictationFinishReplySchema.parse(finished)
  const text = reply.text?.trim() ?? ''
  const providerFailure = streamFailure ?? (reply.error?.trim() || null)
  return {
    text,
    errorMessage: providerFailure ?? (text ? null : MOBILE_DICTATION_NO_SPEECH_MESSAGE)
  }
}

/** Inserts the text first, then reports the failure, so a partial transcript is never silent. */
export function deliverMobileDictationFinish(
  finished: unknown,
  streamFailure: string | null,
  onTranscript: (text: string) => void,
  onFailure: (error: Error) => void
): void {
  const outcome = readMobileDictationFinishOutcome(finished, streamFailure)
  if (outcome.text) {
    onTranscript(outcome.text)
  }
  if (outcome.errorMessage) {
    onFailure(new Error(outcome.errorMessage))
  }
}
