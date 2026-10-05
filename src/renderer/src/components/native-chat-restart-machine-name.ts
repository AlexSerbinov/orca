import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { getHostContextLabel } from '../../../shared/worktree/host-context-labels'
import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import { restartMachineTarget, type RestartMachineKey } from './native-chat-restart-machines'

/** What the user calls a machine: the sidebar's own host label here, the paired server's name. */
export function restartMachineNameFromState(
  state: Pick<AppState, 'runtimeEnvironments'>,
  machine: RestartMachineKey
): string {
  const target = restartMachineTarget(machine)
  if (target.kind === 'local') {
    return getHostContextLabel(LOCAL_EXECUTION_HOST_ID)
  }
  return (
    state.runtimeEnvironments.find((environment) => environment.id === target.environmentId)
      ?.name ?? target.environmentId
  )
}

export function restartMachineName(machine: RestartMachineKey): string {
  return restartMachineNameFromState(useAppStore.getState(), machine)
}

export function useRestartMachineName(machine: RestartMachineKey): string {
  return useAppStore((state) => restartMachineNameFromState(state, machine))
}
