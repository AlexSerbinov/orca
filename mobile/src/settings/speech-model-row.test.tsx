import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpeechModelRow } from './speech-model-row'
import type { MobileSpeechProviderModel } from '../dictation/speech-provider-reply-schema'

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  AudioLines: 'Icon',
  Check: 'Icon',
  Download: 'Icon',
  KeyRound: 'Icon',
  Trash2: 'Icon'
}))

let renderer: ReactTestRenderer

afterEach(() => {
  act(() => renderer?.unmount())
})

function model(status: MobileSpeechProviderModel['status']): MobileSpeechProviderModel {
  return {
    id: 'm',
    label: 'Model',
    status,
    description: undefined,
    realtime: false,
    languages: undefined,
    sizeBytes: null,
    recommended: false,
    progress: null
  }
}

function renderRow(variant: 'picker' | 'manage', status: MobileSpeechProviderModel['status']) {
  act(() => {
    renderer = create(
      createElement(SpeechModelRow, {
        model: model(status),
        local: false,
        selected: false,
        busy: null,
        locked: false,
        variant,
        onSelect: vi.fn(),
        onDownload: vi.fn(),
        onDelete: vi.fn()
      })
    )
  })
  return renderer.root.findByProps({ testID: 'speech-model-m' })
}

describe('SpeechModelRow accessibility', () => {
  it('renders manage rows as a plain View so nested buttons stay reachable', () => {
    expect(renderRow('manage', 'ready').type).toBe('View')
  })

  it('leaves the key prompt to the provider instead of each cloud model row', () => {
    const row = renderRow('picker', 'not-downloaded')
    expect(row.props.accessible).toBe(false)
    expect(row.findAllByProps({ accessibilityLabel: 'Add API key for Model' })).toHaveLength(0)
  })

  it('keeps a usable picker row as one selectable radio', () => {
    const row = renderRow('picker', 'ready')
    expect(row.props.accessible).toBe(true)
    expect(row.props.accessibilityRole).toBe('radio')
  })
})
