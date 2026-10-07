import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileNativeChatMicButton } from './MobileNativeChatMicButton'
import type { MobileDictationPhase } from './native-chat-dictation-toggle'

vi.mock('react-native', () => ({ Pressable: 'Pressable', ActivityIndicator: 'Spinner' }))
vi.mock('lucide-react-native', () => ({ Mic: 'Icon', Square: 'Icon' }))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function renderButton(
  disabled: boolean,
  dictationPhase: MobileDictationPhase = 'idle',
  dictationMode = 'toggle'
) {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatMicButton, {
        dictationPhase,
        dictationMode,
        onMicPress: vi.fn(),
        disabled,
        buttonStyle: undefined,
        pressedStyle: undefined
      })
    )
  })
  const button = renderer?.root.findByProps({ accessibilityRole: 'button' })
  return {
    label: button?.props.accessibilityLabel,
    state: button?.props.accessibilityState,
    disabled: button?.props.disabled,
    spinner: (renderer?.root.findAll((node) => String(node.type) === 'Spinner') ?? []).length > 0
  }
}

describe('MobileNativeChatMicButton accessibility', () => {
  it('announces a button and its disabled state', () => {
    expect(renderButton(true).state).toEqual({ disabled: true, busy: false })
    expect(renderButton(false)).toMatchObject({ label: 'Dictate', disabled: false })
  })

  it('announces what a tap does in each toggle phase', () => {
    expect(renderButton(false, 'starting')).toMatchObject({
      label: 'Starting dictation',
      state: { disabled: true, busy: true },
      disabled: true
    })
    expect(renderButton(false, 'recording')).toMatchObject({
      label: 'Stop dictation',
      disabled: false
    })
    expect(renderButton(false, 'processing')).toMatchObject({
      label: 'Cancel transcription',
      state: { disabled: false, busy: true },
      disabled: false,
      spinner: true
    })
    expect(renderButton(false, 'salvaging')).toMatchObject({
      label: 'Finishing dictation',
      state: { disabled: true, busy: true },
      disabled: true,
      spinner: true
    })
  })

  it('keeps a hold-mode start pressable so releasing it can cancel', () => {
    expect(renderButton(false, 'starting', 'hold')).toMatchObject({
      label: 'Starting dictation',
      disabled: false
    })
    expect(renderButton(false, 'processing', 'hold')).toMatchObject({
      label: 'Finishing dictation',
      disabled: true
    })
  })
})
