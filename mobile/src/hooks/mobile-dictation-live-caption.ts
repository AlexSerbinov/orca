import { useCallback, useRef, useState } from 'react'
import type { MobileDictationCaptionReply } from '../dictation/dictation-reply-schema'
import type { DictationStatus } from './mobile-dictation-session-state'

/**
 * Orders the live captions chunk replies carry. Chunk RPCs overlap (one every ~32 ms), so replies
 * can land out of order; the host's per-dictation revision only grows, so anything not newer than
 * what is shown is stale. A new dictation id starts a fresh revision sequence.
 */
export class MobileDictationLiveCaptionTracker {
  private dictationId: string | null = null
  private revision = Number.NEGATIVE_INFINITY
  private text = ''

  /** Returns the caption to show, or null when this reply changes nothing. */
  accept(dictationId: string, caption: MobileDictationCaptionReply): string | null {
    if (dictationId !== this.dictationId) {
      this.dictationId = dictationId
      this.revision = Number.NEGATIVE_INFINITY
      this.text = ''
    }
    if (caption.revision <= this.revision) {
      return null
    }
    this.revision = caption.revision
    const text = caption.text.trim()
    if (text === this.text) {
      return null
    }
    this.text = text
    return text
  }
}

/**
 * Live caption state for useMobileDictation. `isCurrent` must answer from refs written
 * synchronously (status + active id), so a reply that lands after stop/cancel is dropped even
 * before the next render clears what is shown.
 */
export function useMobileDictationLiveCaption(
  status: DictationStatus,
  isCurrent: (dictationId: string) => boolean
): {
  caption: string
  acceptCaption: (dictationId: string, caption: MobileDictationCaptionReply) => void
} {
  const trackerRef = useRef(new MobileDictationLiveCaptionTracker())
  const isCurrentRef = useRef(isCurrent)
  isCurrentRef.current = isCurrent
  const [caption, setCaption] = useState('')
  const [captionStatus, setCaptionStatus] = useState(status)
  // Why: reset during render rather than in an Effect so a stale caption never paints once.
  if (status !== captionStatus) {
    setCaptionStatus(status)
    if (status !== 'recording') {
      setCaption('')
    }
  }

  const acceptCaption = useCallback((dictationId: string, next: MobileDictationCaptionReply) => {
    if (!isCurrentRef.current(dictationId)) {
      return
    }
    const text = trackerRef.current.accept(dictationId, next)
    if (text !== null) {
      setCaption(text)
    }
  }, [])

  return { caption, acceptCaption }
}
