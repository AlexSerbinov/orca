import { createContext, useContext } from 'react'

/** The name of the machine whose Orca runs the chat on screen, as Orca shows that host
 *  everywhere; null when it has none to show, and outside a structured chat. */
export const NativeChatHostLabelContext = createContext<string | null>(null)

export function useNativeChatHostLabel(): string | null {
  return useContext(NativeChatHostLabelContext)
}
