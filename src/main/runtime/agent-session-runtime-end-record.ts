// The durable word each Orca runtime leaves as it begins quitting: which runtime, and why (a quit
// or an update). A later start reads it to tell an owner that died with a quit that did not finish
// from one that died in a crash. Keyed by runtime, never deleted, and capped, so no later run can
// read an earlier run's word as its own.
//
// Written apart from the chat database on purpose: that database is synchronous SQLite, and a
// stalled disk there would park the quit's event loop. This write is asynchronous and bounded, and
// its failure only costs that distinction.

import { readFileSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AGENT_SESSION_RESUME_TRIGGERS,
  type AgentSessionResumeTrigger
} from '../../shared/agent-session-resume-marker'
import { withTimeout } from '../../shared/promise-timeout-fallback'

const RUNTIME_ENDS_FILE = 'agent-session-runtime-ends.json'
/** Enough runtimes that an owner a few restarts old still finds its runtime's word. */
const MAX_RUNTIME_ENDS = 16
export const RUNTIME_END_RECORD_TIMEOUT_MS = 1_000

type RuntimeEnd = { runtime: string; trigger: AgentSessionResumeTrigger; at: number }

function readTrigger(value: unknown): AgentSessionResumeTrigger | undefined {
  return AGENT_SESSION_RESUME_TRIGGERS.find((trigger) => trigger === value)
}

function runtimeEndsOf(raw: string): RuntimeEnd[] {
  const parsed: unknown = JSON.parse(raw)
  const ends =
    typeof parsed === 'object' && parsed !== null && 'ends' in parsed ? parsed.ends : null
  if (!Array.isArray(ends)) {
    throw new Error('agent session runtime ends are unreadable')
  }
  return ends.flatMap((end: unknown) => {
    if (typeof end !== 'object' || end === null) {
      return []
    }
    const runtime = 'runtime' in end ? end.runtime : undefined
    const trigger = readTrigger('trigger' in end ? end.trigger : undefined)
    const at = 'at' in end ? end.at : undefined
    return typeof runtime === 'string' && trigger && typeof at === 'number'
      ? [{ runtime, trigger, at }]
      : []
  })
}

/**
 * Each recorded runtime's quit trigger. Empty when no runtime ever began a quit here; null when the
 * word cannot be read, so nothing is ever called a crash on a failed read.
 */
export function readAgentSessionRuntimeEnds(
  stateDirectory: string
): ReadonlyMap<string, AgentSessionResumeTrigger> | null {
  try {
    const ends = runtimeEndsOf(readFileSync(join(stateDirectory, RUNTIME_ENDS_FILE), 'utf8'))
    return new Map(ends.map((end) => [end.runtime, end.trigger]))
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT' ? new Map() : null
  }
}

async function appendRuntimeEnd(stateDirectory: string, end: RuntimeEnd): Promise<void> {
  const path = join(stateDirectory, RUNTIME_ENDS_FILE)
  const earlier = await readFile(path, 'utf8').then(runtimeEndsOf, () => [])
  const ends = [...earlier.filter((entry) => entry.runtime !== end.runtime), end].slice(
    -MAX_RUNTIME_ENDS
  )
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify({ ends }))
  await rename(temporary, path)
}

/** Resolves once the word landed, failed, or ran out of time; never rejects. */
export function recordAgentSessionRuntimeEnd(
  stateDirectory: string,
  runtime: string,
  trigger: AgentSessionResumeTrigger,
  now: number,
  timeoutMs = RUNTIME_END_RECORD_TIMEOUT_MS
): Promise<void> {
  return withTimeout(
    appendRuntimeEnd(stateDirectory, { runtime, trigger, at: now }).catch(() => undefined),
    timeoutMs,
    undefined
  )
}
