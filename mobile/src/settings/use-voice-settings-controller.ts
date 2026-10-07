import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceSettingsOperations } from './voice-settings-operations'
import { useDictationSetupPoller } from '../dictation/use-dictation-setup-poller'
import { isModelInFlight, type MobileSpeechSetup } from '../dictation/mobile-dictation-setup'
import { hasSpeechModelInFlight } from '../dictation/speech-provider-presentation'
import type { MobileSpeechProvidersState } from '../dictation/speech-provider-reply-schema'
import type { SpeechModelBusy } from './speech-model-picker-drawer'

const POLL_INTERVAL_MS = 1500

type ConfigureParams = Parameters<VoiceSettingsOperations['configure']>[0]

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/** `speech.dictation.setup` answers with the legacy setup; fold its scalar members into the cabinet. */
function mergeSetupIntoCabinet(
  cabinet: MobileSpeechProvidersState | null,
  setup: MobileSpeechSetup
): MobileSpeechProvidersState | null {
  if (!cabinet) {
    return cabinet
  }
  return {
    ...cabinet,
    enabled: setup.enabled ?? cabinet.enabled,
    dictationMode: setup.dictationMode ?? cabinet.dictationMode,
    selectedModelId: setup.selectedModelId ?? cabinet.selectedModelId
  }
}

/**
 * State for the Voice screen. A desktop that answers `speech.providers.list` gets the provider
 * cabinet (`cabinet`); an older one keeps the legacy model list (`setup`), loaded exactly as before.
 */
export function useVoiceSettingsController(
  operations: VoiceSettingsOperations | null,
  focused: boolean
) {
  const [setup, setSetup] = useState<MobileSpeechSetup | null>(null)
  const [cabinet, setCabinet] = useState<MobileSpeechProvidersState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<SpeechModelBusy | null>(null)
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false)
  const [languageDrawerOpen, setLanguageDrawerOpen] = useState(false)
  const requestEpoch = useRef(0)
  // Why: null = not probed yet; false sticks so polling an old desktop doesn't re-probe each tick.
  const cabinetSupported = useRef<boolean | null>(null)

  // Why: re-probe on a new client (it may be an older desktop) but keep the last state on screen
  // until that read lands, so returning from a provider screen doesn't flash a spinner.
  useEffect(() => {
    cabinetSupported.current = null
  }, [operations])

  const refresh = useCallback(async (): Promise<boolean | undefined> => {
    if (!operations) {
      return false
    }
    const epoch = requestEpoch.current
    // Own the spinner from the read that clears it, so a retry after a failed load shows
    // the spinner again instead of the stale error card. Reads are serialised by
    // DictationSetupPollController, so no in-flight read can clear another's flag.
    setLoading(true)
    try {
      const providerOps = operations.providers
      if (providerOps && cabinetSupported.current !== false) {
        const next = await providerOps.list()
        if (epoch !== requestEpoch.current) {
          return undefined
        }
        if (next) {
          cabinetSupported.current = true
          setCabinet(next)
          setError(null)
          return hasSpeechModelInFlight(next)
        }
        cabinetSupported.current = false
        setCabinet(null)
      }
      const next = await operations.load()
      if (epoch !== requestEpoch.current) {
        return undefined
      }
      setSetup(next)
      setError(null)
      return next.models.some(isModelInFlight)
    } catch (err) {
      setError(errorText(err, 'Failed to load voice settings'))
      return undefined
    } finally {
      setLoading(false)
    }
  }, [operations])

  const polling = cabinet
    ? hasSpeechModelInFlight(cabinet)
    : (setup?.models.some(isModelInFlight) ?? false)
  const refreshSetup = useDictationSetupPoller({
    visible: focused && operations !== null,
    polling,
    refresh,
    intervalMs: POLL_INTERVAL_MS
  })

  const applySetup = useCallback((next: MobileSpeechSetup) => {
    setSetup(next)
    setCabinet((prev) => mergeSetupIntoCabinet(prev, next))
  }, [])

  const configure = useCallback(
    async (params: ConfigureParams) => {
      if (!operations) {
        return
      }
      requestEpoch.current += 1
      setError(null)
      // Optimistic flip so the control responds instantly; reconcile below.
      const { enabled, dictationMode } = params
      const flip = {
        ...(enabled === undefined ? {} : { enabled }),
        ...(dictationMode === undefined ? {} : { dictationMode })
      }
      setSetup((prev) => (prev ? { ...prev, ...flip } : prev))
      setCabinet((prev) => (prev ? { ...prev, ...flip } : prev))
      try {
        applySetup(await operations.configure(params))
      } catch (err) {
        setError(errorText(err, 'Could not update'))
        void refreshSetup()
      }
    },
    [applySetup, operations, refreshSetup]
  )

  const selectModel = useCallback(
    async (modelId: string) => {
      if (!operations) {
        return
      }
      requestEpoch.current += 1
      setBusyAction({ modelId, type: 'select' })
      setError(null)
      try {
        applySetup(await operations.configure({ enabled: true, modelId }))
        setModelDrawerOpen(false)
      } catch (err) {
        setError(errorText(err, 'Could not select model'))
      } finally {
        setBusyAction(null)
      }
    },
    [applySetup, operations]
  )

  const downloadModel = useCallback(
    async (modelId: string) => {
      if (!operations) {
        return
      }
      requestEpoch.current += 1
      setBusyAction({ modelId, type: 'download' })
      setError(null)
      try {
        await operations.download(modelId)
        await refreshSetup()
      } catch (err) {
        setError(errorText(err, 'Download failed'))
      } finally {
        setBusyAction(null)
      }
    },
    [operations, refreshSetup]
  )

  const deleteModel = useCallback(
    async (modelId: string) => {
      if (!operations) {
        return
      }
      const deletedSelectedModel = setup?.selectedModelId === modelId
      requestEpoch.current += 1
      setBusyAction({ modelId, type: 'delete' })
      setError(null)
      try {
        applySetup(await operations.delete(modelId))
        if (deletedSelectedModel) {
          setModelDrawerOpen(false)
        }
      } catch (err) {
        setError(errorText(err, 'Delete failed'))
      } finally {
        setBusyAction(null)
      }
    },
    [applySetup, operations, setup?.selectedModelId]
  )

  const setLanguage = useCallback(
    async (language: string) => {
      const providerOps = operations?.providers
      if (!providerOps) {
        return
      }
      requestEpoch.current += 1
      setLanguageDrawerOpen(false)
      setError(null)
      setCabinet((prev) => (prev ? { ...prev, language } : prev))
      try {
        setCabinet(await providerOps.setLanguage(language))
      } catch (err) {
        setError(errorText(err, 'Could not change the language'))
        void refreshSetup()
      }
    },
    [operations, refreshSetup]
  )

  return {
    setup,
    cabinet,
    loading,
    error,
    busyAction,
    modelDrawerOpen,
    setModelDrawerOpen,
    languageDrawerOpen,
    setLanguageDrawerOpen,
    configure,
    selectModel,
    downloadModel,
    deleteModel,
    setLanguage
  }
}
