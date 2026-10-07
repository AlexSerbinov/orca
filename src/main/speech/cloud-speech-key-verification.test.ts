import { describe, expect, it, vi } from 'vitest'
import { verifyCloudSpeechApiKey } from './cloud-speech-key-verification'

function respond(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('verifyCloudSpeechApiKey', () => {
  it.each([
    ['soniox', 'https://api.soniox.com/v1/models', 'Authorization', 'Bearer key-1'],
    ['deepgram', 'https://api.deepgram.com/v1/projects', 'Authorization', 'Token key-1'],
    ['elevenlabs', 'https://api.elevenlabs.io/v1/models', 'xi-api-key', 'key-1'],
    ['groq', 'https://api.groq.com/openai/v1/models', 'Authorization', 'Bearer key-1'],
    ['mistral', 'https://api.mistral.ai/v1/models', 'Authorization', 'Bearer key-1'],
    ['openai', 'https://api.openai.com/v1/models', 'Authorization', 'Bearer key-1']
  ] as const)('probes %s with a cheap authenticated GET', async (provider, url, header, value) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respond(200))

    await expect(verifyCloudSpeechApiKey(provider, ' key-1 ', fetchMock)).resolves.toEqual({
      ok: true,
      message: null
    })
    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(url)
    expect(new Headers(init?.headers).get(header)).toBe(value)
  })

  it('uses the Gemini header instead of a query-string key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(respond(200))

    await verifyCloudSpeechApiKey('gemini', 'AIzaKey', fetchMock)

    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).not.toContain('AIzaKey')
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('AIzaKey')
  })

  it('reports a rejected key with the provider reason and no key material', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respond(401, { message: 'Incorrect API key provided: sk-secret12345' }))

    const result = await verifyCloudSpeechApiKey('soniox', 'sk-secret12345', fetchMock)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Soniox rejected this API key (401).')
    expect(result.message).not.toContain('sk-secret12345')
  })

  it('treats an ElevenLabs 400 invalid-key answer as a rejection', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respond(400, { detail: { message: 'API key is invalid.' } }))

    const result = await verifyCloudSpeechApiKey('elevenlabs', 'bad', fetchMock)

    expect(result).toEqual({
      ok: false,
      message: 'ElevenLabs rejected this API key (400). API key is invalid.'
    })
  })

  it('accepts an ElevenLabs key that is valid but lacks the models_read scope', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      respond(401, {
        detail: {
          status: 'missing_permissions',
          message:
            'The API key you used is missing the permission models_read to execute this operation.'
        }
      })
    )

    await expect(verifyCloudSpeechApiKey('elevenlabs', 'sk_scoped', fetchMock)).resolves.toEqual({
      ok: true,
      message: null
    })
  })

  it('reports network failures without throwing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    const result = await verifyCloudSpeechApiKey('groq', 'gsk_x', fetchMock)

    expect(result).toEqual({ ok: false, message: 'Could not reach Groq: getaddrinfo ENOTFOUND' })
  })

  it('rejects a key with a line break before any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>()

    const result = await verifyCloudSpeechApiKey('soniox', 'abc123\n456def', fetchMock)

    expect(result).toEqual({
      ok: false,
      message: 'API key contains spaces, line breaks, or other invalid characters.'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
