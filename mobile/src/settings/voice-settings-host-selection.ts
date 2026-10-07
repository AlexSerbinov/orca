/** The session's host when it is still paired; otherwise undefined (first connected host wins). */
export function scopedVoiceSettingsHostId(
  pairedHostIds: readonly string[],
  hostId: string | undefined
): string | undefined {
  return hostId && pairedHostIds.includes(hostId) ? hostId : undefined
}

/** Why: a named host must win even while it is still connecting, or keys land on another desktop. */
export function pickVoiceSettingsClient<T>(
  clients: readonly { hostId: string; state: string; client: T }[],
  hostId: string | undefined
): T | null {
  const candidates = hostId ? clients.filter((entry) => entry.hostId === hostId) : clients
  return candidates.find((entry) => entry.state === 'connected')?.client ?? null
}
