// The word a quitting runtime leaves: written before anything the quit waits on, and never able to
// hold the quit, however slow or broken the disk.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as NodeFsPromises from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({ hangWrites: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>()
  return {
    ...actual,
    writeFile: (...args: Parameters<typeof actual.writeFile>) =>
      fsMocks.hangWrites ? new Promise<void>(() => {}) : actual.writeFile(...args)
  }
})

import {
  readAgentSessionRuntimeEnds,
  recordAgentSessionRuntimeEnd
} from './agent-session-runtime-end-record'
import { tearDownRuntime, type InstalledRuntime } from './structured-agent-session-runtime-teardown'
import { agentSessionRuntimeIncarnation } from './agent-session-runtime-attribution'

let directory: string

beforeEach(async () => {
  fsMocks.hangWrites = false
  directory = await mkdtemp(join(tmpdir(), 'orca-runtime-end-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('the word a quitting runtime leaves', () => {
  it('is kept per runtime, newest last', async () => {
    await recordAgentSessionRuntimeEnd(directory, 'runtime-a', 'quit', 1)
    await recordAgentSessionRuntimeEnd(directory, 'runtime-b', 'update', 2)
    expect(readAgentSessionRuntimeEnds(directory)).toEqual(
      new Map([
        ['runtime-a', 'quit'],
        ['runtime-b', 'update']
      ])
    )
  })

  it('is empty before any runtime quit here', () => {
    expect(readAgentSessionRuntimeEnds(directory)).toEqual(new Map())
  })

  it('never fails the quit when it cannot be written', async () => {
    await expect(
      recordAgentSessionRuntimeEnd(join(directory, 'missing'), 'runtime-a', 'quit', 1)
    ).resolves.toBeUndefined()
  })

  it('never holds the quit on a disk that does not answer', async () => {
    fsMocks.hangWrites = true
    await expect(
      recordAgentSessionRuntimeEnd(directory, 'runtime-a', 'quit', 1, 20)
    ).resolves.toBeUndefined()
  })

  it('is written before the quit waits on anything, so a quit that never finishes is still a quit', async () => {
    const installed = {
      host: { flushAllStreamedEvents: vi.fn() },
      adapter: { closeAll: vi.fn() },
      journalDatabase: { stateDirectory: directory, close: vi.fn() },
      // A recovery that never drains: the quit's deadline ends the process here.
      waitForRecovery: () => new Promise<void>(() => {})
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: teardown reads only the members stubbed above before it parks on the recovery wait.
    void tearDownRuntime(installed as unknown as InstalledRuntime, 'update')

    await vi.waitFor(() =>
      expect(readAgentSessionRuntimeEnds(directory)?.get(agentSessionRuntimeIncarnation())).toBe(
        'update'
      )
    )
    expect(installed.host.flushAllStreamedEvents).not.toHaveBeenCalled()
  })
})
