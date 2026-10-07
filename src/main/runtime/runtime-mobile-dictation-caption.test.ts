import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SttEventSink } from '../speech/stt-service'
import type { RuntimeStore } from './runtime-store-contract'

const stt = vi.hoisted(() => {
  const state: { sink: SttEventSink | null } = { sink: null }
  return Object.assign(state, {
    startDictation: vi.fn(),
    feedAudio: vi.fn(),
    stopDictation: vi.fn(async () => {})
  })
})

vi.mock('../speech/speech-runtime-service', () => ({
  getSpeechModelManager: () => ({ getModelState: async () => ({ status: 'ready' }) }),
  getSpeechSttService: () => ({
    startDictation: stt.startDictation,
    feedAudio: stt.feedAudio,
    stopDictation: stt.stopDictation
  })
}))

import { RuntimeMobileDictationController } from './runtime-mobile-dictation-controller'

const CLIENT = { clientId: 'phone', connectionId: 'conn' }
const CHUNK = { dictationId: 'd1', audioBase64: 'AAAA', sampleRate: 16_000, ...CLIENT }

function createController(transcriptionLanguage = 'uk') {
  const store = {
    getSettings: () => ({
      voice: { enabled: true, sttModel: 'soniox-stt-rt-v5', transcriptionLanguage }
    })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The controller reads only voice settings.
  return new RuntimeMobileDictationController(() => store as unknown as RuntimeStore)
}

beforeEach(() => {
  stt.sink = null
  stt.startDictation.mockReset()
  stt.startDictation.mockImplementation(async (_model: string, sink: SttEventSink) => {
    stt.sink = sink
  })
  stt.feedAudio.mockReset()
})

describe('mobile dictation live captions', () => {
  it('discards cloud audio when the phone cancels', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })

    await controller.cancel({ dictationId: 'd1', ...CLIENT })

    expect(stt.stopDictation).toHaveBeenLastCalledWith('mobile:d1', { discard: true })
  })

  it('aborts a finishing upload when the phone disconnects', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })
    let releaseStop!: () => void
    stt.stopDictation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStop = resolve
        })
    )
    const finishing = controller.finish({ dictationId: 'd1', ...CLIENT })

    controller.cancelForConnection('conn')

    expect(stt.stopDictation).toHaveBeenLastCalledWith('mobile:d1', { discard: true })
    releaseStop()
    await finishing
  })

  it('passes the language hint to the speech service', async () => {
    const controller = createController('uk')

    await controller.start({ dictationId: 'd1', ...CLIENT })

    expect(stt.startDictation).toHaveBeenCalledWith(
      'soniox-stt-rt-v5',
      expect.any(Function),
      undefined,
      'mobile:d1',
      { language: 'uk' }
    )
  })

  it('omits the language hint for auto-detect', async () => {
    const controller = createController('auto')

    await controller.start({ dictationId: 'd1', ...CLIENT })

    expect(stt.startDictation.mock.calls[0][4]).toEqual({ language: undefined })
  })

  it('omits the caption until there is text, then grows the revision on each change', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })

    expect(controller.feed(CHUNK)).toEqual({ dictationId: 'd1' })

    stt.sink?.({ type: 'partial', text: 'Hello' })
    expect(controller.feed(CHUNK)).toEqual({
      dictationId: 'd1',
      caption: { text: 'Hello', revision: 1 }
    })
    stt.sink?.({ type: 'partial', text: 'Hello' })
    expect(controller.feed(CHUNK).caption?.revision).toBe(1)

    stt.sink?.({ type: 'partial', text: 'Hello world' })
    stt.sink?.({ type: 'final', text: 'Hello world.' })
    stt.sink?.({ type: 'partial', text: 'Next' })
    expect(controller.feed(CHUNK)).toEqual({
      dictationId: 'd1',
      caption: { text: 'Hello world. Next', revision: 4 }
    })
  })

  it('returns the realtime final transcript once on finish', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })
    stt.sink?.({ type: 'partial', text: 'Hello wor' })
    stt.stopDictation.mockImplementationOnce(async () => {
      stt.sink?.({ type: 'final', text: 'Hello world.' })
      stt.sink?.({ type: 'stopped' })
    })

    await expect(controller.finish({ dictationId: 'd1', ...CLIENT })).resolves.toEqual({
      dictationId: 'd1',
      text: 'Hello world.'
    })
  })

  it('marks a mid-dictation stream failure so the phone finishes instead of discarding', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })
    stt.sink?.({ type: 'final', text: 'Kept words.' })
    stt.sink?.({ type: 'error', error: 'Soniox closed the stream (1000).' })

    expect(() => controller.feed(CHUNK)).toThrow(
      'dictation_stream_failed: Soniox closed the stream (1000).'
    )
    await expect(controller.finish({ dictationId: 'd1', ...CLIENT })).resolves.toEqual({
      dictationId: 'd1',
      text: 'Kept words.'
    })
  })

  it('marks a feed failure the speech service reported', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })
    stt.feedAudio.mockImplementationOnce(() => {
      stt.sink?.({ type: 'error', error: 'limited to 30 minutes' })
      throw new Error('limited to 30 minutes')
    })

    expect(() => controller.feed(CHUNK)).toThrow('dictation_stream_failed: limited to 30 minutes')
  })

  it('still fails finish when the stream failed before any text', async () => {
    const controller = createController()
    await controller.start({ dictationId: 'd1', ...CLIENT })
    stt.sink?.({ type: 'error', error: 'Soniox rejected the API key (401).' })

    await expect(controller.finish({ dictationId: 'd1', ...CLIENT })).rejects.toThrow(
      'Soniox rejected the API key (401).'
    )
  })
})
