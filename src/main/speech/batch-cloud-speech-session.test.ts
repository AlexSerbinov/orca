import { describe, expect, it, vi } from 'vitest'
import {
  BatchCloudSpeechSession,
  type BatchTranscriptionRequest
} from './batch-cloud-speech-session'
import {
  CLOUD_SPEECH_REQUEST_TIMEOUT_MS,
  describeProviderFailure
} from './cloud-speech-provider-errors'

const AUDIO = new Float32Array(1600).fill(0.1)

describe('BatchCloudSpeechSession', () => {
  it('aborts the in-flight upload when canceled during finish', async () => {
    const seen: BatchTranscriptionRequest[] = []
    const transcribe = vi.fn(
      (request: BatchTranscriptionRequest) =>
        new Promise<string>((_resolve, reject) => {
          seen.push(request)
          request.signal.addEventListener('abort', () => reject(request.signal.reason))
        })
    )
    const session = new BatchCloudSpeechSession(transcribe, () => 'key', undefined)
    session.feedAudio(AUDIO, 16_000)

    const finished = session.finish()
    session.cancel()

    await expect(finished).rejects.toMatchObject({ name: 'AbortError' })
    expect(seen[0]?.signal.aborted).toBe(true)
  })

  it('passes a request timeout signal that providers report as a timeout', async () => {
    const timeout = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    try {
      const transcribe = vi.fn(
        (request: BatchTranscriptionRequest) =>
          new Promise<string>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(request.signal.reason))
          })
      )
      const session = new BatchCloudSpeechSession(transcribe, () => 'key', undefined)
      session.feedAudio(AUDIO, 16_000)

      const finished = session.finish().catch((error: unknown) => error)
      timeout.abort(new DOMException('The operation timed out.', 'TimeoutError'))
      const error = await finished

      expect(timeoutSpy).toHaveBeenCalledWith(CLOUD_SPEECH_REQUEST_TIMEOUT_MS)
      expect(error).toMatchObject({ name: 'TimeoutError' })
      expect(describeProviderFailure('Groq', error)).toBe('Groq did not respond in time.')
    } finally {
      timeoutSpy.mockRestore()
    }
  })
})
