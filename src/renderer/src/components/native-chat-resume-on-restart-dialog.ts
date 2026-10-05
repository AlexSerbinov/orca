import type { RestartMachineKey } from './native-chat-restart-machines'

/** Who asked: the launch read raises it by itself and takes a turn; the user opens it at once. */
export type NativeChatResumeDialogOrigin = 'launch' | 'user'

/** An open request: who asked, and the machine it was opened for (that row starts expanded). */
export type NativeChatResumeOnRestartDialogRequest = Readonly<{
  origin: NativeChatResumeDialogOrigin
  focus: RestartMachineKey | null
}>

let pending: NativeChatResumeOnRestartDialogRequest | null = null
let launchDecided = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

// Why: the launch load, the status-bar entry and a reconnect toast all open this dialog, and any
// can fire before it subscribes. Keeping the request as an external snapshot prevents mount
// ordering from losing it.
export function requestNativeChatResumeOnRestartDialog(
  origin: NativeChatResumeDialogOrigin,
  focus: RestartMachineKey | null = null
): void {
  // A dialog the user opened is already showing; this computer's launch read joining it must not
  // move its focus, which would reset the user's ticks and collapse the machine they opened.
  if (pending?.origin === 'user' && origin === 'launch') {
    return
  }
  // The same request again keeps the opening it already made, and with it the user's ticks.
  if (pending?.origin === origin && pending.focus === focus) {
    return
  }
  pending = { origin, focus }
  notify()
}

export function consumeNativeChatResumeOnRestartDialogRequest(): void {
  if (!pending) {
    return
  }
  pending = null
  notify()
}

/** Drops a request only this computer's launch raised; one the user made stays. */
export function consumeNativeChatResumeOnRestartLaunchRequest(): void {
  if (pending?.origin === 'launch') {
    consumeNativeChatResumeOnRestartDialogRequest()
  }
}

export function getNativeChatResumeOnRestartDialogRequest(): NativeChatResumeOnRestartDialogRequest | null {
  return pending
}

/** This launch's read of THIS computer has asked, resumed by itself, or found nothing; other launch
 *  prompts need not wait for it any longer. A paired server's read never holds them. */
export function markNativeChatResumeLaunchDecided(): void {
  if (launchDecided) {
    return
  }
  launchDecided = true
  notify()
}

export function getNativeChatResumeLaunchDecided(): boolean {
  return launchDecided
}

export function subscribeNativeChatResumeOnRestartDialog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** @internal - tests need a clean module between cases. */
export function _resetNativeChatResumeOnRestartDialog(): void {
  pending = null
  launchDecided = false
}
