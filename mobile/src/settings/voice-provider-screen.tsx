import { Fragment } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { colors, spacing } from '../theme/mobile-theme'
import { ConfirmModal } from '../components/ConfirmModal'
import { SpeechProviderLogo } from '../components/SpeechProviderLogo'
import { voiceSettingsStyles as base } from './voice-settings-styles'
import { voiceCabinetStyles as cabinet } from './voice-cabinet-styles'
import { voiceProviderStyles as styles } from './voice-provider-styles'
import type { VoiceSettingsOperations } from './voice-settings-operations'
import { useVoiceProviderController } from './use-voice-provider-controller'
import { VoiceProviderKeySection } from './voice-provider-key-section'
import { SpeechProviderKeyDrawer } from './speech-provider-key-drawer'
import { SpeechModelRow } from './speech-model-row'
import {
  isLocalSpeechProvider,
  speechProviderLabel
} from '../dictation/speech-provider-presentation'

type Props = {
  operations: VoiceSettingsOperations | null
  focused: boolean
  providerId: string
  onBack: () => void
}

export default function VoiceProviderScreen({ operations, focused, providerId, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const controller = useVoiceProviderController(operations, focused)
  const { state, loading, error, busyAction } = controller
  const provider = state?.providers.find((entry) => entry.id === providerId) ?? null
  const local = provider ? isLocalSpeechProvider(provider) : false
  const label = provider ? speechProviderLabel(provider) : 'Provider'

  return (
    <View style={[base.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={base.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={base.backButton}
          onPress={onBack}
        >
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={base.heading}>Voice</Text>
      </View>

      {!state && !operations && focused ? (
        <View style={[base.section, base.sectionTopGap]}>
          <Text style={base.emptyText}>Connect to a desktop to manage speech providers.</Text>
        </View>
      ) : !state && (loading || !operations || !error) ? (
        <View style={base.loading}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : !provider ? (
        <View style={[base.section, base.sectionTopGap]}>
          <Text style={base.errorText}>
            {state ? 'This desktop does not offer that provider.' : error}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={base.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <SpeechProviderLogo providerId={provider.id} size={52} />
            <View style={styles.heroText}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {label}
              </Text>
              {provider.description ? (
                <Text style={styles.heroDescription}>{provider.description}</Text>
              ) : null}
            </View>
          </View>

          {local ? null : (
            <>
              <Text style={base.groupHeading}>API KEY</Text>
              <VoiceProviderKeySection
                provider={provider}
                keyAction={controller.keyAction}
                testResult={controller.testResult}
                onAddKey={controller.openKeyDrawer}
                onTest={() => void controller.testKey(provider.id)}
                onRemove={() => controller.setConfirmRemoveOpen(true)}
              />
            </>
          )}

          <Text style={[base.groupHeading, local ? null : base.inputGroupGap]}>MODELS</Text>
          <View style={[base.section, base.sectionTopGap]}>
            {provider.models.map((model, index) => (
              <Fragment key={model.id}>
                {index > 0 ? <View style={base.separator} /> : null}
                <SpeechModelRow
                  model={model}
                  local={local}
                  selected={model.id === state?.selectedModelId}
                  busy={busyAction?.modelId === model.id ? busyAction.type : null}
                  locked={busyAction !== null}
                  variant="manage"
                  onSelect={() => void controller.selectModel(model.id)}
                  onDownload={() => void controller.downloadModel(model.id)}
                  onAddKey={controller.openKeyDrawer}
                  onDelete={() => void controller.deleteModel(model.id)}
                />
              </Fragment>
            ))}
          </View>
          <Text style={cabinet.footnote}>
            {local
              ? 'On-device models run on your desktop. Audio never leaves it.'
              : `Your desktop sends audio to ${label} only while you dictate with one of these models.`}
          </Text>

          {error ? <Text style={base.error}>{error}</Text> : null}
        </ScrollView>
      )}

      {provider && !local ? (
        <>
          <SpeechProviderKeyDrawer
            visible={controller.keyDrawerOpen}
            provider={provider}
            replacing={provider.keyConfigured === true}
            saving={controller.keyAction === 'saving'}
            error={controller.keyError}
            onClose={() => controller.setKeyDrawerOpen(false)}
            onSave={(apiKey) => void controller.saveKey(provider.id, apiKey)}
            onDraftChange={() => controller.setKeyError(null)}
          />
          <ConfirmModal
            visible={controller.confirmRemoveOpen}
            title={`Remove ${label} key?`}
            message={`${label} models stop working until you add a key again.`}
            confirmLabel="Remove"
            destructive
            onConfirm={() => void controller.removeKey(provider.id)}
            onCancel={() => controller.setConfirmRemoveOpen(false)}
          />
        </>
      ) : null}
    </View>
  )
}
