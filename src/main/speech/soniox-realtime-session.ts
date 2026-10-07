import type WebSocket from 'ws'
import { RealtimeCloudSpeechSession } from './realtime-cloud-speech-session'
import { openProviderWebSocket } from './cloud-speech-websocket'
import type { CloudSpeechSessionOptions } from './cloud-speech-session'
import { CLOUD_TRANSCRIPTION_SAMPLE_RATE } from './cloud-speech-session'

export const SONIOX_REALTIME_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

type SonioxToken = { text?: unknown; is_final?: unknown }

/** Soniox streams tokens: final ones are sent once, non-final ones are re-sent each message. */
export class SonioxRealtimeSession extends RealtimeCloudSpeechSession {
  private finalText = ''
  private pendingText = ''

  constructor(
    private readonly apiModel: string,
    options: CloudSpeechSessionOptions
  ) {
    super('Soniox', options)
  }

  protected createSocket(): WebSocket {
    return openProviderWebSocket(SONIOX_REALTIME_URL)
  }

  protected onOpen(apiKey: string): void {
    // Why: Soniox authenticates in the first JSON frame rather than an HTTP header.
    this.sendJson({
      api_key: apiKey,
      model: this.apiModel,
      audio_format: 'pcm_s16le',
      sample_rate: CLOUD_TRANSCRIPTION_SAMPLE_RATE,
      num_channels: 1,
      ...(this.language ? { language_hints: [this.language] } : {})
    })
    this.markAccepting()
  }

  protected handleMessage(message: Record<string, unknown>): void {
    if (message.error_code !== undefined || typeof message.error_message === 'string') {
      const detail = typeof message.error_message === 'string' ? message.error_message : ''
      this.fail(`Soniox error ${String(message.error_code ?? '')}: ${detail}`.trim())
      return
    }
    if (Array.isArray(message.tokens)) {
      this.acceptTokens(message.tokens)
    }
    if (message.finished === true) {
      this.markFinished()
    }
  }

  protected sendAudio(pcm: Buffer): void {
    this.socket?.send(pcm)
  }

  protected sendEnd(): void {
    // Why: an empty text frame ends the audio; Soniox finalizes every token, then sends finished.
    // An empty binary frame is ignored (verified against the live API).
    this.socket?.send('')
  }

  protected runningTranscript(): string {
    return this.finalText + this.pendingText
  }

  protected finalTranscript(): string {
    return this.finalText + this.pendingText
  }

  private acceptTokens(tokens: unknown[]): void {
    let pending = ''
    for (const token of tokens) {
      if (!token || typeof token !== 'object') {
        continue
      }
      const { text, is_final: isFinal }: SonioxToken = token
      if (typeof text !== 'string' || /^<\w+>$/.test(text)) {
        continue
      }
      if (isFinal === true) {
        this.finalText += text
      } else {
        pending += text
      }
    }
    this.pendingText = pending
    this.publishPartial()
  }
}
