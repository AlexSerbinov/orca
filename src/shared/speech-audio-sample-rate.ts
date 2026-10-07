// Why: resampling allocates proportionally to inputRate/outputRate, so absurd rates must be refused up front.
export const MIN_DICTATION_INPUT_SAMPLE_RATE = 8_000
export const MAX_DICTATION_INPUT_SAMPLE_RATE = 192_000

export function isSupportedDictationSampleRate(sampleRate: unknown): sampleRate is number {
  return (
    typeof sampleRate === 'number' &&
    Number.isFinite(sampleRate) &&
    sampleRate >= MIN_DICTATION_INPUT_SAMPLE_RATE &&
    sampleRate <= MAX_DICTATION_INPUT_SAMPLE_RATE
  )
}

export function assertSupportedDictationSampleRate(
  sampleRate: unknown
): asserts sampleRate is number {
  if (!isSupportedDictationSampleRate(sampleRate)) {
    throw new Error('Unsupported audio sample rate')
  }
}
