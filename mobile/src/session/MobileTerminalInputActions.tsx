import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { ImagePlus, Mic } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import type { UseMobileDictationResult } from '../hooks/use-mobile-dictation'
import { keepHeldPressThroughLongPress } from './held-press-long-press'
import { nativeChatDictationPhase } from './native-chat-dictation-toggle'

type DictationState = Pick<
  UseMobileDictationResult,
  'status' | 'failedStreamFinish' | 'isStarting' | 'isRecording' | 'isProcessing'
>

function dictationButtonLabel(dictation: DictationState): string {
  switch (nativeChatDictationPhase(dictation)) {
    case 'recording':
      return 'Stop voice dictation'
    case 'processing':
      return 'Cancel voice dictation'
    case 'salvaging':
      return 'Finishing voice dictation'
    case 'starting':
      return 'Starting voice dictation'
    default:
      return 'Start voice dictation'
  }
}

type MobileTerminalInputActionsProps = {
  readonly canSend: boolean
  readonly isAttaching: boolean
  readonly dictation: DictationState
  readonly dictationMode: string | undefined
  readonly buttonStyle: StyleProp<ViewStyle>
  readonly activeButtonStyle: StyleProp<ViewStyle>
  readonly disabledButtonStyle: StyleProp<ViewStyle>
  readonly onAttachImage: () => void
  readonly onAttachFile: () => void
  readonly onDictationToggle: () => void
  readonly onDictationPressIn: () => void
  readonly onDictationPressOut: () => void
  readonly onDictationCancel: () => void
}

// Image + mic peer actions shared by the live and buffered input bars so both
// surfaces offer identical multimodal entry points (and the JSX lives once).
export function MobileTerminalInputActions({
  canSend,
  isAttaching,
  dictation,
  dictationMode,
  buttonStyle,
  activeButtonStyle,
  disabledButtonStyle,
  onAttachImage,
  onAttachFile,
  onDictationToggle,
  onDictationPressIn,
  onDictationPressOut,
  onDictationCancel
}: MobileTerminalInputActionsProps) {
  const dictationActive = dictation.isStarting || dictation.isRecording
  // Why: a failed stream finishing within its grace keeps its text, so no press may cancel it.
  const salvaging = nativeChatDictationPhase(dictation) === 'salvaging'
  const micDisabled = !canSend || salvaging
  return (
    <>
      <Pressable
        style={[buttonStyle, (!canSend || isAttaching) && disabledButtonStyle]}
        disabled={!canSend || isAttaching}
        // Tap opens the photo library; long-press picks a file. Uploads via host
        // RPC so SSH/remote sessions attach the same as local ones.
        onPress={onAttachImage}
        onLongPress={onAttachFile}
        delayLongPress={350}
        accessibilityLabel={isAttaching ? 'Sending image' : 'Attach a photo'}
        accessibilityHint="Long press to attach a file instead"
      >
        {isAttaching ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <ImagePlus size={17} color={colors.textSecondary} strokeWidth={2.4} />
        )}
      </Pressable>
      <Pressable
        style={[buttonStyle, dictationActive && activeButtonStyle, !canSend && disabledButtonStyle]}
        disabled={micDisabled}
        onPress={dictationMode === 'toggle' ? onDictationToggle : undefined}
        onPressIn={dictationMode === 'hold' ? onDictationPressIn : undefined}
        onPressOut={dictationMode === 'hold' ? onDictationPressOut : undefined}
        onLongPress={
          dictationMode === 'toggle'
            ? () => {
                if (dictation.isRecording || dictation.isProcessing) {
                  onDictationCancel()
                }
              }
            : keepHeldPressThroughLongPress
        }
        accessibilityLabel={dictationButtonLabel(dictation)}
        accessibilityState={{ disabled: micDisabled, busy: dictation.isProcessing }}
      >
        {dictation.isProcessing ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Mic
            size={17}
            color={dictationActive ? colors.textPrimary : colors.textSecondary}
            strokeWidth={2.4}
          />
        )}
      </Pressable>
    </>
  )
}
