import {
  getCloudSpeechProvider,
  isWellFormedCloudSpeechApiKey,
  MALFORMED_CLOUD_SPEECH_API_KEY_MESSAGE,
  type CloudSpeechKeyTestResult,
  type CloudSpeechProviderId
} from '../../shared/cloud-speech-providers'
import { describeProviderFailure, readProviderErrorMessage } from './cloud-speech-provider-errors'

const KEY_VERIFICATION_TIMEOUT_MS = 10_000

type VerificationRequest = { url: string; headers: Record<string, string> }

// Why: each probe is a cheap authenticated GET, so testing a key never bills an inference.
function buildVerificationRequest(
  providerId: CloudSpeechProviderId,
  apiKey: string
): VerificationRequest {
  switch (providerId) {
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: bearer(apiKey) }
    case 'groq':
      return { url: 'https://api.groq.com/openai/v1/models', headers: bearer(apiKey) }
    case 'mistral':
      return { url: 'https://api.mistral.ai/v1/models', headers: bearer(apiKey) }
    case 'soniox':
      return { url: 'https://api.soniox.com/v1/models', headers: bearer(apiKey) }
    case 'deepgram':
      return {
        url: 'https://api.deepgram.com/v1/projects',
        headers: { Authorization: `Token ${apiKey}` }
      }
    case 'elevenlabs':
      // Why: /v1/user needs the user_read scope that restricted STT keys often lack.
      return { url: 'https://api.elevenlabs.io/v1/models', headers: { 'xi-api-key': apiKey } }
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
  const request = buildVerificationRequest(providerId, trimmed)
  let response: Response
  try {
    response = await fetchImpl(request.url, {
      headers: { Accept: 'application/json', ...request.headers },
      signal: AbortSignal.timeout(KEY_VERIFICATION_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = describeProviderFailure(label, error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return { ok: false, message: timedOut ? reason : `Could not reach ${label}: ${reason}` }
  }
  if (response.ok) {
    return { ok: true, message: null }
  }
  // Why: ElevenLabs authenticates the key before checking scopes, so a speech-to-text-only key
  // that lacks only models_read is valid for dictation; any other missing scope is not.
  if (providerId === 'elevenlabs' && (await isOnlyMissingModelsRead(response))) {
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

async function isOnlyMissingModelsRead(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) {
    return false
  }
  // Why: clone so the error detail can still be read from the original body.
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  const detail =
    body &&
    typeof body === 'object' &&
    'detail' in body &&
    body.detail &&
    typeof body.detail === 'object'
      ? body.detail
      : null
  if (!detail || !('status' in detail) || detail.status !== 'missing_permissions') {
    return false
  }
  return (
    'message' in detail &&
    typeof detail.message === 'string' &&
    /\bmodels_read\b/.test(detail.message)
  )
}
