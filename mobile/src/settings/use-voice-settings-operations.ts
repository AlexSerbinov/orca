import { useEffect, useMemo, useState } from 'react'
import { loadHosts } from '../transport/host-store'
import type { HostProfile } from '../transport/types'
import { useFocusedSettingsHostClients } from '../transport/settings-host-client-connections'
import { nativeVoiceSettingsOperations } from './native-voice-settings-operations'
import type { VoiceSettingsOperations } from './voice-settings-operations'
import { pickVoiceSettingsClient, scopedVoiceSettingsHostId } from './voice-settings-host-selection'

/** The Voice routes configure `hostId` when given (a session's desktop), else the first connected one. */
export function useVoiceSettingsOperations(hostId?: string): {
  operations: VoiceSettingsOperations | null
  focused: boolean
} {
  const [hosts, setHosts] = useState<HostProfile[]>([])
  useEffect(() => {
    void loadHosts().then(setHosts)
  }, [])
  const pairedHostIds = useMemo(() => hosts.map((host) => host.id), [hosts])
  const scopedHostId = scopedVoiceSettingsHostId(pairedHostIds, hostId)
  const hostIds = useMemo(
    () => (scopedHostId ? [scopedHostId] : pairedHostIds),
    [pairedHostIds, scopedHostId]
  )
  const { clients, focused } = useFocusedSettingsHostClients(hostIds)
  const client = pickVoiceSettingsClient(clients, scopedHostId)
  const operations = useMemo(
    () => (client ? nativeVoiceSettingsOperations(client) : null),
    [client]
  )
  return { operations, focused }
}
