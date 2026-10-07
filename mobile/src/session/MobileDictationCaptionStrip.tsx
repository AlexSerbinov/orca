import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export type MobileDictationCaptionState = {
  readonly isRecording: boolean
  readonly isProcessing: boolean
  readonly caption: string
}

type Props = {
  dictation: MobileDictationCaptionState
  /** 'dock' sits flush between the terminal accessory bar and input bar; 'card' floats above the chat composer. */
  variant: 'dock' | 'card'
}

/** Shows what the desktop is hearing while the mic is open. Never writes into a TextInput: iOS
 *  drops the IME when JS rewrites a focused field, so the caption stays display-only. */
export function MobileDictationCaptionStrip({ dictation, variant }: Props) {
  if (!dictation.isRecording && !dictation.isProcessing) {
    return null
  }
  const caption = dictation.isRecording ? dictation.caption : ''
  return (
    <View
      style={[styles.strip, variant === 'dock' ? styles.dock : styles.card]}
      testID="dictation-caption-strip"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      {dictation.isRecording ? (
        <RecordingDot />
      ) : (
        <ActivityIndicator size="small" color={colors.textMuted} style={styles.spinner} />
      )}
      {caption ? (
        <Text style={styles.caption} numberOfLines={2} ellipsizeMode="head">
          {caption}
        </Text>
      ) : (
        <Text style={styles.status} numberOfLines={1}>
          {dictation.isRecording ? 'Listening…' : 'Transcribing…'}
        </Text>
      )}
    </View>
  )
}

function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])
  return <Animated.View style={[styles.dot, { opacity }]} />
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  dock: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  card: {
    marginBottom: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusRed
  },
  spinner: { width: 8, transform: [{ scale: 0.7 }] },
  caption: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    lineHeight: 19
  },
  status: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.metaSize
  }
})
