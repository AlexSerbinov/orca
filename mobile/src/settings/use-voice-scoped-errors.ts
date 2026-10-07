import { useCallback, useMemo, useState } from 'react'
import type { VoiceRequestScope } from './use-voice-request-fence'

/** Reads (loads and polls) get their own slot so a refresh never clears a write's failure. */
export type VoiceErrorScope = 'read' | VoiceRequestScope

type ScopedError = { scope: VoiceErrorScope; message: string }

/**
 * One error slot per Voice request scope. Setting or clearing a scope leaves the others alone;
 * `error` joins the remaining messages, most recent first.
 */
export function useVoiceScopedErrors() {
  const [errors, setErrors] = useState<readonly ScopedError[]>([])
  const setScopeError = useCallback((scope: VoiceErrorScope, message: string | null) => {
    setErrors((prev) => {
      const rest = prev.filter((entry) => entry.scope !== scope)
      if (message === null) {
        // Why: keep the same array when nothing was cleared so idle polls don't re-render.
        return rest.length === prev.length ? prev : rest
      }
      return [{ scope, message }, ...rest]
    })
  }, [])
  const clearErrors = useCallback(() => {
    setErrors((prev) => (prev.length === 0 ? prev : []))
  }, [])
  const error = useMemo(
    () => (errors.length === 0 ? null : errors.map((entry) => entry.message).join('\n')),
    [errors]
  )
  return { error, setScopeError, clearErrors }
}
