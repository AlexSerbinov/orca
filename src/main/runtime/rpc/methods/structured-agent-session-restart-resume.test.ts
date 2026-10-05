import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'
import { STRUCTURED_AGENT_SESSION_RESTART_RESUME_METHODS } from './structured-agent-session-restart-resume'

const shortcut = vi.hoisted(() => ({ empty: vi.fn(async () => true) }))
vi.mock('./structured-agent-session-restart-offer-read', () => ({
  restartOffersProvablyEmpty: shortcut.empty
}))

const ensureHost = vi.fn(async () => undefined)

function context(clientCapabilities?: string[]): RpcContext {
  // A paired desktop is a remote client; in-process callers carry no client kind at all.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the listing reads only the client's identity and the runtime's host builder; the rest of the context is never touched.
  return {
    runtime: { ensureStructuredAgentSessionHost: ensureHost },
    ...(clientCapabilities ? { clientKind: 'runtime', clientCapabilities } : {})
  } satisfies Partial<RpcContext> as RpcContext
}

const listing = STRUCTURED_AGENT_SESSION_RESTART_RESUME_METHODS.find(
  (method) => method.name === 'agentSession.restartResumable'
)!

beforeEach(() => {
  ensureHost.mockClear()
  shortcut.empty.mockClear()
  shortcut.empty.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('answers an empty capsule without building the chat host', async () => {
  await expect(listing.handler({}, context())).resolves.toEqual({ sessions: [], failed: [] })
  expect(ensureHost).not.toHaveBeenCalled()
})

it('still refuses a client that cannot read structured sessions, before looking at the file', async () => {
  await expect(listing.handler({}, context(['terminal.v1']))).rejects.toThrow(
    'structured_agent_session_unsupported'
  )
  expect(shortcut.empty).not.toHaveBeenCalled()
  expect(ensureHost).not.toHaveBeenCalled()
})

it('builds the host when the capsule may hold an offer', async () => {
  shortcut.empty.mockResolvedValue(false)
  // No host comes up in this test, so the build is followed by the usual refusal.
  await expect(listing.handler({}, context())).rejects.toThrow()
  expect(ensureHost).toHaveBeenCalledTimes(1)
})
