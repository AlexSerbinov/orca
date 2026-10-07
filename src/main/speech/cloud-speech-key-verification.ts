import {
  getCloudSpeechProvider,
  isWellFormedCloudSpeechApiKey,
  MALFORMED_CLOUD_SPEECH_API_KEY_MESSAGE,
  type CloudSpeechKeyTestResult,
  type CloudSpeechProviderId
} from '../../shared/cloud-speech-providers'
import { describeProviderFailure, readProviderErrorMessage } from './cloud-speech-provider-errors'
import { verifySonioxApiKey } from './soniox-key-verification'

const KEY_VERIFICATION_TIMEOUT_MS = 10_000

type VerificationRequest = { url: string; headers: Record<string, string>; method?: 'POST' }
type HttpProbedProviderId = Exclude<CloudSpeechProviderId, 'soniox'>

// Why: each probe is a cheap authenticated call, so testing a key never bills an inference.
function buildVerificationRequest(
  providerId: HttpProbedProviderId,
  apiKey: string
): VerificationRequest {
  switch (providerId) {
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: bearer(apiKey) }
    case 'groq':
      return { url: 'https://api.groq.com/openai/v1/models', headers: bearer(apiKey) }
    case 'mistral':
      return { url: 'https://api.mistral.ai/v1/models', headers: bearer(apiKey) }
    case 'deepgram':
      return {
        url: 'https://api.deepgram.com/v1/projects',
        headers: { Authorization: `Token ${apiKey}` }
      }
    case 'elevenlabs':
      // Why: minting a realtime token needs exactly the speech_to_text scope dictation uses.
      return {
        url: 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
        headers: { 'xi-api-key': apiKey },
        method: 'POST'
      }
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
        headers: { 'x-goog-api-key': apiKey }
      }
  }
}

function bearer(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

function isRejectedKeyStatus(providerId: CloudSpeechProviderId, status: number): boolean {
  // Gemini and ElevenLabs answer 400 for a malformed or unknown key.
  return (
    status === 401 ||
    status === 403 ||
    (status === 400 && (providerId === 'gemini' || providerId === 'elevenlabs'))
  )
}

export async function verifyCloudSpeechApiKey(
  providerId: CloudSpeechProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<CloudSpeechKeyTestResult> {
  const label = getCloudSpeechProvider(providerId).label
  const trimmed = apiKey.trim()
  if (!trimmed) {
    return { ok: false, message: 'No API key saved.' }
  }
  if (!isWellFormedCloudSpeechApiKey(trimmed)) {
    return { ok: false, message: MALFORMED_CLOUD_SPEECH_API_KEY_MESSAGE }
  }
  if (providerId === 'soniox') {
    return verifySonioxApiKey(trimmed, KEY_VERIFICATION_TIMEOUT_MS)
  }
  const request = buildVerificationRequest(providerId, trimmed)
  let response: Response
  try {
    response = await fetchImpl(request.url, {
      method: request.method ?? 'GET',
      headers: { Accept: 'application/json', ...request.headers },
      signal: AbortSignal.timeout(KEY_VERIFICATION_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = describeProviderFailure(label, error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return { ok: false, message: timedOut ? reason : `Could not reach ${label}: ${reason}` }
  }
  if (response.ok) {
    // Why: the ElevenLabs probe answers with a live token; never read or keep it.
    await response.body?.cancel().catch(() => {})
    return { ok: true, message: null }
  }
  const detail = await readProviderErrorMessage(response)
  if (isRejectedKeyStatus(providerId, response.status)) {
    // Why: 403 often means billing or permissions on a valid key, so it is worded apart from 401.
    const verdict = response.status === 403 ? 'denied access for' : 'rejected'
    return {
      ok: false,
      message: `${label} ${verdict} this API key (${response.status}). ${detail}`.trim()
    }
  }
  return {
    ok: false,
    message: `${label} returned an error (${response.status}). ${detail}`.trim()
  }
}
