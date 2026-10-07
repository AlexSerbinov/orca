import {
  AUTO_TRANSCRIPTION_LANGUAGE,
  SPEECH_TRANSCRIPTION_LANGUAGES
} from '../../../src/shared/speech-transcription-languages'
import type {
  MobileSpeechProvider,
  MobileSpeechProviderModel,
  MobileSpeechProvidersState
} from './speech-provider-reply-schema'

export type SelectedSpeechModel = {
  provider: MobileSpeechProvider
  model: MobileSpeechProviderModel
}

export function isLocalSpeechProvider(provider: MobileSpeechProvider): boolean {
  // Why: an unreadable kind falls back to the id the host always gives the on-device row.
  return provider.kind === undefined ? provider.id === 'local' : provider.kind === 'local'
}

/** The host marks a cloud model ready once its provider holds a key, so one test covers both kinds. */
export function isSpeechModelUsable(model: MobileSpeechProviderModel): boolean {
  return model.status === 'ready'
}

export function isSpeechModelInFlight(model: MobileSpeechProviderModel): boolean {
  return model.status === 'downloading' || model.status === 'extracting'
}

export function hasSpeechModelInFlight(state: MobileSpeechProvidersState): boolean {
  return state.providers.some((provider) => provider.models.some(isSpeechModelInFlight))
}

export function findSelectedSpeechModel(
  state: MobileSpeechProvidersState
): SelectedSpeechModel | null {
  const selectedId = state.selectedModelId
  if (!selectedId) {
    return null
  }
  for (const provider of state.providers) {
    const model = provider.models.find((entry) => entry.id === selectedId)
    if (model) {
      return { provider, model }
    }
  }
  return null
}

export function speechProviderLabel(provider: MobileSpeechProvider): string {
  return provider.label ?? provider.id
}

export function speechModelLabel(model: MobileSpeechProviderModel): string {
  return model.label ?? model.id
}

export function speechProviderStatusText(provider: MobileSpeechProvider): string {
  if (isLocalSpeechProvider(provider)) {
    const ready = provider.models.filter(isSpeechModelUsable).length
    if (ready === 0) {
      return 'No models downloaded'
    }
    return ready === 1 ? '1 model downloaded' : `${ready} models downloaded`
  }
  if (!provider.keyConfigured) {
    return 'Not connected'
  }
  return provider.keyHint ? `Connected · ${provider.keyHint}` : 'Connected'
}

export function formatSpeechModelSize(bytes: number | null | undefined): string {
  if (!bytes) {
    return ''
  }
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${Math.round(bytes / 1_000_000)} MB`
}

export function speechModelProgressText(model: MobileSpeechProviderModel): string | null {
  if (model.status === 'extracting') {
    return 'Extracting…'
  }
  if (model.status === 'downloading') {
    return model.progress == null
      ? 'Downloading…'
      : `Downloading · ${Math.round(model.progress * 100)}%`
  }
  return null
}

export function transcriptionLanguageLabel(code: string | undefined): string {
  const language = SPEECH_TRANSCRIPTION_LANGUAGES.find(
    (entry) => entry.code === (code ?? AUTO_TRANSCRIPTION_LANGUAGE)
  )
  return language?.label ?? code ?? 'Auto-detect'
}
