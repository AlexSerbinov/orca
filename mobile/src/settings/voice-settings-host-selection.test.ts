import { describe, expect, it } from 'vitest'
import { pickVoiceSettingsClient, scopedVoiceSettingsHostId } from './voice-settings-host-selection'

const clients = [
  { hostId: 'a', state: 'connected', client: 'client-a' },
  { hostId: 'b', state: 'connecting', client: 'client-b' }
]

describe('voice settings host selection', () => {
  it('falls back to the first connected host when no host is named', () => {
    expect(scopedVoiceSettingsHostId(['a', 'b'], undefined)).toBeUndefined()
    expect(pickVoiceSettingsClient(clients, undefined)).toBe('client-a')
  })

  it('waits for the named host instead of configuring another desktop', () => {
    expect(scopedVoiceSettingsHostId(['a', 'b'], 'b')).toBe('b')
    expect(pickVoiceSettingsClient(clients, 'b')).toBeNull()
    const bConnected = [clients[0], { ...clients[1], state: 'connected' }]
    expect(pickVoiceSettingsClient(bConnected, 'b')).toBe('client-b')
  })

  it('drops a host id that is no longer paired', () => {
    expect(scopedVoiceSettingsHostId(['a'], 'gone')).toBeUndefined()
  })
})
