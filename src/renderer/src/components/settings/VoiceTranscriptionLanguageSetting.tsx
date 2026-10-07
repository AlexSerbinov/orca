import {
  AUTO_TRANSCRIPTION_LANGUAGE,
  SPEECH_TRANSCRIPTION_LANGUAGES,
  type SpeechTranscriptionLanguage
} from '../../../../shared/speech-transcription-languages'
import type { VoiceSettings } from '../../../../shared/speech-types'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { getIntlLocale, translate } from '@/i18n/i18n'

type VoiceTranscriptionLanguageSettingProps = {
  voiceSettings: VoiceSettings
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}

function createLanguageNamer(): (language: SpeechTranscriptionLanguage) => string {
  let displayNames: Intl.DisplayNames | null = null
  try {
    displayNames = new Intl.DisplayNames([getIntlLocale()], { type: 'language' })
  } catch {
    displayNames = null
  }
  return (language) => {
    if (language.code === AUTO_TRANSCRIPTION_LANGUAGE) {
      return translate('auto.components.settings.VoiceTranscriptionLanguage.auto', 'Auto-detect')
    }
    // Why: Intl names languages in the UI locale, so the shared English labels need no catalog.
    return displayNames?.of(language.code) ?? language.label
  }
}

export function VoiceTranscriptionLanguageSetting({
  voiceSettings,
  onUpdateVoiceSettings
}: VoiceTranscriptionLanguageSettingProps): React.JSX.Element {
  const nameLanguage = createLanguageNamer()
  const known = SPEECH_TRANSCRIPTION_LANGUAGES.some(
    (language) => language.code === voiceSettings.transcriptionLanguage
  )
  const value = known ? voiceSettings.transcriptionLanguage : AUTO_TRANSCRIPTION_LANGUAGE
  const label = translate(
    'auto.components.settings.VoiceTranscriptionLanguage.label',
    'Transcription Language'
  )

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.VoiceTranscriptionLanguage.description',
            'Hint for cloud models. Auto-detect lets the provider choose.'
          )}
        </p>
      </div>
      <Select
        value={value}
        disabled={!voiceSettings.enabled}
        onValueChange={(next) => onUpdateVoiceSettings({ transcriptionLanguage: next })}
      >
        <SelectTrigger size="sm" aria-label={label} className="w-44 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEECH_TRANSCRIPTION_LANGUAGES.map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {nameLanguage(language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
