import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Check, ChevronRight, Download } from 'lucide-react-native'
import { BottomDrawer } from './BottomDrawer'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import { triggerError, triggerSuccess } from '../platform/haptics'
import { useDictationSetupPoller } from '../dictation/use-dictation-setup-poller'
import {
  downloadDictationModel,
  fetchDictationSetup,
  isModelInFlight,
  setDictationConfig,
  type MobileSpeechSetup
} from '../dictation/mobile-dictation-setup'
import { fetchSpeechProviders } from '../dictation/mobile-speech-providers'
import {
  hasSpeechModelInFlight,
  isSpeechModelDownloadable
} from '../dictation/speech-provider-presentation'
import type { MobileSpeechProvidersState } from '../dictation/speech-provider-reply-schema'
import { SpeechModelGroupedList } from '../settings/speech-model-grouped-list'
import { useVoiceRequestFence } from '../settings/use-voice-request-fence'
import { VOICE_BADGE_MAX_FONT_SCALE } from '../settings/voice-cabinet-styles'

const POLL_INTERVAL_MS = 1500
// Why: the compact Use/Download buttons are ~26pt tall; stretch the touch target to 44pt.
const ACTION_HIT_SLOP = { top: 9, bottom: 9 } as const

type Props = {
  visible: boolean
  client: RpcClient | null
  // Why: provider/settings routes must configure this session's desktop, not the first connected one.
  hostId?: string
  onClose: () => void
  // Called after the user reaches a ready+enabled state, so the caller can retry.
  onReady?: () => void
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) {
    return ''
  }
  return `${Math.round(bytes / 1_000_000)} MB`
}

// Lets the user enable dictation and download a speech model on the paired
// desktop, from the phone. Polls while a download is in flight.
export function MobileDictationSetupSheet({ visible, client, hostId, onClose, onReady }: Props) {
  const router = useRouter()
  const [setup, setSetup] = useState<MobileSpeechSetup | null>(null)
  // Why: desktops with the provider cabinet list every cloud model; older ones keep the legacy rows.
  const [cabinet, setCabinet] = useState<MobileSpeechProvidersState | null>(null)
  // Why: keyed by client so a re-pair probes the new desktop instead of trusting the old answer.
  const cabinetSupport = useRef(new WeakMap<object, boolean>())
  const [cabinetClient, setCabinetClient] = useState(client)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Why: replies still in flight from the previous desktop must not repaint this one.
  const fence = useVoiceRequestFence(client)
  if (client !== cabinetClient) {
    setCabinetClient(client)
    setCabinet(null)
    setSetup(null)
    setBusy(null)
    setError(null)
  }
  const refresh = useCallback(async (): Promise<boolean | undefined> => {
    if (!client) {
      return false
    }
    const ticket = fence.peek()
    try {
      if (cabinetSupport.current.get(client) !== false) {
        const providers = await fetchSpeechProviders(client)
        cabinetSupport.current.set(client, providers !== null)
        if (!fence.isLatest(ticket)) {
          return undefined
        }
        if (providers) {
          setCabinet(providers)
          setError(null)
          return hasSpeechModelInFlight(providers)
        }
      }
      const next = await fetchDictationSetup(client)
      if (!fence.isLatest(ticket)) {
        return undefined
      }
      setSetup(next)
      setError(null)
      return next.models.some(isModelInFlight)
    } catch (err) {
      if (fence.isLatest(ticket)) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      }
      return undefined
    }
  }, [client, fence])

  const polling = cabinet
    ? hasSpeechModelInFlight(cabinet)
    : (setup?.models.some(isModelInFlight) ?? false)
  const refreshSetup = useDictationSetupPoller({
    visible: visible && client !== null,
    polling,
    refresh,
    intervalMs: POLL_INTERVAL_MS
  })

  useEffect(() => {
    if (visible) {
      setError(null)
    }
  }, [visible])

  const handleDownload = useCallback(
    async (model: { id: string }) => {
      if (!client) {
        return
      }
      const ticket = fence.begin()
      setBusy(model.id)
      setError(null)
      try {
        await downloadDictationModel(client, model.id)
        await refreshSetup()
      } catch (err) {
        if (fence.isLatest(ticket)) {
          triggerError()
          setError(err instanceof Error ? err.message : 'Download failed')
        }
      } finally {
        if (fence.isSameHost(ticket)) {
          setBusy((prev) => (prev === model.id ? null : prev))
        }
      }
    },
    [client, fence, refreshSetup]
  )

  const handleUseModel = useCallback(
    async (model: { id: string }) => {
      if (!client) {
        return
      }
      const ticket = fence.begin()
      setBusy(model.id)
      setError(null)
      try {
        const next = await setDictationConfig(client, { enabled: true, modelId: model.id })
        if (!fence.isLatest(ticket)) {
          return
        }
        setSetup(next)
        setCabinet((prev) => (prev ? { ...prev, enabled: true, selectedModelId: model.id } : prev))
        triggerSuccess()
        onReady?.()
      } catch (err) {
        if (fence.isLatest(ticket)) {
          triggerError()
          setError(err instanceof Error ? err.message : 'Could not select model')
        }
      } finally {
        if (fence.isSameHost(ticket)) {
          setBusy((prev) => (prev === model.id ? null : prev))
        }
      }
    },
    [client, fence, onReady]
  )

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!client) {
        return
      }
      const ticket = fence.begin()
      setError(null)
      try {
        const next = await setDictationConfig(client, { enabled })
        if (!fence.isLatest(ticket)) {
          return
        }
        setSetup(next)
        setCabinet((prev) => (prev ? { ...prev, enabled } : prev))
      } catch (err) {
        if (fence.isLatest(ticket)) {
          setError(err instanceof Error ? err.message : 'Could not update')
        }
      }
    },
    [client, fence]
  )

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      {/* Why: BottomDrawer already scrolls its children in a keyboard-aware container;
          a nested capped ScrollView cut off the lower controls. */}
      <View>
        <Text style={styles.heading}>Set up voice dictation</Text>
        <Text style={styles.subtitle}>
          {cabinet
            ? 'Pick an on-device model or connect a cloud provider — all from here.'
            : 'Download a model and enable dictation on your desktop — all from here.'}
        </Text>

        {cabinet ? (
          <>
            <View style={styles.enableRow}>
              <Text style={styles.enableLabel}>Dictation enabled</Text>
              <Switch
                accessibilityLabel="Dictation enabled"
                value={cabinet.enabled === true}
                onValueChange={(v) => void handleToggleEnabled(v)}
              />
            </View>
            <SpeechModelGroupedList
              state={cabinet}
              busy={busy ? { modelId: busy, type: 'select' } : null}
              onSelect={(model) => void handleUseModel(model)}
              onDownload={(model) => void handleDownload(model)}
              onOpenProvider={(provider) => {
                onClose()
                router.push({
                  pathname: '/voice-provider',
                  params: hostId ? { providerId: provider.id, hostId } : { providerId: provider.id }
                })
              }}
            />
            <Pressable
              style={({ pressed }) => [styles.manageLink, pressed && styles.actionPressed]}
              accessibilityRole="button"
              onPress={() => {
                onClose()
                router.push({ pathname: '/voice-settings', params: hostId ? { hostId } : {} })
              }}
            >
              <Text style={styles.manageLinkText}>Manage providers and API keys</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </>
        ) : setup === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : (
          <>
            <View style={styles.enableRow}>
              <Text style={styles.enableLabel}>Dictation enabled</Text>
              <Switch
                accessibilityLabel="Dictation enabled"
                value={setup.enabled}
                onValueChange={(v) => void handleToggleEnabled(v)}
              />
            </View>

            {setup.models.map((model) => {
              const isSelected = model.id === setup.selectedModelId
              const inFlight = isModelInFlight(model)
              const rowBusy = busy === model.id
              return (
                <View key={model.id} style={styles.modelRow}>
                  <View style={styles.modelInfo}>
                    <View style={styles.modelTitleRow}>
                      <Text style={styles.modelLabel} numberOfLines={1}>
                        {model.label}
                      </Text>
                      {model.recommended ? (
                        <Text
                          style={styles.recommended}
                          maxFontSizeMultiplier={VOICE_BADGE_MAX_FONT_SCALE}
                        >
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
                  {model.provider === 'openai' ? (
                    <Text style={styles.modelStateText}>
                      {model.status === 'ready' ? 'API key set' : 'Set up on desktop'}
                    </Text>
                  ) : model.status === 'ready' ? (
                    isSelected ? (
                      <View style={styles.selectedTag}>
                        <Check size={14} color={colors.statusGreen} strokeWidth={2.4} />
                        <Text style={styles.selectedText}>In use</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionButton,
                          pressed && styles.actionPressed
                        ]}
                        hitSlop={ACTION_HIT_SLOP}
                        disabled={rowBusy}
                        onPress={() => void handleUseModel(model)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${model.label}`}
                      >
                        <Text style={styles.actionText}>Use</Text>
                      </Pressable>
                    )
                  ) : inFlight ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : !isSpeechModelDownloadable(model) ? null : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionPressed
                      ]}
                      hitSlop={ACTION_HIT_SLOP}
                      disabled={rowBusy}
                      onPress={() => void handleDownload(model)}
                      accessibilityRole="button"
                      accessibilityLabel={`Download ${model.label}`}
                    >
                      {rowBusy ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : (
                        <>
                          <Download size={13} color={colors.textSecondary} strokeWidth={2.2} />
                          <Text style={styles.actionText}>Download</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              )
            })}
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  heading: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  enableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.sm
  },
  enableLabel: { color: colors.textPrimary, fontSize: typography.bodySize },
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
  selectedText: { color: colors.statusGreen, fontSize: typography.metaSize, fontWeight: '600' },
  error: { color: colors.statusRed, fontSize: typography.metaSize, marginTop: spacing.md },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    minHeight: 44,
    paddingVertical: spacing.sm
  },
  manageLinkText: { color: colors.textSecondary, fontSize: typography.bodySize, fontWeight: '500' }
})
