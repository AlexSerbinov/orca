import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileTerminalInputActions } from './MobileTerminalInputActions'
import type { DictationStatus } from '../hooks/mobile-dictation-session-state'
import type { FailedStreamFinishPhase } from '../hooks/mobile-dictation-stream-salvage'

vi.mock('react-native', () => ({ Pressable: 'Pressable', ActivityIndicator: 'Spinner' }))
vi.mock('lucide-react-native', () => ({ ImagePlus: 'Icon', Mic: 'Icon' }))

let renderer: ReactTestRenderer | undefined
const BUTTON = { opacity: 1 }
const DIMMED = { opacity: 0.4 }

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function renderMic(
  status: DictationStatus,
  dictationMode: 'hold' | 'toggle',
  failedStreamFinish: FailedStreamFinishPhase = 'none'
) {
  const onDictationPressIn = vi.fn()
  act(() => {
    renderer = create(
      createElement(MobileTerminalInputActions, {
        canSend: true,
        isAttaching: false,
        dictation: {
          status,
          failedStreamFinish,
          isStarting: status === 'starting',
          isRecording: status === 'recording',
          isProcessing: status === 'processing'
        },
        dictationMode,
        buttonStyle: BUTTON,
        activeButtonStyle: undefined,
        disabledButtonStyle: DIMMED,
        onAttachImage: vi.fn(),
        onAttachFile: vi.fn(),
        onDictationToggle: vi.fn(),
        onDictationPressIn,
        onDictationPressOut: vi.fn(),
        onDictationCancel: vi.fn()
      })
    )
  })
  const [, mic] = renderer?.root.findAll((node) => String(node.type) === 'Pressable') ?? []
  const [attach] = renderer?.root.findAll((node) => String(node.type) === 'Pressable') ?? []
  return { mic, attach, onDictationPressIn }
}

describe('MobileTerminalInputActions mic', () => {
  it('lets a hold-mode press cancel an upload in progress', () => {
    const { mic, onDictationPressIn } = renderMic('processing', 'hold')
    expect(mic?.props.accessibilityLabel).toBe('Cancel voice dictation')
    expect(mic?.props.accessibilityState).toEqual({ disabled: false, busy: true })
    expect(mic?.props.disabled).toBe(false)
    mic?.props.onPressIn()
    expect(onDictationPressIn).toHaveBeenCalledOnce()
  })

  it('keeps a failed stream salvage uncancellable during its grace period', () => {
    for (const mode of ['hold', 'toggle'] as const) {
      const { mic } = renderMic('processing', mode, 'grace')
      expect(mic?.props.accessibilityLabel).toBe('Finishing voice dictation')
      expect(mic?.props.disabled).toBe(true)
    }
  })

  it('lets a salvage be cancelled once its grace period is over', () => {
    const { mic } = renderMic('processing', 'hold', 'cancellable')
    expect(mic?.props.accessibilityLabel).toBe('Cancel voice dictation')
    expect(mic?.props.disabled).toBe(false)
  })

  it('disables a toggle-mode mic while its start settles and reports it busy', () => {
    const { mic } = renderMic('starting', 'toggle')
    expect(mic?.props.disabled).toBe(true)
    expect(mic?.props.accessibilityState).toEqual({ disabled: true, busy: true })
    expect(mic?.props.style).toContain(DIMMED)
  })

  it('keeps a hold-mode mic live while its start settles so the release still stops it', () => {
    const { mic } = renderMic('starting', 'hold')
    expect(mic?.props.disabled).toBe(false)
    expect(mic?.props.accessibilityState).toEqual({ disabled: false, busy: true })
    expect(mic?.props.style).not.toContain(DIMMED)
  })

  it('dims the mic during a salvage and names both actions as buttons', () => {
    const { mic, attach } = renderMic('processing', 'toggle', 'grace')
    expect(mic?.props.style).toContain(DIMMED)
    expect(mic?.props.accessibilityRole).toBe('button')
    expect(attach?.props.accessibilityRole).toBe('button')
  })
})
