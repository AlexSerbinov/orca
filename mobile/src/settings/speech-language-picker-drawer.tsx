import { Fragment } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors } from '../theme/mobile-theme'
import { voiceSettingsStyles } from './voice-settings-styles'
import { voiceCabinetStyles as styles } from './voice-cabinet-styles'
import {
  AUTO_TRANSCRIPTION_LANGUAGE,
  SPEECH_TRANSCRIPTION_LANGUAGES
} from '../../../src/shared/speech-transcription-languages'

type Props = {
  visible: boolean
  language: string | undefined
  onClose: () => void
  onSelect: (code: string) => void
}

export function SpeechLanguagePickerDrawer({ visible, language, onClose, onSelect }: Props) {
  const current = language ?? AUTO_TRANSCRIPTION_LANGUAGE
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <Text style={voiceSettingsStyles.drawerTitle}>Language</Text>
      <Text style={styles.drawerSubtitle}>
        A hint for cloud models. Auto-detect works for most speech.
      </Text>
      <View style={voiceSettingsStyles.section}>
        {SPEECH_TRANSCRIPTION_LANGUAGES.map((entry, index) => {
          const active = entry.code === current
          return (
            <Fragment key={entry.code}>
              {index > 0 ? <View style={voiceSettingsStyles.separator} /> : null}
              <Pressable
                style={({ pressed }) => [
                  styles.languageRow,
                  pressed && voiceSettingsStyles.rowPressed
                ]}
                accessibilityRole="radio"
                aria-checked={active}
                testID={`speech-language-${entry.code}`}
                onPress={() => onSelect(entry.code)}
              >
                <Text style={styles.languageLabel}>{entry.label}</Text>
                {entry.code === AUTO_TRANSCRIPTION_LANGUAGE ? null : (
                  <Text style={styles.languageCode}>{entry.code}</Text>
                )}
                {active ? (
                  <Check size={18} color={colors.statusGreen} strokeWidth={2.4} />
                ) : (
                  <View style={styles.checkPlaceholder} />
                )}
              </Pressable>
            </Fragment>
          )
        })}
      </View>
    </BottomDrawer>
  )
}
