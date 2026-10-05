import { createContext, useContext } from 'react'

/** What a structured chat tells its rows about an Orca stop: the name of the machine whose Orca runs
 *  it, as Orca shows that host everywhere (null when it has none to show), and the cut turn Continue
 *  is offered on, if any. */
export type NativeChatOrcaStopView = {
  hostLabel: string | null
  continueTurnItemId: string | null
}

export const NativeChatOrcaStopContext = createContext<NativeChatOrcaStopView>({
  hostLabel: null,
  continueTurnItemId: null
})

export function useNativeChatOrcaStopView(): NativeChatOrcaStopView {
  return useContext(NativeChatOrcaStopContext)
}
