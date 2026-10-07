import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceModelList } from './VoiceModelList'
import { dictationSetupSchema } from '../dictation/dictation-reply-schema'

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({ Check: 'Icon', Download: 'Icon', Trash2: 'Icon' }))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('VoiceModelList download button', () => {
  it('offers Download only for a model the desktop says is not downloaded or failed', () => {
    const setup = dictationSetupSchema.parse({
      enabled: true,
      dictationMode: 'toggle',
      selectedModelId: '',
      models: [
        { id: 'a', label: 'Verifying', provider: 'local', status: 'verifying' },
        { id: 'b', label: 'Missing', provider: 'local', status: 'not-downloaded' },
        { id: 'c', label: 'Failed', provider: 'local', status: 'error' }
      ]
    })
    act(() => {
      renderer = create(
        createElement(VoiceModelList, {
          setup,
          disabled: false,
          busyAction: null,
          onUseModel: vi.fn(),
          onDownload: vi.fn(),
          onDelete: vi.fn()
        })
      )
    })
    const labelled = (label: string) =>
      renderer?.root.findAllByProps({ accessibilityLabel: label }) ?? []
    expect(labelled('Download Verifying')).toHaveLength(0)
    expect(labelled('Download Missing')).toHaveLength(1)
    expect(labelled('Download Failed')).toHaveLength(1)
  })
})
