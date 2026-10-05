// Whether a chat's owner died with a crashed Orca or with an Orca that was quitting: only restart
// adjudication can say the owner died with the runtime before this one, and the word that runtime
// left at the start of its quit says how it ended.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentSessionDeathEvidence } from '../../shared/agent-session-record'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../shared/agent-session-record.test-fixture'
import { openTestJournalHostDatabase } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import {
  openTestAgentSessionRecordStore,
  seedTestAgentSessionRecordStore
} from './agent-session-record-store-test-harness'
import {
  recordAgentSessionRuntimeTeardown,
  takeAgentSessionRuntimeTeardown
} from './agent-session-runtime-teardown-record'

const SESSION = 'session-alpha-1'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-runtime-teardown-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** A lease the runtime before this one still held: its owner is what restart adjudicates. */
async function seedOwnedLease(): Promise<void> {
  await seedTestAgentSessionRecordStore(directory, {
    records: [agentSessionRecordFixture(agentSessionLeaseFixture())]
  })
}

async function seedReleasedLease(deathEvidence: AgentSessionDeathEvidence): Promise<void> {
  await seedTestAgentSessionRecordStore(directory, {
    records: [
      agentSessionRecordFixture(
        agentSessionLeaseFixture({
          ownerProcess: null,
          reservedSpawnToken: null,
          claimStatus: 'released',
          deathEvidence
        })
      )
    ]
  })
}

async function restartEvidence(): Promise<AgentSessionDeathEvidence | null> {
  const store = await openTestAgentSessionRecordStore(directory)
  await store.reconcileOnRestart({ probe: async () => ({ outcome: 'pid-absent' }), now: 90_000 })
  return store.getRecord(SESSION)?.lease.deathEvidence ?? null
}

describe('how the runtime that held a dead owner ended', () => {
  it('is a crash when that runtime never began a quit', async () => {
    await seedOwnedLease()
    expect(await restartEvidence()).toMatchObject({ kind: 'pid-absent', runtimeEnd: 'crash' })
  })

  it.each(['update', 'quit'] as const)(
    'is the %s that runtime began, when its quit did not finish',
    async (trigger) => {
      await seedOwnedLease()
      recordAgentSessionRuntimeTeardown(openTestJournalHostDatabase(directory).db, trigger, 50_000)

      expect(await restartEvidence()).toMatchObject({ kind: 'pid-absent', runtimeEnd: trigger })
    }
  )

  it('describes only the runtime just before: the next load takes it', () => {
    const db = openTestJournalHostDatabase(directory).db
    recordAgentSessionRuntimeTeardown(db, 'update', 50_000)

    expect(takeAgentSessionRuntimeTeardown(db)).toBe('update')
    expect(takeAgentSessionRuntimeTeardown(db)).toBe('crash')
  })

  it('never calls a quit it cannot read a crash', () => {
    const db = openTestJournalHostDatabase(directory).db
    db.prepare('INSERT INTO agent_session_store_meta (key, value) VALUES (?, ?)').run(
      'runtime_teardown',
      JSON.stringify({ trigger: 'logout', startedAt: 1 })
    )
    expect(takeAgentSessionRuntimeTeardown(db)).toBeNull()
  })

  it("leaves a provider's own death, observed while Orca ran, without a runtime end", async () => {
    const observed: AgentSessionDeathEvidence = {
      kind: 'exit-observed',
      detail: 'observed process exit',
      observedAt: 40_000,
      ownerFence: 7
    }
    await seedReleasedLease(observed)
    expect(await restartEvidence()).toEqual(observed)
  })
})
