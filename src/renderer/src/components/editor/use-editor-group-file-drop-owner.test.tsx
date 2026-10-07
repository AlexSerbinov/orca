// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreparedDroppedPaths } from '../../../../shared/native-file-drop-preparation'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { useEditorGroupFileDropOwner } from './use-editor-group-file-drop-owner'

const mocks = vi.hoisted(() => ({
  openFile: vi.fn(),
  setActiveTabType: vi.fn(),
  stat: vi.fn(),
  prepare: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
vi.mock('@/lib/ssh-mutation-expectation', () => ({
  // Like the real lookup, a workspace with no host record fails closed.
  captureWorktreeSshMutationExpectation: (_state: unknown, worktreeId: string) => {
    if (!worktreeId.startsWith('wt-')) {
      throw new Error('unresolved host')
    }
    return { expectedExecutionHostId: 'local' }
  }
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => null
}))
vi.mock('@/lib/user-opened-local-path', () => ({ statUserOpenedPath: mocks.stat }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {},
      activeWorktreeId: 'wt-active',
      getKnownWorktreeById: (id: string) => ({ id, path: `/repos/${id}` }),
      setActiveTabType: mocks.setActiveTabType,
      openFile: mocks.openFile
    })
  }
}))

function EditorGroup({ worktreeId, groupId }: { worktreeId: string; groupId: string }) {
  const attachStrip = useEditorGroupFileDropOwner({ worktreeId, groupId })
  const attachArea = useEditorGroupFileDropOwner({ worktreeId, groupId })
  return (
    <>
      <div ref={attachStrip} data-testid={`${groupId}:strip`} />
      <div ref={attachArea} data-testid={`${groupId}:area`} />
    </>
  )
}

function dropFile(target: Element, name: string): void {
  const transfer = { types: ['Files'], files: [new File(['x'], name)], dropEffect: 'move' }
  const event = new Event('drop', { bubbles: true, cancelable: true, composed: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  Object.defineProperty(event, 'isTrusted', { value: true })
  act(() => {
    target.dispatchEvent(event)
  })
}

const openedPaths = (): string[] => mocks.openFile.mock.calls.map(([file]) => file.filePath)

beforeEach(() => {
  mocks.stat.mockResolvedValue({ isDirectory: false, escapesWorktree: false })
  mocks.prepare.mockImplementation(async ({ paths }: { paths: string[] }) => ({
    paths,
    failures: []
  }))
  vi.stubGlobal('api', {
    fs: {
      getPathForFile: (file: File) => `/repos/wt-b/${file.name}`,
      prepareDroppedPaths: mocks.prepare
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('editor group OS file drops', () => {
  it.each(['strip', 'area'])(
    'opens a file dropped on the %s in that group and worktree, not the active one',
    async (root) => {
      const view = render(<EditorGroup worktreeId="wt-b" groupId="group-b" />)
      dropFile(view.getByTestId(`group-b:${root}`), 'notes.md')
      await waitFor(() => expect(mocks.openFile).toHaveBeenCalledTimes(1))
      expect(mocks.prepare).toHaveBeenCalledWith({
        paths: ['/repos/wt-b/notes.md'],
        consumer: 'main-reader'
      })
      expect(mocks.openFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/repos/wt-b/notes.md',
          relativePath: 'notes.md',
          worktreeId: 'wt-b'
        }),
        { targetGroupId: 'group-b' }
      )
      expect(mocks.setActiveTabType).toHaveBeenCalledWith('editor', 'wt-b')
    }
  )

  it('opens a file dropped on the floating panel as a local floating tab', async () => {
    const view = render(
      <EditorGroup worktreeId={FLOATING_TERMINAL_WORKTREE_ID} groupId="floating-group" />
    )
    dropFile(view.getByTestId('floating-group:strip'), 'scratch.md')
    await waitFor(() => expect(mocks.openFile).toHaveBeenCalledTimes(1))
    expect(mocks.openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/repos/wt-b/scratch.md',
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        runtimeEnvironmentId: null
      }),
      { suppressActiveRuntimeFallback: true, targetGroupId: 'floating-group' }
    )
  })

  it('applies a strip drop then an area drop in drop order when the first prepares slower', async () => {
    const pending: (() => void)[] = []
    mocks.prepare.mockImplementation(
      ({ paths }: { paths: string[] }) =>
        new Promise<PreparedDroppedPaths>((resolve) =>
          pending.push(() => resolve({ paths, failures: [] }))
        )
    )
    const view = render(<EditorGroup worktreeId="wt-b" groupId="group-b" />)
    dropFile(view.getByTestId('group-b:strip'), 'first.ts')
    dropFile(view.getByTestId('group-b:area'), 'second.ts')
    expect(pending).toHaveLength(2)
    await act(async () => pending[1]())
    expect(mocks.openFile).not.toHaveBeenCalled()
    await act(async () => pending[0]())
    await waitFor(() => expect(mocks.openFile).toHaveBeenCalledTimes(2))
    expect(openedPaths()).toEqual(['/repos/wt-b/first.ts', '/repos/wt-b/second.ts'])
  })
})
