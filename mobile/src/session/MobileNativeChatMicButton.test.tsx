import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileNativeChatMicButton } from './MobileNativeChatMicButton'

vi.mock('react-native', () => ({ Pressable: 'Pressable' }))
vi.mock('lucide-react-native', () => ({ Mic: 'Icon', Square: 'Icon' }))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function renderButton(disabled: boolean) {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatMicButton, {
        micActive: false,
        dictationMode: 'toggle',
        onMicPress: vi.fn(),
        disabled,
        buttonStyle: undefined,
        pressedStyle: undefined
      })
    )
  })
  return renderer?.root.findByProps({ accessibilityLabel: 'Dictate' })
}

describe('MobileNativeChatMicButton accessibility', () => {
  it('announces a button and its disabled state', () => {
    const disabled = renderButton(true)
    expect(disabled?.props.accessibilityRole).toBe('button')
    expect(disabled?.props.accessibilityState).toEqual({ disabled: true })
    expect(renderButton(false)?.props.accessibilityState).toEqual({ disabled: false })
  })
})
