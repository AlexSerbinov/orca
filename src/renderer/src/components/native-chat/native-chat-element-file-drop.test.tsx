// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import {
  NativeChatPaneFileDropSurface,
  useNativeChatPaneFileDropClaim
} from './NativeChatPaneFileDropSurface'
import { NativeChatPromptEditor } from './NativeChatPromptEditor'

const electron = vi.hoisted(() => ({
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
  getPathForFile: vi.fn((file: File) => `/drop/${file.name}`)
}))
vi.mock('electron', () => ({
  ipcRenderer: electron,
  webUtils: { getPathForFile: electron.getPathForFile }
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
import { installNativeFileDropHandlers } from '../../../../preload/preload-runtime-support'

const prepare = vi.fn(async ({ paths }: { paths: string[] }) => ({ paths, failures: [] }))
function Composer({
  attach,
  disabled = false
}: {
  attach: (paths: string[]) => void
  disabled?: boolean
}) {
  const input = useRef<NativeChatComposerInput>(null)
  useNativeChatPaneFileDropClaim({
    destinationKey: 'draft',
    disabled,
    onDragOverCapture: () => {},
    onDropCapture: () => {},
    captureExternalDrop: () => async (paths) => attach(paths)
  })
  return (
    <NativeChatPromptEditor
      scopeKey="draft"
      inputRef={input}
      initialValue="Original"
      disabled={disabled}
      placeholder="Message"
      onChange={() => {}}
      onSelect={() => {}}
    />
  )
}
function Chat({
  attach,
  hidden = false,
  disabled = false
}: {
  attach: (paths: string[]) => void
  hidden?: boolean
  disabled?: boolean
}) {
  return (
    <div style={{ display: hidden ? 'none' : 'block' }}>
      <NativeChatPaneFileDropSurface className="chat">
        <Composer attach={attach} disabled={disabled} />
      </NativeChatPaneFileDropSurface>
    </div>
  )
}
async function drop(target: Element, types = ['Files']) {
  const event = new Event('drop', { bubbles: true, cancelable: true, composed: true })
  Object.defineProperty(event, 'isTrusted', { value: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types,
      files: [new File(['x'], 'a.png')],
      getData: (type: string) => (type === 'text/html' ? '<b>Injected</b>' : '')
    }
  })
  await act(async () => {
    target.dispatchEvent(event)
  })
  return event
}
beforeAll(() => installNativeFileDropHandlers())
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('api', {
    getPathForFile: electron.getPathForFile,
    fs: { prepareDroppedPaths: prepare }
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('element-owned native chat drops', () => {
  it('attaches to visible chat A while mounted chat B is hidden, without scope markers', async () => {
    const a = vi.fn()
    const b = vi.fn()
    const view = render(
      <>
        <Chat attach={a} />
        <Chat attach={b} hidden />
      </>
    )
    const target = view.container.querySelector('.ProseMirror')!
    await drop(target)
    expect(a).toHaveBeenCalledExactlyOnceWith(['/drop/a.png'])
    expect(b).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-composer-scope-key]')).toBeNull()
    expect(electron.send).not.toHaveBeenCalled()
  })
  it('claims a portaled chat inside a legacy terminal while the terminal outside stays legacy exactly once', async () => {
    const attach = vi.fn()
    const terminal = document.createElement('div')
    terminal.dataset.nativeFileDropTarget = 'terminal'
    terminal.dataset.terminalTabId = 'terminal-a'
    document.body.append(terminal)
    const terminalDrop = vi.fn()
    terminal.addEventListener('drop', terminalDrop)
    try {
      render(createPortal(<Chat attach={attach} />, terminal))
      await drop(terminal.querySelector('.ProseMirror')!)
      expect(attach).toHaveBeenCalledExactlyOnceWith(['/drop/a.png'])
      expect(terminalDrop).not.toHaveBeenCalled()
      expect(electron.send).not.toHaveBeenCalled()
      await drop(terminal)
      expect(electron.send).toHaveBeenCalledExactlyOnceWith('terminal:file-dropped-from-preload', {
        target: 'terminal',
        tabId: 'terminal-a',
        paths: ['/drop/a.png']
      })
      expect(attach).toHaveBeenCalledOnce()
    } finally {
      terminal.remove()
    }
  })
  it.each([false, true])(
    'claims and reports a refused drop when composer disabled is %s',
    async (disabled) => {
      const attach = vi.fn()
      const view = render(
        <div data-native-file-drop-target="terminal">
          <NativeChatPaneFileDropSurface className="chat">
            {disabled ? <Composer attach={attach} disabled /> : <span>Question</span>}
          </NativeChatPaneFileDropSurface>
        </div>
      )
      const event = await drop(view.container.querySelector('.chat')!)
      expect(event.defaultPrevented).toBe(true)
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        'This chat cannot accept attachments right now.'
      )
      expect(attach).not.toHaveBeenCalled()
      expect(prepare).not.toHaveBeenCalled()
      expect(electron.send).not.toHaveBeenCalled()
    }
  )
  it('attaches hybrid Files and HTML without inserting HTML into the real editor', async () => {
    const attach = vi.fn()
    const view = render(<Chat attach={attach} />)
    const editor = view.container.querySelector('.ProseMirror')!
    await drop(editor, ['Files', 'text/html'])
    expect(attach).toHaveBeenCalledExactlyOnceWith(['/drop/a.png'])
    expect(editor.textContent).toBe('Original')
    expect(editor.querySelector('b')).toBeNull()
  })
})
