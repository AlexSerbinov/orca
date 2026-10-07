import { describe, expect, it } from 'vitest'
import { BatchDictationAudioBuffer } from './cloud-speech-audio-encoding'

describe('BatchDictationAudioBuffer', () => {
  it('refuses an unsupported sample rate before resampling', () => {
    const buffer = new BatchDictationAudioBuffer()

    expect(() => buffer.append(new Float32Array(4096), 1e-6)).toThrow(
      'Unsupported audio sample rate'
    )
    expect(buffer.isEmpty()).toBe(true)
  })

  it('checks the duration cap against the incoming chunk before allocating it', () => {
    const buffer = new BatchDictationAudioBuffer()
    buffer.append(new Float32Array(16_000 * 60 * 9), 16_000)

    expect(() => buffer.append(new Float32Array(8_000 * 61), 8_000)).toThrow(
      'limited to 10 minutes'
    )
    buffer.append(new Float32Array(48_000 * 59), 48_000)
    expect(buffer.isEmpty()).toBe(false)
  })
})
