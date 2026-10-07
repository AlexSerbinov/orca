import { describe, expect, it } from 'vitest'
import { nativeChatDictationToggleAction } from './native-chat-dictation-toggle'

function state(overrides: {
  isProcessing?: boolean
  isStarting?: boolean
  isRecording?: boolean
  finishingFailedStream?: boolean
}) {
  return {
    isProcessing: overrides.isProcessing ?? false,
    isStarting: overrides.isStarting ?? false,
    isRecording: overrides.isRecording ?? false,
    isFinishingFailedStream: () => overrides.finishingFailedStream ?? false
  }
}

describe('nativeChatDictationToggleAction', () => {
  it('ignores a tap while a failed stream finishes to keep its text', () => {
    expect(
      nativeChatDictationToggleAction(state({ isProcessing: true, finishingFailedStream: true }))
    ).toBe('ignore')
  })

  it('still cancels a user-started upload on a tap while processing', () => {
    expect(nativeChatDictationToggleAction(state({ isProcessing: true }))).toBe('cancel')
  })

  it('starts, stops and ignores a tap while starting', () => {
    expect(nativeChatDictationToggleAction(state({}))).toBe('start')
    expect(nativeChatDictationToggleAction(state({ isRecording: true }))).toBe('stop')
    expect(nativeChatDictationToggleAction(state({ isStarting: true }))).toBe('ignore')
  })
})
