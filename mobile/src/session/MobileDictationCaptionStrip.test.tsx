import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileDictationCaptionStrip } from './MobileDictationCaptionStrip'
import { MobileTerminalLiveInputStatus } from './MobileTerminalLiveInputStatus'

vi.mock('react-native', () => {
  class AnimatedValue {
    setValue(): void {}
  }
  const animation = { start() {}, stop() {} }
  return {
    View: 'View',
    Text: 'Text',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Animated: {
      Value: AnimatedValue,
      View: 'AnimatedView',
      loop: () => animation,
      sequence: () => animation,
      timing: () => animation
    }
  }
})

let renderer: ReactTestRenderer

afterEach(() => {
  act(() => renderer?.unmount())
})

function render(element: ReturnType<typeof createElement>): string {
  act(() => {
    renderer = create(element)
  })
  return JSON.stringify(renderer.toJSON())
}

const idle = { isRecording: false, isProcessing: false, isStarting: false, caption: '' }

describe('MobileDictationCaptionStrip', () => {
  it('renders nothing while the mic is closed', () => {
    expect(
      render(createElement(MobileDictationCaptionStrip, { dictation: idle, variant: 'dock' }))
    ).toBe('null')
  })

  it('says it is listening until the first caption arrives', () => {
    const json = render(
      createElement(MobileDictationCaptionStrip, {
        dictation: { ...idle, isRecording: true },
        variant: 'card'
      })
    )
    expect(json).toContain('Listening…')
    expect(json).toContain('AnimatedView')
  })

  it('shows the newest words, head-ellipsized over two lines', () => {
    render(
      createElement(MobileDictationCaptionStrip, {
        dictation: { ...idle, isRecording: true, caption: 'make the captions follow' },
        variant: 'dock'
      })
    )
    const caption = renderer.root.findByProps({ children: 'make the captions follow' })
    expect(caption.props.numberOfLines).toBe(2)
    expect(caption.props.ellipsizeMode).toBe('head')
  })

  it('drops the caption for a transcribing note once the user stops', () => {
    const json = render(
      createElement(MobileDictationCaptionStrip, {
        dictation: { ...idle, isProcessing: true, caption: 'stale words' },
        variant: 'dock'
      })
    )
    expect(json).toContain('Transcribing…')
    expect(json).not.toContain('stale words')
  })
})

describe('MobileTerminalLiveInputStatus caption', () => {
  it('replaces the stop hint with the live caption while recording', () => {
    const props = { isAttaching: false, liveInputText: '' }
    expect(
      render(
        createElement(MobileTerminalLiveInputStatus, {
          ...props,
          dictation: { ...idle, isRecording: true, caption: 'git status' }
        })
      )
    ).toContain('git status')
    expect(
      render(
        createElement(MobileTerminalLiveInputStatus, {
          ...props,
          dictation: { ...idle, isRecording: true }
        })
      )
    ).toContain('Tap mic to stop')
  })
})
