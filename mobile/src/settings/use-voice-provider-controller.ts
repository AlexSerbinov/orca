import { useCallback, useRef, useState } from 'react'
import type { VoiceSettingsOperations } from './voice-settings-operations'
import { useDictationSetupPoller } from '../dictation/use-dictation-setup-poller'
import { hasSpeechModelInFlight } from '../dictation/speech-provider-presentation'
import { SPEECH_PROVIDERS_UNAVAILABLE_MESSAGE } from '../dictation/mobile-speech-providers'
import type {
  MobileSpeechProviderKeyTest,
  MobileSpeechProvidersState
} from '../dictation/speech-provider-reply-schema'
import type { SpeechModelBusy } from './speech-model-picker-drawer'

const POLL_INTERVAL_MS = 1500

export type ProviderKeyAction = 'saving' | 'testing' | 'removing'

function errorText(err: unknown, fallback: string): string {
  return (err instanceof Error ? err.message : '') || fallback
}

/** State and actions for one provider's screen: key lifecycle plus that provider's models. */
export function useVoiceProviderController(
  operations: VoiceSettingsOperations | null,
  focused: boolean
) {
  const [state, setState] = useState<MobileSpeechProvidersState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<SpeechModelBusy | null>(null)
  const [keyAction, setKeyAction] = useState<ProviderKeyAction | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<MobileSpeechProviderKeyTest | null>(null)
  const [keyDrawerOpen, setKeyDrawerOpen] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const requestEpoch = useRef(0)
  const providerOps = operations?.providers ?? null

  const refresh = useCallback(async (): Promise<boolean | undefined> => {
    if (!providerOps) {
      return false
    }
    const epoch = requestEpoch.current
    setLoading(true)
    try {
      const next = await providerOps.list()
      if (epoch !== requestEpoch.current) {
        return undefined
      }
      if (!next) {
        setError(SPEECH_PROVIDERS_UNAVAILABLE_MESSAGE)
        return false
      }
      setState(next)
      setError(null)
      return hasSpeechModelInFlight(next)
    } catch (err) {
      setError(errorText(err, 'Failed to load speech providers'))
      return undefined
    } finally {
      setLoading(false)
    }
  }, [providerOps])

  const refreshNow = useDictationSetupPoller({
    visible: focused && providerOps !== null,
    polling: state ? hasSpeechModelInFlight(state) : false,
    refresh,
    intervalMs: POLL_INTERVAL_MS
  })

  const saveKey = useCallback(
    async (providerId: string, apiKey: string) => {
      if (!providerOps) {
        return
      }
      requestEpoch.current += 1
      setKeyAction('saving')
      setKeyError(null)
      try {
        setState(await providerOps.saveKey(providerId, apiKey))
        setKeyDrawerOpen(false)
        // Why: the host verified the key before saving, so the connection is known good.
        setTestResult({ ok: true, message: null })
      } catch (err) {
        setKeyError(errorText(err, 'Could not save the API key'))
      } finally {
        setKeyAction(null)
      }
    },
    [providerOps]
  )

  const testKey = useCallback(
    async (providerId: string) => {
      if (!providerOps) {
        return
      }
      setKeyAction('testing')
      setTestResult(null)
      try {
        setTestResult(await providerOps.testKey(providerId))
      } catch (err) {
        setTestResult({ ok: false, message: errorText(err, 'Could not test the API key') })
      } finally {
        setKeyAction(null)
      }
    },
    [providerOps]
  )

  const removeKey = useCallback(
    async (providerId: string) => {
      if (!providerOps) {
        return
      }
      requestEpoch.current += 1
      setKeyAction('removing')
      setError(null)
      setTestResult(null)
      try {
        setState(await providerOps.clearKey(providerId))
      } catch (err) {
        setError(errorText(err, 'Could not remove the API key'))
      } finally {
        setKeyAction(null)
      }
    },
    [providerOps]
  )

  const runModelAction = useCallback(
    async (busy: SpeechModelBusy, action: () => Promise<unknown>, fallback: string) => {
      requestEpoch.current += 1
      setBusyAction(busy)
      setError(null)
      try {
        await action()
        await refreshNow()
      } catch (err) {
        setError(errorText(err, fallback))
      } finally {
        setBusyAction(null)
      }
    },
    [refreshNow]
  )

  const selectModel = useCallback(
    (modelId: string) =>
      operations
        ? runModelAction(
            { modelId, type: 'select' },
            () => operations.configure({ enabled: true, modelId }),
            'Could not select model'
          )
        : undefined,
    [operations, runModelAction]
  )
  const downloadModel = useCallback(
    (modelId: string) =>
      operations
        ? runModelAction(
            { modelId, type: 'download' },
            () => operations.download(modelId),
            'Download failed'
          )
        : undefined,
    [operations, runModelAction]
  )
  const deleteModel = useCallback(
    (modelId: string) =>
      operations
        ? runModelAction(
            { modelId, type: 'delete' },
            () => operations.delete(modelId),
            'Delete failed'
          )
        : undefined,
    [operations, runModelAction]
  )

  const openKeyDrawer = useCallback(() => {
    setKeyError(null)
    setKeyDrawerOpen(true)
  }, [])

  return {
    state,
    loading,
    error,
    busyAction,
    keyAction,
    keyError,
    setKeyError,
    testResult,
    keyDrawerOpen,
    setKeyDrawerOpen,
    openKeyDrawer,
    confirmRemoveOpen,
    setConfirmRemoveOpen,
    saveKey,
    testKey,
    removeKey,
    selectModel,
    downloadModel,
    deleteModel
  }
}
