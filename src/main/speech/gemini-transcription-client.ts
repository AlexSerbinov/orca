import type { BatchTranscribe } from './batch-cloud-speech-session'
import type { BatchAudioLimit } from './cloud-speech-audio-encoding'
import { assertProviderResponseOk } from './cloud-speech-provider-errors'
import { SPEECH_TRANSCRIPTION_LANGUAGES } from '../../shared/speech-transcription-languages'

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com'

// Why: inline audio must stay under the 20 MB request cap; 7 min of 16 kHz WAV is ~18 MB as base64.
export const GEMINI_BATCH_AUDIO_LIMIT: BatchAudioLimit = {
  maxSeconds: 7 * 60,
  message: 'Gemini dictation is limited to 7 minutes per recording.'
}

const TRANSCRIBE_PROMPT =
  'Transcribe this audio verbatim. Reply with only the transcribed text, without commentary, ' +
  'labels or quotes. If there is no speech, reply with an empty string.'

function buildPrompt(language: string | undefined): string {
  const label = SPEECH_TRANSCRIPTION_LANGUAGES.find((entry) => entry.code === language)?.label
  return label
    ? `${TRANSCRIBE_PROMPT} The speaker is most likely speaking ${label}.`
    : TRANSCRIBE_PROMPT
}

type GeminiPart = { text?: unknown; audioTranscription?: { text?: unknown } }

type GeminiResponse = {
  promptFeedback?: { blockReason?: unknown }
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: unknown }[]
}

// Why: Gemini Transcribe models answer in audioTranscription.text; chat models answer in text.
function readPartText(part: GeminiPart): string {
  if (typeof part.text === 'string') {
    return part.text
  }
  const transcription = part.audioTranscription?.text
  return typeof transcription === 'string' ? transcription : ''
}

function describeReason(reason: unknown): string {
  return typeof reason === 'string' && reason ? ` (${reason})` : ''
}

// Why: a blocked or truncated answer must not read as silence ("No speech detected").
export function readGeminiTranscript(data: GeminiResponse): string {
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request${describeReason(data.promptFeedback.blockReason)}.`)
  }
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    // Why: a normal stop with nothing to say is how Gemini answers silence.
    if (candidate?.finishReason === 'STOP') {
      return ''
    }
    throw new Error(`Gemini returned no transcript${describeReason(candidate?.finishReason)}.`)
  }
  const text = parts.map(readPartText).join('').trim()
  // Why: the prompt asks for an empty string on silence and the model sometimes quotes it literally.
  return text === '""' ? '' : text
}

/** Gemini has no transcription endpoint; the WAV goes inline into generateContent. */
export function createGeminiTranscribe(apiModel: string): BatchTranscribe {
  return async ({ wav, apiKey, language, signal }) => {
    const body = {
      contents: [
        {
          parts: [
            { text: buildPrompt(language) },
            { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }
          ]
        }
      ],
      generationConfig: { temperature: 0 }
    }
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/v1beta/models/${encodeURIComponent(apiModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      }
    )
    await assertProviderResponseOk('Gemini', response)
    const data: GeminiResponse = await response.json().catch(() => ({}))
    return readGeminiTranscript(data)
  }
}
