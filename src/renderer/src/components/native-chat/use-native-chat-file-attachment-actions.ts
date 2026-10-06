import { useCallback } from 'react'

export function useNativeChatFileAttachmentActions(
  attachExternalPaths: (paths: string[]) => void
): { pickAttachment: () => void } {
  const pickAttachment = useCallback(() => {
    void (async () => {
      const filePath = await window.api.shell.pickAttachment()
      if (filePath) {
        attachExternalPaths([filePath])
      }
    })()
  }, [attachExternalPaths])

  return { pickAttachment }
}
