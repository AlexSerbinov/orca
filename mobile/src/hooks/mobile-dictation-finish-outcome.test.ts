import { describe, expect, it, vi } from 'vitest'
import {
  MOBILE_DICTATION_NO_SPEECH_MESSAGE,
  deliverMobileDictationFinish,
  readMobileDictationFinishOutcome
} from './mobile-dictation-finish-outcome'

describe('readMobileDictationFinishOutcome', () => {
  it('keeps the text and the provider error a newer desktop reports on finish', () => {
    expect(
      readMobileDictationFinishOutcome({ text: ' First part. ', error: 'Flush failed' }, null)
    ).toEqual({ text: 'First part.', errorMessage: 'Flush failed' })
  })

  it('shows a failure a chunk already reported once, not twice', () => {
    expect(
      readMobileDictationFinishOutcome({ text: 'kept', error: 'Soniox closed' }, 'Soniox closed')
    ).toEqual({ text: 'kept', errorMessage: 'Soniox closed' })
  })

  it('reads an old desktop reply without an error member as success', () => {
    expect(readMobileDictationFinishOutcome({ dictationId: 'd', text: 'hi' }, null)).toEqual({
      text: 'hi',
      errorMessage: null
    })
  })

  it('degrades an unreadable reply to no speech instead of throwing', () => {
    for (const reply of [null, 'text', { text: 5, error: 7 }]) {
      expect(readMobileDictationFinishOutcome(reply, null)).toEqual({
        text: '',
        errorMessage: MOBILE_DICTATION_NO_SPEECH_MESSAGE
      })
    }
  })
})

describe('deliverMobileDictationFinish', () => {
  it('inserts the text before reporting the error', () => {
    const calls: string[] = []
    deliverMobileDictationFinish(
      { text: 'kept', error: 'Flush failed' },
      null,
      (text) => calls.push(`text:${text}`),
      (error) => calls.push(`error:${error.message}`)
    )
    expect(calls).toEqual(['text:kept', 'error:Flush failed'])
  })

  it('reports nothing extra for a clean finish', () => {
    const onFailure = vi.fn()
    deliverMobileDictationFinish({ text: 'kept' }, null, vi.fn(), onFailure)
    expect(onFailure).not.toHaveBeenCalled()
  })
})
