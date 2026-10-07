import type { BatchTranscribe } from './batch-cloud-speech-session'
import { assertProviderResponseOk } from './cloud-speech-provider-errors'
import { SPEECH_TRANSCRIPTION_LANGUAGES } from '../../shared/speech-transcription-languages'

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com'

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
  candidates?: { content?: { parts?: GeminiPart[] } }[]
}

// Why: Gemini Transcribe models answer in audioTranscription.text; chat models answer in text.
function readPartText(part: GeminiPart): string {
  if (typeof part.text === 'string') {
    return part.text
  }
  const transcription = part.audioTranscription?.text
  return typeof transcription === 'string' ? transcription : ''
}

function readCandidateText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? []
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
    return readCandidateText(data)
  }
}
