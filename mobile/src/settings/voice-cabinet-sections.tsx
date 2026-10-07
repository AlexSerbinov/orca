import { Fragment } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Languages, Mic } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { SpeechProviderLogo } from '../components/SpeechProviderLogo'
import { voiceSettingsStyles as base } from './voice-settings-styles'
import { voiceCabinetStyles as styles } from './voice-cabinet-styles'
import { SpeechModelLivePill } from './speech-model-row'
import {
  findSelectedSpeechModel,
  isLocalSpeechProvider,
  speechModelLabel,
  speechProviderLabel,
  speechProviderStatusText,
  transcriptionLanguageLabel
} from '../dictation/speech-provider-presentation'
import type {
  MobileSpeechProvider,
  MobileSpeechProvidersState
} from '../dictation/speech-provider-reply-schema'

type Props = {
  state: MobileSpeechProvidersState
  onOpenModelPicker: () => void
  onOpenLanguagePicker: () => void
  onOpenProvider: (provider: MobileSpeechProvider) => void
}

export function VoiceCabinetSections({
  state,
  onOpenModelPicker,
  onOpenLanguagePicker,
  onOpenProvider
}: Props) {
  const selected = findSelectedSpeechModel(state)
  return (
    <>
      <Text style={[base.groupHeading, base.inputGroupGap]}>MODEL</Text>
      <View style={[base.section, base.sectionTopGap]}>
        <Pressable
          style={({ pressed }) => [base.row, pressed && base.rowPressed]}
          testID="voice-model-picker"
          accessibilityRole="button"
          accessibilityLabel="Speech model"
          onPress={onOpenModelPicker}
        >
          {selected ? (
            <SpeechProviderLogo providerId={selected.provider.id} />
          ) : (
            <View style={styles.iconTile}>
              <Mic size={17} color={colors.textPrimary} strokeWidth={1.9} />
            </View>
          )}
          <View style={base.rowContent}>
            <View style={styles.rowTitleLine}>
              <Text style={[base.rowLabel, styles.rowLabelShrink]} numberOfLines={1}>
                {selected ? speechModelLabel(selected.model) : 'Choose a speech model'}
              </Text>
              {selected?.model.realtime ? <SpeechModelLivePill /> : null}
            </View>
            <Text style={base.rowSublabel} numberOfLines={1}>
              {selected
                ? `${speechProviderLabel(selected.provider)}${
                    selected.model.status === 'ready' ? '' : ' · not ready'
                  }`
                : 'On-device or cloud'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <View style={base.separator} />
        <Pressable
          style={({ pressed }) => [base.row, pressed && base.rowPressed]}
          testID="voice-language-picker"
          accessibilityRole="button"
          accessibilityLabel="Language"
          onPress={onOpenLanguagePicker}
        >
          <View style={styles.iconTile}>
            <Languages size={17} color={colors.textPrimary} strokeWidth={1.9} />
          </View>
          <View style={base.rowContent}>
            <Text style={base.rowLabel}>Language</Text>
            <Text style={base.rowSublabel} numberOfLines={1}>
              {transcriptionLanguageLabel(state.language)}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={[base.groupHeading, base.inputGroupGap]}>PROVIDERS</Text>
      <View style={[base.section, base.sectionTopGap]}>
        {state.providers.map((provider, index) => (
          <Fragment key={provider.id}>
            {index > 0 ? <View style={base.separator} /> : null}
            <SpeechProviderRow
              provider={provider}
              inUse={selected?.provider.id === provider.id}
              onPress={() => onOpenProvider(provider)}
            />
          </Fragment>
        ))}
      </View>
      <Text style={styles.footnote}>
        API keys are encrypted on your desktop and never sent back to this phone. Speech goes from
        your desktop straight to the provider you pick.
      </Text>
    </>
  )
}

function SpeechProviderRow({
  provider,
  inUse,
  onPress
}: {
  provider: MobileSpeechProvider
  inUse: boolean
  onPress: () => void
}) {
  const connected = !isLocalSpeechProvider(provider) && provider.keyConfigured === true
  return (
    <Pressable
      style={({ pressed }) => [base.row, pressed && base.rowPressed]}
      testID={`voice-provider-${provider.id}`}
      accessibilityRole="button"
      accessibilityLabel={speechProviderLabel(provider)}
      onPress={onPress}
    >
      <SpeechProviderLogo providerId={provider.id} />
      <View style={base.rowContent}>
        <Text style={base.rowLabel} numberOfLines={1}>
          {speechProviderLabel(provider)}
        </Text>
        <View style={styles.statusLine}>
          {connected ? <View style={styles.statusDot} /> : null}
          <Text style={connected ? styles.statusText : styles.statusTextMuted} numberOfLines={1}>
            {speechProviderStatusText(provider)}
          </Text>
        </View>
      </View>
      {inUse ? <Text style={styles.inUseText}>In use</Text> : null}
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  )
}
