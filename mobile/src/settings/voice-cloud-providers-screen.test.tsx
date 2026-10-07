import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VoiceCloudProvidersScreen from './voice-cloud-providers-screen'
import { voiceOperations } from './voice-cabinet.test-fixture'

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 })
}))
vi.mock('lucide-react-native', () => ({
  ChevronLeft: 'Icon',
  ChevronRight: 'Icon',
  Laptop: 'Icon'
}))

let renderer: ReactTestRenderer

afterEach(() => {
  act(() => renderer?.unmount())
})

async function mount(onOpenProvider: (providerId: string) => void): Promise<void> {
  const { operations } = voiceOperations({})
  await act(async () => {
    renderer = create(
      createElement(VoiceCloudProvidersScreen, {
        operations,
        focused: true,
        onBack: vi.fn(),
        onOpenProvider
      })
    )
  })
}

describe('VoiceCloudProvidersScreen', () => {
  it('lists only cloud providers with their key status', async () => {
    await mount(vi.fn())
    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('Cloud providers')
    expect(json).toContain('Connected · …a1b2')
    expect(json).toContain('Not connected')
    expect(renderer.root.findAllByProps({ testID: 'voice-provider-local' })).toHaveLength(0)
  })

  it('opens a provider page from its row', async () => {
    const onOpenProvider = vi.fn()
    await mount(onOpenProvider)
    await act(async () => {
      renderer.root.findByProps({ testID: 'voice-provider-deepgram' }).props.onPress()
    })
    expect(onOpenProvider).toHaveBeenCalledWith('deepgram')
  })

  it('says the session desktop is no longer paired instead of loading another desktop', async () => {
    await act(async () => {
      renderer = create(
        createElement(VoiceCloudProvidersScreen, {
          operations: null,
          focused: true,
          unpaired: true,
          onBack: vi.fn(),
          onOpenProvider: vi.fn()
        })
      )
    })
    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('This desktop is no longer paired.')
    expect(json).not.toContain('Connect to a desktop')
  })
})
