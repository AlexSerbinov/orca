import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, Download } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { isModelInFlight, type MobileSpeechSetup } from '../dictation/mobile-dictation-setup'
import { isSpeechModelDownloadable } from '../dictation/speech-provider-presentation'
import { VOICE_BADGE_MAX_FONT_SCALE } from '../settings/voice-cabinet-styles'

// Why: the compact Use/Download buttons are ~26pt tall; stretch the touch target to 44pt.
const ACTION_HIT_SLOP = { top: 9, bottom: 9 } as const

type Props = {
  model: MobileSpeechSetup['models'][number]
  selected: boolean
  busy: boolean
  onUse: () => void
  onDownload: () => void
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) {
    return ''
  }
  return `${Math.round(bytes / 1_000_000)} MB`
}

/** One model row of the setup sheet on desktops without the provider cabinet. */
export function MobileDictationLegacyModelRow({
  model,
  selected,
  busy,
  onUse,
  onDownload
}: Props): React.JSX.Element {
  const inFlight = isModelInFlight(model)
  return (
    <View style={styles.modelRow}>
      <View style={styles.modelInfo}>
        <View style={styles.modelTitleRow}>
          <Text style={styles.modelLabel} numberOfLines={1}>
            {model.label}
          </Text>
          {model.recommended ? (
            <Text style={styles.recommended} maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}>
              Recommended
            </Text>
          ) : null}
        </View>
        <Text style={styles.modelMeta}>
          {model.provider === 'openai' ? 'OpenAI API' : formatSize(model.sizeBytes)}
          {inFlight && model.progress != null
            ? ` · ${Math.round(model.progress * 100)}%`
            : model.status === 'extracting'
              ? ' · extracting…'
              : ''}
        </Text>
      </View>
      {/* Why: capped like the badges, so at the largest text sizes the label keeps its room. */}
      {model.provider === 'openai' ? (
        <Text style={styles.modelStateText} maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}>
          {model.status === 'ready' ? 'API key set' : 'Set up on desktop'}
        </Text>
      ) : model.status === 'ready' ? (
        selected ? (
          <View style={styles.selectedTag}>
            <Check size={14} color={colors.statusGreen} strokeWidth={2.4} />
            <Text style={styles.selectedText} maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}>
              In use
            </Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
            hitSlop={ACTION_HIT_SLOP}
            disabled={busy}
            onPress={onUse}
            accessibilityRole="button"
            accessibilityLabel={`Use ${model.label}`}
          >
            <Text style={styles.actionText} maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}>
              Use
            </Text>
          </Pressable>
        )
      ) : inFlight ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : !isSpeechModelDownloadable(model) ? null : (
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          hitSlop={ACTION_HIT_SLOP}
          disabled={busy}
          onPress={onDownload}
          accessibilityRole="button"
          accessibilityLabel={`Download ${model.label}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <>
              <Download size={13} color={colors.textSecondary} strokeWidth={2.2} />
              <Text style={styles.actionText} maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}>
                Download
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  modelInfo: { flex: 1, minWidth: 0 },
  // Why: minWidth 0 lets a long legacy label shrink instead of pushing Use/Download off the row.
  modelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  modelLabel: { flexShrink: 1, color: colors.textPrimary, fontSize: typography.bodySize },
  recommended: {
    color: colors.statusGreen,
    fontSize: 10,
    fontWeight: '700'
  },
  modelMeta: { color: colors.textMuted, fontSize: typography.metaSize, marginTop: 2 },
  modelStateText: { color: colors.textMuted, fontSize: typography.metaSize },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  actionPressed: { opacity: 0.7 },
  actionText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  selectedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectedText: { color: colors.statusGreen, fontSize: typography.metaSize, fontWeight: '600' }
})
