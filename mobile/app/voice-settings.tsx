import { useLocalSearchParams, useRouter } from 'expo-router'
import VoiceSettingsScreen from '../src/settings/voice-settings-screen'
import { useVoiceSettingsOperations } from '../src/settings/use-voice-settings-operations'

export default function NativeVoiceSettingsRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ hostId?: string }>()
  const hostId = typeof params.hostId === 'string' ? params.hostId : undefined
  const { operations, focused } = useVoiceSettingsOperations(hostId)
  return (
    <VoiceSettingsScreen
      operations={operations}
      focused={focused}
      onBack={() => router.back()}
      onOpenProvider={(providerId) =>
        router.push({
          pathname: '/voice-provider',
          params: hostId ? { providerId, hostId } : { providerId }
        })
      }
    />
  )
}
