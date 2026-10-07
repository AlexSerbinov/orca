import { useLayoutEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  createOsFileDropSequence,
  useOsFileDropOwner,
  type OsFileDropSequence
} from '@/hooks/use-os-file-drop-owner'
import { getNativeFileDropRejectionMessage } from '@/hooks/useGlobalFileDrop'
import {
  captureEditorFileDropOpen,
  type EditorFileDropDestination
} from './editor-dropped-file-open'

// The tab strip and editor area are sibling roots of one group and render in different trees.
const groupSequences = new Map<string, { sequence: OsFileDropSequence; owners: number }>()

function sequenceForGroup(key: string): OsFileDropSequence {
  const existing = groupSequences.get(key)
  if (existing) {
    return existing.sequence
  }
  const sequence = createOsFileDropSequence()
  groupSequences.set(key, { sequence, owners: 0 })
  return sequence
}

function useEditorGroupFileDropSequence(key: string): OsFileDropSequence {
  // Resolved during render so roots that mount in the same commit share one sequence.
  const sequence = useMemo(() => sequenceForGroup(key), [key])
  useLayoutEffect(() => {
    const entry = groupSequences.get(key) ?? { sequence, owners: 0 }
    groupSequences.set(key, entry)
    entry.owners += 1
    return () => {
      entry.owners -= 1
      if (entry.owners === 0 && groupSequences.get(key) === entry) {
        groupSequences.delete(key)
      }
    }
  }, [key, sequence])
  return sequence
}

/** Opens OS files dropped on this group's tab strip or editor area in that group's worktree. */
export function useEditorGroupFileDropOwner({
  worktreeId,
  groupId
}: EditorFileDropDestination): (root: HTMLElement | null) => void {
  const rootRef = useRef<HTMLElement | null>(null)
  const sequence = useEditorGroupFileDropSequence(`${worktreeId}\0${groupId ?? ''}`)
  return useOsFileDropOwner(rootRef, {
    consumer: 'main-reader',
    sequence,
    captureDestination: () => captureEditorFileDropOpen({ worktreeId, groupId }),
    onDrop: async (prepared, { destination }) => {
      for (const failure of prepared.failures) {
        const message = getNativeFileDropRejectionMessage(failure)
        toast.error(message.title, { description: message.description })
      }
      await destination?.(prepared.paths)
    }
  })
}
