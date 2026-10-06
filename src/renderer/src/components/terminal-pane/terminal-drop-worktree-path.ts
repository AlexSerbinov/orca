import { useAppStore } from '@/store'
import { findKnownWorktreeById } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { isTerminalDropWindowsPathLike } from './terminal-drop-shell'

export function resolveTerminalDropWorktreePath(
  worktreeId: string,
  fallbackCwd: string | undefined,
  executionHostId: ExecutionHostId | null | undefined
): string | null {
  if (!executionHostId) {
    return null
  }
  const worktree = findKnownWorktreeById(useAppStore.getState(), worktreeId, executionHostId)
  return worktree?.path ?? (executionHostId === 'local' ? fallbackCwd : null) ?? null
}

export function joinRuntimeTerminalDropDir(worktreePath: string): string {
  if (isTerminalDropWindowsPathLike(worktreePath)) {
    return `${worktreePath.replace(/[\\/]+$/, '').replace(/\//g, '\\')}\\.orca\\drops`
  }
  return `${worktreePath.replace(/[\\/]+$/, '')}/.orca/drops`
}
