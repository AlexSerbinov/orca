import type { ResumeCandidate } from './native-chat-resume-on-restart-grouping'

/**
 * The interruptions on each paired server this desktop has already decided about: announced in a
 * toast, resumed without asking, or shown in the dialog. Offers are born only at a server teardown,
 * so a chat and the moment it was cut off name one interruption exactly, and a reconnect, a reload
 * or a reopened window decides nothing twice.
 *
 * Kept per desktop in this window's storage. It is presentation only — the server holds the offers —
 * so losing it costs at most one repeated notice. Every successful read prunes it to what the
 * server still offers, and a removed or re-paired server's entry goes, so it can never grow.
 */

const STORAGE_KEY = 'orca.nativeChatRestartDecided.v1'

type DecidedByEnvironment = Record<string, string[]>

export function restartInterruptionKey(
  candidate: Pick<ResumeCandidate, 'sessionId' | 'recordedAt'>
): string {
  return `${candidate.sessionId}\u0000${candidate.recordedAt}`
}

function read(): DecidedByEnvironment {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([environmentId, keys]) =>
        Array.isArray(keys)
          ? [[environmentId, keys.filter((key): key is string => typeof key === 'string')]]
          : []
      )
    )
  } catch {
    return {}
  }
}

function write(next: DecidedByEnvironment): void {
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  } catch {
    // Storage refused: the next read may announce again, which is all this costs.
  }
}

export function decidedRestartInterruptions(environmentId: string): ReadonlySet<string> {
  return new Set(read()[environmentId] ?? [])
}

/** Marks these decided, and drops every key the server no longer offers. */
export function settleRestartInterruptions(
  environmentId: string,
  offered: readonly string[],
  decided: readonly string[]
): void {
  const stillOffered = new Set(offered)
  const all = read()
  const keys = [...new Set([...(all[environmentId] ?? []), ...decided])].filter((key) =>
    stillOffered.has(key)
  )
  if (keys.length === 0) {
    delete all[environmentId]
  } else {
    all[environmentId] = keys
  }
  write(all)
}

/** Every environment that has an entry, so a removed server's can be forgotten. */
export function restartDecidedEnvironments(): string[] {
  return Object.keys(read())
}

export function forgetRestartInterruptions(environmentId: string): void {
  const all = read()
  if (environmentId in all) {
    delete all[environmentId]
    write(all)
  }
}
