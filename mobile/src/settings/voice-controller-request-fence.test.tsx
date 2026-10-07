import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVoiceSettingsController } from './use-voice-settings-controller'
import { useVoiceProviderController } from './use-voice-provider-controller'
import { cabinetState, voiceOperations } from './voice-cabinet.test-fixture'
import type { VoiceSettingsOperations } from './voice-settings-operations'
import type { MobileSpeechProvidersState } from '../dictation/speech-provider-reply-schema'
import type { MobileSpeechSetup } from '../dictation/mobile-dictation-setup'

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }
}))

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type SettingsController = ReturnType<typeof useVoiceSettingsController>
type ProviderController = ReturnType<typeof useVoiceProviderController>

function mountHook<T>(useHook: (operations: VoiceSettingsOperations) => T) {
  const latest: { current: T | null } = { current: null }
  function Harness({ operations }: { operations: VoiceSettingsOperations }) {
    latest.current = useHook(operations)
    return null
  }
  return {
    latest,
    async render(operations: VoiceSettingsOperations) {
      await act(async () => {
        if (renderer) {
          renderer.update(createElement(Harness, { operations }))
        } else {
          renderer = create(createElement(Harness, { operations }))
        }
      })
    }
  }
}

function current<T>(latest: { current: T | null }): T {
  if (!latest.current) {
    throw new Error('hook did not render')
  }
  return latest.current
}

describe('voice settings controller request fencing', () => {
  it('ignores a slow read from the previous desktop after the client changes', async () => {
    const oldList = deferred<MobileSpeechProvidersState>()
    const newList = deferred<MobileSpeechProvidersState>()
    const oldHost = voiceOperations({ list: vi.fn().mockReturnValue(oldList.promise) })
    const newHost = voiceOperations({ list: vi.fn().mockReturnValue(newList.promise) })
    const hook = mountHook((ops) => useVoiceSettingsController(ops, true))
    await hook.render(oldHost.operations)
    await hook.render(newHost.operations)

    await act(async () => oldList.resolve(cabinetState({ language: 'fr' })))
    expect(current<SettingsController>(hook.latest).cabinet).toBeNull()
    await act(async () => newList.resolve(cabinetState({ language: 'de' })))
    expect(current<SettingsController>(hook.latest).cabinet?.language).toBe('de')
  })

  it('drops a configure reply and error from the previous desktop', async () => {
    const slowConfigure = deferred<never>()
    const oldHost = voiceOperations({})
    oldHost.operations.configure = vi.fn().mockReturnValue(slowConfigure.promise)
    const newHost = voiceOperations({})
    const hook = mountHook((ops) => useVoiceSettingsController(ops, true))
    await hook.render(oldHost.operations)
    await act(
      async () => void current<SettingsController>(hook.latest).configure({ enabled: false })
    )
    await hook.render(newHost.operations)

    await act(async () => slowConfigure.reject(new Error('old desktop failed')))
    expect(current<SettingsController>(hook.latest).error).toBeNull()
    expect(current<SettingsController>(hook.latest).cabinet?.enabled).toBe(true)
  })

  it('keeps the newer write when an older configure answers last', async () => {
    const first = deferred<MobileSpeechSetup>()
    const { operations } = voiceOperations({})
    operations.configure = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        enabled: true,
        dictationMode: 'hold',
        selectedModelId: '',
        models: []
      })
    const hook = mountHook((ops) => useVoiceSettingsController(ops, true))
    await hook.render(operations)
    await act(async () => {
      void current<SettingsController>(hook.latest).configure({ dictationMode: 'toggle' })
      void current<SettingsController>(hook.latest).configure({ dictationMode: 'hold' })
    })
    await act(async () =>
      first.resolve({ enabled: true, dictationMode: 'toggle', selectedModelId: '', models: [] })
    )
    expect(current<SettingsController>(hook.latest).cabinet?.dictationMode).toBe('hold')
  })

  it('closes the model drawer when the cabinet selected model is deleted', async () => {
    const { operations } = voiceOperations({
      list: vi.fn().mockResolvedValue(cabinetState({ selectedModelId: 'whisper-tiny' }))
    })
    const hook = mountHook((ops) => useVoiceSettingsController(ops, true))
    await hook.render(operations)
    expect(current<SettingsController>(hook.latest).setup).toBeNull()
    await act(async () => current<SettingsController>(hook.latest).setModelDrawerOpen(true))
    await act(async () => current<SettingsController>(hook.latest).deleteModel('whisper-tiny'))
    expect(current<SettingsController>(hook.latest).modelDrawerOpen).toBe(false)
  })
})

describe('voice provider controller request fencing', () => {
  it('drops a key test verdict that finishes after the key was replaced', async () => {
    const slowTest = deferred<{ ok: boolean; message: string | null }>()
    const { operations } = voiceOperations({ testKey: vi.fn().mockReturnValue(slowTest.promise) })
    const hook = mountHook((ops) => useVoiceProviderController(ops, true))
    await hook.render(operations)
    await act(async () => void current<ProviderController>(hook.latest).testKey('soniox'))
    await act(async () => current<ProviderController>(hook.latest).saveKey('soniox', 'new-key'))
    expect(current<ProviderController>(hook.latest).testResult).toEqual({ ok: true, message: null })

    await act(async () => slowTest.resolve({ ok: false, message: 'Old key rejected (401).' }))
    expect(current<ProviderController>(hook.latest).testResult).toEqual({ ok: true, message: null })
  })

  it('ignores a key save that the previous desktop answers after the client changes', async () => {
    const slowSave = deferred<MobileSpeechProvidersState>()
    const oldHost = voiceOperations({ saveKey: vi.fn().mockReturnValue(slowSave.promise) })
    const newHost = voiceOperations({
      list: vi.fn().mockResolvedValue(cabinetState({ language: 'de' }))
    })
    const hook = mountHook((ops) => useVoiceProviderController(ops, true))
    await hook.render(oldHost.operations)
    await act(async () => void current<ProviderController>(hook.latest).saveKey('deepgram', 'k'))
    await hook.render(newHost.operations)

    await act(async () => slowSave.resolve(cabinetState({ language: 'fr' })))
    const controller = current<ProviderController>(hook.latest)
    expect(controller.state?.language).toBe('de')
    expect(controller.testResult).toBeNull()
  })
})
