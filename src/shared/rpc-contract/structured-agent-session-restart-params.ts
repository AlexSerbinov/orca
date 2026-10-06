import { z } from 'zod'
import { SessionId } from './structured-agent-session-params'

// Wire validation for the restart-resume offer: listing, dismissing and acting on it.

/** One relaunch cannot offer more chats than a profile plausibly holds. */
export const MAX_RESTART_RESUME_SESSIONS = 512

/** A launch's offer to resume what the last teardown recorded as working; the set is the host's to
 *  derive, never a client's to assert. Listing takes nothing. Dismissing takes the sessions to
 *  forget, or nothing to forget them all; a client only ever names sessions the host itself listed,
 *  so an older host that rejects the key is never asked to. */
export const RestartResumableParams = z
  .object({ sessionIds: z.array(SessionId).max(MAX_RESTART_RESUME_SESSIONS).optional() })
  .strict()

/** Dismissing: `sessionIds` as before, or `offers` naming each chat with the interruption the
 *  client listed. A host that reads `offers` forgets only records still matching them and leaves a
 *  chat another action is resuming; it is sent only to a host advertising paired restart offers,
 *  and `sessionIds` rides along for one that predates `offers`. */
export const RestartDismissParams = z
  .object({
    sessionIds: z.array(SessionId).max(MAX_RESTART_RESUME_SESSIONS).optional(),
    offers: z
      .array(z.object({ sessionId: SessionId, recordedAt: z.number().finite() }).strict())
      .max(MAX_RESTART_RESUME_SESSIONS)
      .optional()
  })
  .strict()

/** Omitting `sessionIds` takes the whole offered set; naming them takes that subset. Either way the
 *  host re-derives eligibility, so an id a client invents is simply not in the set. */
export const RestartResumeParams = z
  .object({ sessionIds: z.array(SessionId).max(MAX_RESTART_RESUME_SESSIONS).optional() })
  .strict()
