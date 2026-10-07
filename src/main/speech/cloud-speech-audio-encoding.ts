import { CLOUD_TRANSCRIPTION_SAMPLE_RATE } from './cloud-speech-session'
import { resampleToRate } from './stt-audio-resample'

const MAX_BATCH_AUDIO_SECONDS = 10 * 60

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
}

/** Raw little-endian PCM16 bytes, the wire format every realtime provider accepts. */
export function encodePcm16(samples: Float32Array): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(floatToInt16(samples[i]), i * 2)
  }
  return buffer
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const pcm = encodePcm16(samples)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function resampleForCloud(samples: Float32Array, sampleRate: number): Float32Array {
  return resampleToRate(samples, sampleRate, CLOUD_TRANSCRIPTION_SAMPLE_RATE)
}

/** Collects one dictation's audio at 16 kHz for providers that transcribe the whole file. */
export class BatchDictationAudioBuffer {
  private chunks: Float32Array[] = []
  private sampleCount = 0

  append(samples: Float32Array, sampleRate: number): void {
    const normalized = resampleForCloud(samples, sampleRate)
    const nextCount = this.sampleCount + normalized.length
    if (nextCount / CLOUD_TRANSCRIPTION_SAMPLE_RATE > MAX_BATCH_AUDIO_SECONDS) {
      throw new Error('Cloud transcription is limited to 10 minutes per dictation')
    }
    // Why: the caller may transfer or reuse its buffer after feeding.
    this.chunks.push(new Float32Array(normalized))
    this.sampleCount = nextCount
  }

  isEmpty(): boolean {
    return this.sampleCount === 0
  }

  /** Returns the buffered audio as a WAV file and empties the buffer. */
  takeWav(): Buffer {
    const combined = new Float32Array(this.sampleCount)
    let offset = 0
    for (const chunk of this.chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []
    this.sampleCount = 0
    return encodePcm16Wav(combined, CLOUD_TRANSCRIPTION_SAMPLE_RATE)
  }

  clear(): void {
    this.chunks = []
    this.sampleCount = 0
  }
}
