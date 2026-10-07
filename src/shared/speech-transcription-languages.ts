export const AUTO_TRANSCRIPTION_LANGUAGE = 'auto'

export type SpeechTranscriptionLanguage = { code: string; label: string }

// Why: a short list of widely supported ISO 639-1 codes keeps the picker scannable; providers that
// cannot honour a hint ignore it, and 'auto' leaves detection to the provider.
export const SPEECH_TRANSCRIPTION_LANGUAGES: readonly SpeechTranscriptionLanguage[] = [
  { code: AUTO_TRANSCRIPTION_LANGUAGE, label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pl', label: 'Polish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'cs', label: 'Czech' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' }
]

/** Returns the language to send to a provider, or undefined to let it auto-detect. */
export function resolveTranscriptionLanguageHint(value: string | undefined): string | undefined {
  if (!value || value === AUTO_TRANSCRIPTION_LANGUAGE) {
    return undefined
  }
  return /^[a-z]{2,3}$/.test(value) ? value : undefined
}
