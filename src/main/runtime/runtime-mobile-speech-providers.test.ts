import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeStore } from './runtime-store-contract'

const keyStore = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  saveCloudSpeechApiKey: vi.fn(),
  clearCloudSpeechApiKey: vi.fn()
}))
const verifyCloudSpeechApiKeyMock = vi.hoisted(() => vi.fn())

vi.mock('../speech/cloud-speech-key-store', () => ({
  hasCloudSpeechApiKey: (id: string) => keyStore.keys.has(id),
  getCloudSpeechApiKeyHint: (id: string) => {
    const key = keyStore.keys.get(id)
    return key ? `…${key.slice(-4)}` : null
  },
  readCloudSpeechApiKey: (id: string) => keyStore.keys.get(id) ?? '',
  saveCloudSpeechApiKey: (id: string, key: string) => {
    keyStore.saveCloudSpeechApiKey(id, key)
    keyStore.keys.set(id, key)
  },
  clearCloudSpeechApiKey: (id: string) => {
    keyStore.clearCloudSpeechApiKey(id)
    keyStore.keys.delete(id)
  }
}))
vi.mock('../speech/cloud-speech-key-verification', () => ({
  verifyCloudSpeechApiKey: verifyCloudSpeechApiKeyMock
}))
vi.mock('../speech/speech-runtime-service', () => ({
  getSpeechModelManager: () => ({
    getModelStates: async () => [{ id: 'parakeet-tdt-0.6b-v3-int8', status: 'ready' }]
  })
}))

import { RuntimeMobileSpeechProviders } from './runtime-mobile-speech-providers'

function createStore(voice: Record<string, unknown> = {}) {
  let settings: { voice?: Record<string, unknown> } = {
    voice: { enabled: true, sttModel: 'soniox-stt-rt-v5', dictationMode: 'hold', ...voice }
  }
  const updateSettings = vi.fn((updates: { voice?: Record<string, unknown> }) => {
    settings = { ...settings, ...updates }
  })
  const store = { getSettings: () => settings, updateSettings }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The providers owner reads only settings accessors.
  const providers = new RuntimeMobileSpeechProviders(() => store as unknown as RuntimeStore)
  return { providers, updateSettings, getVoice: () => settings.voice }
}

beforeEach(() => {
  keyStore.keys.clear()
  keyStore.saveCloudSpeechApiKey.mockClear()
  keyStore.clearCloudSpeechApiKey.mockClear()
  verifyCloudSpeechApiKeyMock.mockReset()
})

describe('RuntimeMobileSpeechProviders', () => {
  it('lists on-device first, then cloud providers in shared order with key hints', async () => {
    keyStore.keys.set('soniox', 'secret-a1b2')
    const { providers } = createStore()

    const state = await providers.list()

    expect(state).toMatchObject({
      enabled: true,
      selectedModelId: 'soniox-stt-rt-v5',
      dictationMode: 'hold',
      language: 'auto'
    })
    expect(state.providers.map((provider) => provider.id)).toEqual([
      'local',
      'soniox',
      'elevenlabs',
      'deepgram',
      'gemini',
      'openai',
      'groq',
      'mistral'
    ])
    expect(state.providers[0]).toMatchObject({ kind: 'local', label: 'On-device', keyHint: null })
    expect(
      state.providers[0].models.find((m) => m.id === 'parakeet-tdt-0.6b-v3-int8')?.status
    ).toBe('ready')
    const soniox = state.providers[1]
    expect(soniox).toMatchObject({ keyConfigured: true, keyHint: '…a1b2' })
    expect(soniox.models[0]).toMatchObject({ id: 'soniox-stt-rt-v5', realtime: true })
    expect(JSON.stringify(state)).not.toContain('secret-a1b2')
  })

  it('verifies before saving and refuses a rejected key', async () => {
    verifyCloudSpeechApiKeyMock.mockResolvedValue({
      ok: false,
      message: 'Soniox rejected this API key (401).'
    })
    const { providers } = createStore()

    await expect(
      providers.saveKey({ providerId: 'soniox', apiKey: 'bad', verify: true })
    ).rejects.toThrow('Soniox rejected this API key (401).')
    expect(keyStore.saveCloudSpeechApiKey).not.toHaveBeenCalled()
  })

  it('verifies a key when the caller omits the verify flag', async () => {
    verifyCloudSpeechApiKeyMock.mockResolvedValue({ ok: false, message: 'Groq rejected it.' })
    const { providers } = createStore()

    await expect(providers.saveKey({ providerId: 'groq', apiKey: 'gsk_typo' })).rejects.toThrow(
      'Groq rejected it.'
    )
    expect(keyStore.saveCloudSpeechApiKey).not.toHaveBeenCalled()
  })

  it('saves a verified key and reports only its hint', async () => {
    verifyCloudSpeechApiKeyMock.mockResolvedValue({ ok: true, message: null })
    const { providers } = createStore()

    const state = await providers.saveKey({
      providerId: 'groq',
      apiKey: ' gsk_9876 ',
      verify: true
    })

    expect(keyStore.saveCloudSpeechApiKey).toHaveBeenCalledWith('groq', 'gsk_9876')
    expect(state.providers.find((provider) => provider.id === 'groq')).toMatchObject({
      keyConfigured: true,
      keyHint: '…9876'
    })
  })

  it('rejects unknown providers', async () => {
    const { providers } = createStore()

    await expect(providers.clearKey({ providerId: 'local' })).rejects.toThrow(
      'voice_provider_unknown'
    )
  })

  it('keeps the selected model when its provider key is cleared', async () => {
    keyStore.keys.set('soniox', 'secret-a1b2')
    const { providers } = createStore()

    const state = await providers.clearKey({ providerId: 'soniox' })

    expect(state.selectedModelId).toBe('soniox-stt-rt-v5')
    expect(state.providers[1]).toMatchObject({ keyConfigured: false, keyHint: null })
  })

  it('tests the saved key and reports a missing one without a request', async () => {
    const { providers } = createStore()

    await expect(providers.testKey({ providerId: 'deepgram' })).resolves.toEqual({
      ok: false,
      message: 'No API key saved.'
    })
    expect(verifyCloudSpeechApiKeyMock).not.toHaveBeenCalled()

    keyStore.keys.set('deepgram', 'dg-key')
    verifyCloudSpeechApiKeyMock.mockResolvedValue({ ok: true, message: null })
    await expect(providers.testKey({ providerId: 'deepgram' })).resolves.toEqual({
      ok: true,
      message: null
    })
    expect(verifyCloudSpeechApiKeyMock).toHaveBeenCalledWith('deepgram', 'dg-key')
  })

  it('writes a known transcription language and rejects unknown codes', async () => {
    const { providers, getVoice } = createStore()

    const state = await providers.configure({ language: 'uk' })

    expect(state.language).toBe('uk')
    expect(getVoice()?.transcriptionLanguage).toBe('uk')
    await expect(providers.configure({ language: 'xx' })).rejects.toThrow('voice_language_unknown')
  })
})
