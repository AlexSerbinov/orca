import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  createRejectedNativeFileDropPayload,
  NATIVE_FILE_DROP_MAX_PATHS,
  validateNativeFileDropPaths,
  type NativeFileDropRejectedPayload
} from '../../../shared/native-file-drop'
import {
  OS_FILE_DROP_OWNER_ATTRIBUTE,
  type DroppedPathConsumer,
  type PreparedDroppedPaths
} from '../../../shared/native-file-drop-preparation'
import { hasOsFileDragTypes } from '../lib/os-file-drop-cancellation-guard'

type OsFileDropOwnerOptions = {
  consumer: DroppedPathConsumer
  canAccept?: boolean
  onDrop: (
    prepared: PreparedDroppedPaths,
    context: { target: EventTarget | null }
  ) => void | Promise<void>
}

const registeredRoots = new WeakMap<HTMLElement, true>()

function isNearestOwner(root: HTMLElement, event: DragEvent): boolean {
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement && registeredRoots.has(entry)) {
      return entry === root
    }
  }
  return false
}

function rejectedDrop(
  reason: NativeFileDropRejectedPayload['reason'],
  pathCount: number,
  byteLength = 0
): PreparedDroppedPaths {
  return { paths: [], failures: [{ target: 'rejected', reason, pathCount, byteLength }] }
}

/** Attach the returned callback ref to the element that owns an OS file drop. */
export function useOsFileDropOwner(
  ownerRef: RefObject<HTMLElement | null>,
  options: OsFileDropOwnerOptions
): (root: HTMLElement | null) => void {
  const optionsRef = useRef(options)
  const detachRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    optionsRef.current = options
  }, [options])

  return useCallback(
    (root: HTMLElement | null) => {
      detachRef.current?.()
      detachRef.current = null
      ownerRef.current = root
      if (!root) {
        return
      }

      let attached = true
      let deliveryTail = Promise.resolve()
      const queueDelivery = (
        prepared: PreparedDroppedPaths | Promise<PreparedDroppedPaths>,
        deliver: OsFileDropOwnerOptions['onDrop'],
        target: EventTarget | null
      ): void => {
        deliveryTail = deliveryTail
          .then(async () => {
            const result = await prepared
            if (attached) {
              await deliver(result, { target })
            }
          })
          .catch((error: unknown) => console.error('OS file drop owner callback failed', error))
      }

      const onDragOver = (event: DragEvent): void => {
        if (!hasOsFileDragTypes(event.dataTransfer?.types) || !isNearestOwner(root, event)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = optionsRef.current.canAccept === false ? 'none' : 'copy'
        }
      }

      const onDrop = (event: DragEvent): void => {
        if (!hasOsFileDragTypes(event.dataTransfer?.types) || !isNearestOwner(root, event)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (!event.isTrusted || optionsRef.current.canAccept === false) {
          return
        }

        const { consumer, onDrop: deliver } = optionsRef.current
        const target = event.target
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (files.length > NATIVE_FILE_DROP_MAX_PATHS) {
          queueDelivery(
            {
              paths: [],
              failures: [
                createRejectedNativeFileDropPayload({
                  status: 'rejected',
                  reason: 'too-many-paths',
                  pathCount: files.length,
                  byteLength: 0
                })
              ]
            },
            deliver,
            target
          )
          return
        }

        const getPathForFile = window.api?.getPathForFile
        if (!getPathForFile) {
          queueDelivery(rejectedDrop('unresolved-paths', files.length), deliver, target)
          return
        }

        const paths: string[] = []
        for (const file of files) {
          try {
            const path = getPathForFile(file)
            if (path) {
              paths.push(path)
            }
          } catch {
            // A virtual file may not have a local path.
          }
        }
        if (paths.length === 0) {
          queueDelivery(rejectedDrop('unresolved-paths', files.length), deliver, target)
          return
        }

        const validation = validateNativeFileDropPaths(paths)
        if (validation.status === 'rejected') {
          queueDelivery(
            { paths: [], failures: [createRejectedNativeFileDropPayload(validation)] },
            deliver,
            target
          )
          return
        }

        const preparation = (async (): Promise<PreparedDroppedPaths> => {
          let prepared: PreparedDroppedPaths
          try {
            prepared = await window.api.fs.prepareDroppedPaths({ paths, consumer })
          } catch {
            prepared = {
              paths: [],
              failures: [
                {
                  target: 'rejected',
                  reason: 'temp-copy-failed',
                  commonReason: 'copy-failed',
                  pathCount: paths.length,
                  byteLength: validation.byteLength
                }
              ]
            }
          }
          return prepared
        })()
        queueDelivery(preparation, deliver, target)
      }

      root.setAttribute(OS_FILE_DROP_OWNER_ATTRIBUTE, '')
      registeredRoots.set(root, true)
      root.addEventListener('dragover', onDragOver, true)
      root.addEventListener('drop', onDrop, true)
      detachRef.current = () => {
        attached = false
        root.removeEventListener('dragover', onDragOver, true)
        root.removeEventListener('drop', onDrop, true)
        registeredRoots.delete(root)
        root.removeAttribute(OS_FILE_DROP_OWNER_ATTRIBUTE)
      }
    },
    [ownerRef]
  )
}
