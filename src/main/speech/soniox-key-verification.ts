import type WebSocket from 'ws'
import type { CloudSpeechKeyTestResult } from '../../shared/cloud-speech-providers'
import { CLOUD_TRANSCRIPTION_SAMPLE_RATE } from './cloud-speech-session'
import { SONIOX_REALTIME_API_MODEL } from './cloud-speech-model-catalog'
import { describeProviderFailure, redactCloudSpeechSecrets } from './cloud-speech-provider-errors'
import { openProviderWebSocket } from './cloud-speech-websocket'
import { buildSonioxStreamConfig, SONIOX_REALTIME_URL } from './soniox-realtime-session'

const LABEL = 'Soniox'
// 100 ms of 16-bit mono silence: enough for Soniox to run the session and send `finished`.
const PROBE_SILENCE_BYTES = (CLOUD_TRANSCRIPTION_SAMPLE_RATE / 10) * 2
const REJECTED_ERROR_TYPES = new Set(['unauthenticated', 'permission_denied'])

type SonioxErrorFrame = { code: number | null; type: string | null; message: string }

function readProbeFrame(raw: string): SonioxErrorFrame | 'finished' | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const frame: Record<string, unknown> = Object.fromEntries(Object.entries(parsed))
  const { error_code: code, error_type: type, error_message: message } = frame
  if (code !== undefined || typeof message === 'string') {
    return {
      code: typeof code === 'number' ? code : null,
      type: typeof type === 'string' ? type : null,
      message: typeof message === 'string' ? message : ''
    }
  }
  return frame.finished === true ? 'finished' : null
}

function describeErrorFrame(frame: SonioxErrorFrame): string {
  const status = frame.code === null ? '' : ` (${frame.code})`
  const rejected =
    frame.code === 401 ||
    frame.code === 403 ||
    (frame.type !== null && REJECTED_ERROR_TYPES.has(frame.type))
  if (!rejected) {
    return `${LABEL} returned an error${status}. ${frame.message}`
  }
  // Why: 403 often means billing or permissions on a valid key, so it is worded apart from 401.
  const deniedAccess = frame.code === 403 || frame.type === 'permission_denied'
  return `${LABEL} ${deniedAccess ? 'denied access for' : 'rejected'} this API key${status}. ${frame.message}`
}

/**
 * Verifies a Soniox key on the real-time STT endpoint dictation uses: Soniox scopes
 * permissions per API, so a model-listing probe can pass for a key dictation cannot use.
 */
export function verifySonioxApiKey(
  apiKey: string,
  timeoutMs: number
): Promise<CloudSpeechKeyTestResult> {
  return new Promise((resolve) => {
    let socket: WebSocket | null = null
    let settled = false
    const timer = setTimeout(() => fail(`${LABEL} did not respond in time.`), timeoutMs)
    timer.unref?.()

    function settle(result: CloudSpeechKeyTestResult): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      closeQuietly(socket)
      resolve(result)
    }

    function fail(message: string): void {
      // Why: providers can echo a key of any shape, which the pattern redaction would miss.
      const withoutKey = apiKey ? message.split(apiKey).join('[redacted]') : message
      settle({ ok: false, message: redactCloudSpeechSecrets(withoutKey) })
    }

    try {
      socket = openProviderWebSocket(SONIOX_REALTIME_URL, { Authorization: `Bearer ${apiKey}` })
    } catch (error) {
      fail(`Could not reach ${LABEL}: ${describeProviderFailure(LABEL, error)}`)
      return
    }
    const probe = socket
    probe.on('open', () => {
      probe.send(JSON.stringify(buildSonioxStreamConfig(SONIOX_REALTIME_API_MODEL)))
      probe.send(Buffer.alloc(PROBE_SILENCE_BYTES))
      // Why: an empty text frame ends the audio, so Soniox answers `finished` within a second.
      probe.send('')
    })
    probe.on('message', (data, isBinary) => {
      const frame = isBinary ? null : readProbeFrame(data.toString())
      if (frame === 'finished') {
        settle({ ok: true, message: null })
      } else if (frame) {
        fail(describeErrorFrame(frame))
      }
    })
    probe.on('unexpected-response', (request, response) => {
      request.destroy()
      fail(describeErrorFrame({ code: response.statusCode ?? 0, type: null, message: '' }))
    })
    probe.on('error', (error) =>
      fail(`Could not reach ${LABEL}: ${describeProviderFailure(LABEL, error)}`)
    )
    probe.on('close', (code) =>
      fail(`${LABEL} closed the connection before confirming the key (${code}).`)
    )
  })
}

function closeQuietly(socket: WebSocket | null): void {
  if (!socket) {
    return
  }
  socket.removeAllListeners()
  // Why: a late socket error after removeAllListeners would otherwise crash the main process.
  socket.on('error', () => {})
  if (socket.readyState === socket.OPEN) {
    socket.close(1000)
  } else {
    socket.terminate()
  }
}
