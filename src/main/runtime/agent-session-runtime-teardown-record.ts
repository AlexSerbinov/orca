// The durable word that a runtime began quitting, so the next start can tell an Orca that crashed
// from one whose quit did not finish. Written first thing in teardown and taken at the next load:
// any lease still owned then was granted by the runtime that ran just before, after its own load
// had taken the previous word, so a word found at load is always that runtime's.

import {
  isAgentSessionOrcaStopCause,
  type AgentSessionOrcaStopCause
} from '../../shared/agent-session-failure'
import type { AgentSessionResumeTrigger } from '../../shared/agent-session-resume-marker'
import type Database from '../sqlite/sync-database'

const RUNTIME_TEARDOWN_KEY = 'runtime_teardown'

export function recordAgentSessionRuntimeTeardown(
  db: Database.Database,
  trigger: AgentSessionResumeTrigger,
  now: number
): void {
  db.prepare('INSERT OR REPLACE INTO agent_session_store_meta (key, value) VALUES (?, ?)').run(
    RUNTIME_TEARDOWN_KEY,
    JSON.stringify({ trigger, startedAt: now })
  )
}

/**
 * How the previous runtime ended, and forgets it: its quit's trigger, or 'crash' when it began none.
 * Null when that cannot be told — the read failed, or the word names a trigger this build does not
 * know — so nothing is ever called a crash on a failed read.
 */
export function takeAgentSessionRuntimeTeardown(
  db: Database.Database
): AgentSessionOrcaStopCause | null {
  try {
    const row = db
      .prepare('SELECT value FROM agent_session_store_meta WHERE key = ?')
      .get(RUNTIME_TEARDOWN_KEY)
    if (!row) {
      return 'crash'
    }
    db.prepare('DELETE FROM agent_session_store_meta WHERE key = ?').run(RUNTIME_TEARDOWN_KEY)
    const value: unknown = typeof row.value === 'string' ? JSON.parse(row.value) : null
    const trigger =
      typeof value === 'object' && value !== null && 'trigger' in value ? value.trigger : null
    return trigger !== 'crash' && isAgentSessionOrcaStopCause(trigger) ? trigger : null
  } catch {
    return null
  }
}
