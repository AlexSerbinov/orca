import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { Mic, Square } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { keepHeldPressThroughLongPress } from './held-press-long-press'

type Props = {
  micActive: boolean
  /** Dictation trigger style — 'hold' uses press-in/out, 'toggle' uses tap. */
  dictationMode: string
  onMicPress: () => void
  onMicPressIn?: () => void
  onMicPressOut?: () => void
  disabled: boolean
  buttonStyle: StyleProp<ViewStyle>
  pressedStyle: StyleProp<ViewStyle>
}

export function MobileNativeChatMicButton({
  micActive,
  dictationMode,
  onMicPress,
  onMicPressIn,
  onMicPressOut,
  disabled,
  buttonStyle,
  pressedStyle
}: Props): React.JSX.Element {
  const hold = dictationMode === 'hold'
  return (
    <Pressable
      accessibilityLabel={micActive ? 'Stop dictation' : 'Dictate'}
      style={({ pressed }) => [buttonStyle, pressed && pressedStyle]}
      // Hold mode is walkie-talkie (press-in/out); toggle mode taps.
      onPress={hold ? undefined : onMicPress}
      onPressIn={hold ? onMicPressIn : undefined}
      onPressOut={hold ? onMicPressOut : undefined}
      onLongPress={hold ? keepHeldPressThroughLongPress : undefined}
      disabled={disabled}
    >
      {/* The icon swaps on press; as the page's touch target, its removal would send
          touchend to a detached node and lose the release. */}
      {micActive ? (
        <Square
          pointerEvents="none"
          size={18}
          color={colors.statusRed}
          strokeWidth={2.4}
          fill={colors.statusRed}
        />
      ) : (
        <Mic pointerEvents="none" size={20} color={colors.textSecondary} strokeWidth={2} />
      )}
    </Pressable>
  )
}
