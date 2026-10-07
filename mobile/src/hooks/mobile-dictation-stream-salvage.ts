import { parseDictationStreamFailure } from '../../../src/shared/dictation-stream-failure'

export type MobileDictationStreamSalvage = {
  /** True when the host reported this dictation's stream failed; the first claim runs `finish`
   *  (null while a stop is already finishing). False keeps the cancel path for any other error. */
  claim: (dictationId: string, err: unknown, finish: (() => Promise<void>) | null) => boolean
  /** The provider message to show once the salvaged text is inserted; clears it. */
  take: (dictationId: string) => string | null
  /** A failed stream's finish is underway (or its message not yet shown). */
  isPending: () => boolean
  reset: () => void
}

export function createMobileDictationStreamSalvage(): MobileDictationStreamSalvage {
  let pending: { dictationId: string; message: string } | null = null
  return {
    claim: (dictationId, err, finish) => {
      const message = parseDictationStreamFailure(err instanceof Error ? err.message : String(err))
      if (message === null) {
        return false
      }
      if (pending?.dictationId !== dictationId) {
        pending = { dictationId, message }
        void finish?.()
      }
      return true
    },
    take: (dictationId) => {
      const message = pending?.dictationId === dictationId ? pending.message : null
      pending = null
      return message
    },
    isPending: () => pending !== null,
    reset: () => {
      pending = null
    }
  }
}
