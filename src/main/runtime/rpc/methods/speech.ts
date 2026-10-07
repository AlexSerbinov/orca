import { defineMethod } from '../core'
import {
  DictationChunk,
  DictationHandle,
  DictationSetup,
  DictationStart,
  SpeechModelAction,
  SpeechProviderAction,
  SpeechProviderConfigure,
  SpeechProviderKeySave
} from '../../../../shared/rpc-contract/speech-params'

export const SPEECH_METHODS = [
  defineMethod({
    name: 'speech.models.list',
    params: null,
    handler: async (_params, { runtime }) => runtime.listMobileSpeechModels()
  }),
  defineMethod({
    name: 'speech.models.download',
    params: SpeechModelAction,
    handler: async (params, { runtime }) => runtime.downloadMobileSpeechModel(params.modelId)
  }),
  defineMethod({
    name: 'speech.models.delete',
    params: SpeechModelAction,
    handler: async (params, { runtime }) => runtime.deleteMobileSpeechModel(params.modelId)
  }),
  defineMethod({
    name: 'speech.dictation.setup',
    params: DictationSetup,
    handler: async (params, { runtime }) =>
      runtime.configureMobileDictation({
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
        ...(params.modelId !== undefined ? { modelId: params.modelId } : {}),
        ...(params.dictationMode !== undefined ? { dictationMode: params.dictationMode } : {})
      })
  }),
  defineMethod({
    name: 'speech.dictation.start',
    params: DictationStart,
    handler: async (params, { runtime, clientId, connectionId }) =>
      runtime.startMobileDictation({ ...params, clientId, connectionId })
  }),
  defineMethod({
    name: 'speech.dictation.chunk',
    params: DictationChunk,
    handler: (params, { runtime, clientId, connectionId }) =>
      runtime.feedMobileDictation({ ...params, clientId, connectionId })
  }),
  defineMethod({
    name: 'speech.dictation.finish',
    params: DictationHandle,
    handler: async (params, { runtime, clientId, connectionId }) =>
      runtime.finishMobileDictation({ ...params, clientId, connectionId })
  }),
  defineMethod({
    name: 'speech.dictation.cancel',
    params: DictationHandle,
    handler: async (params, { runtime, clientId, connectionId }) =>
      runtime.cancelMobileDictation({ ...params, clientId, connectionId })
  }),
  defineMethod({
    name: 'speech.providers.list',
    params: null,
    handler: async (_params, { runtime }) => runtime.listMobileSpeechProviders()
  }),
  defineMethod({
    name: 'speech.providers.saveKey',
    params: SpeechProviderKeySave,
    handler: async (params, { runtime }) => runtime.saveMobileSpeechProviderKey(params)
  }),
  defineMethod({
    name: 'speech.providers.clearKey',
    params: SpeechProviderAction,
    handler: async (params, { runtime }) => runtime.clearMobileSpeechProviderKey(params)
  }),
  defineMethod({
    name: 'speech.providers.testKey',
    params: SpeechProviderAction,
    handler: async (params, { runtime }) => runtime.testMobileSpeechProviderKey(params)
  }),
  defineMethod({
    name: 'speech.providers.configure',
    params: SpeechProviderConfigure,
    handler: async (params, { runtime }) =>
      runtime.configureMobileSpeechProviders(
        params.language !== undefined ? { language: params.language } : {}
      )
  })
]
