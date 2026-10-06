import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { resolveComposerAttachmentTarget } from './composer-attachment-target'

const group: ProjectGroup = {
  id: 'folder-project',
  name: 'Project',
  parentPath: '/folder',
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0
}
const selected = {
  selectedProjectGroup: null,
  selectedRepoPath: '/repo',
  selectedRepoExecutionHostId: 'local' as const,
  selectedRepoSettings: { activeRuntimeEnvironmentId: 'focused-runtime' },
  connectionId: null
}
describe('composer attachment destination', () => {
  it('uses the selected local host even when a runtime is focused', () => {
    expect(resolveComposerAttachmentTarget(selected)).toEqual({
      hostId: 'local',
      path: '/repo',
      connectionId: null,
      settings: { activeRuntimeEnvironmentId: null }
    })
  })
  it('uses the selected runtime without borrowing the focused runtime', () => {
    expect(
      resolveComposerAttachmentTarget({
        ...selected,
        selectedRepoExecutionHostId: 'runtime:selected'
      }).settings.activeRuntimeEnvironmentId
    ).toBe('selected')
  })
  it('uses a folder project path and recorded SSH host', () => {
    expect(
      resolveComposerAttachmentTarget({
        ...selected,
        selectedRepoPath: undefined,
        selectedProjectGroup: { ...group, connectionId: 'ssh-a' }
      })
    ).toEqual({
      hostId: 'ssh:ssh-a',
      path: '/folder',
      connectionId: 'ssh-a',
      settings: { activeRuntimeEnvironmentId: null }
    })
  })
  it('uses a folder project runtime owner', () => {
    expect(
      resolveComposerAttachmentTarget({
        ...selected,
        selectedRepoPath: undefined,
        selectedProjectGroup: { ...group, executionHostId: 'runtime:folder-host' }
      })
    ).toEqual({
      hostId: 'runtime:folder-host',
      path: '/folder',
      connectionId: null,
      settings: { activeRuntimeEnvironmentId: 'folder-host' }
    })
  })
  it('keeps a missing selection unresolved', () => {
    expect(
      resolveComposerAttachmentTarget({
        ...selected,
        selectedRepoPath: undefined,
        selectedRepoExecutionHostId: null
      }).hostId
    ).toBeNull()
  })
})
