import { toast } from 'sonner'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  announceRestartResults,
  type RestartContinuationOutcome,
  type RestartContinueResult
} from './native-chat-restart-action-notifications'

vi.mock('sonner', () => ({ toast: vi.fn() }))

const actions = { show: vi.fn(), dismiss: vi.fn() }
const refusedBoth = [
  { sessionId: 'a', outcome: 'refused' as const },
  { sessionId: 'b', outcome: 'refused' as const }
]

function answered(
  requested: string[],
  results: RestartContinuationOutcome[],
  hostFailed: { sessionId: string; outcome: 'refused' | 'unconfirmed' }[] | undefined,
  machine = 'local',
  machineName?: string
): RestartContinueResult {
  return {
    machine,
    requested,
    kind: 'answered',
    results,
    hostFailed,
    ...(machineName ? { machineName } : {})
  }
}

function titles(): unknown[] {
  return vi.mocked(toast).mock.calls.map(([text]) => text)
}

beforeEach(() => {
  vi.mocked(toast).mockClear()
  actions.show.mockClear()
  actions.dismiss.mockClear()
})

// `b` finished on its own, or the user already answered it: the host no longer lists it, so the
// notice must not count a failure the list it opens cannot show.
it('counts only the requested chats the host still lists as failed', () => {
  announceRestartResults(
    [answered(['a', 'b'], refusedBoth, [{ sessionId: 'a', outcome: 'refused' }])],
    actions
  )
  expect(titles()).toEqual(['1 chat couldn’t be resumed'])
})

// Another device resumed or dismissed them first, or the chat moved on: nothing failed and nothing
// was sent, and the click still gets an answer.
it('says the chats no longer need resuming when the host lists none of them as failed', () => {
  announceRestartResults([answered(['a', 'b'], refusedBoth, [])], actions)
  expect(titles()).toEqual(['2 chats no longer need resuming'])
})

it('counts every chat not carried on when an older host sends no failure list', () => {
  announceRestartResults([answered(['a', 'b'], refusedBoth, undefined)], actions)
  expect(titles()).toEqual(['2 chats couldn’t be resumed'])
})

// The host retires an unconfirmed send once the agent is seen carrying on it; the action must still
// report the chat, and as resumed, not as a failure the list can no longer show.
it('counts an unconfirmed chat the host no longer lists as resumed', () => {
  announceRestartResults([answered(['a'], [{ sessionId: 'a', outcome: 'unknown' }], [])], actions)
  expect(titles()).toEqual(['Resumed 1 chat and asked it to continue'])
})

// Unconfirmed means the agent may well be working; "couldn't be resumed" would invite a second send.
// `b` reattached with no continuation row: only the host's filed outcome says it is unconfirmed.
it('counts a chat the host filed as unconfirmed on its own line, as the list does', () => {
  announceRestartResults(
    [
      answered(
        ['a', 'b'],
        [{ sessionId: 'a', outcome: 'refused' }],
        [
          { sessionId: 'a', outcome: 'refused' },
          { sessionId: 'b', outcome: 'unconfirmed' }
        ]
      )
    ],
    actions
  )
  expect(vi.mocked(toast).mock.calls).toEqual([
    [
      '1 chat couldn’t be resumed',
      expect.objectContaining({ description: 'Couldn’t confirm 1 other chat was resumed' })
    ]
  ])
})

it('leads with the unconfirmed count when nothing was refused', () => {
  announceRestartResults(
    [
      answered(
        ['a', 'b'],
        [
          { sessionId: 'a', outcome: 'unknown' },
          { sessionId: 'b', outcome: 'pending' }
        ],
        undefined
      )
    ],
    actions
  )
  expect(vi.mocked(toast).mock.calls).toEqual([
    [
      'Couldn’t confirm 2 chats were resumed',
      expect.not.objectContaining({ description: expect.anything() })
    ]
  ])
})

it('reports one resume across machines in one notice per kind of result', () => {
  announceRestartResults(
    [
      answered(['l1'], [{ sessionId: 'l1', outcome: 'continued' }], []),
      answered(
        ['s1', 's2'],
        [{ sessionId: 's1', outcome: 'continued' }],
        [{ sessionId: 's2', outcome: 'refused' }],
        'environment:studio',
        'studio-mac'
      ),
      {
        machine: 'environment:build',
        machineName: 'build-box',
        requested: ['b1'],
        kind: 'unconfirmed'
      }
    ],
    actions
  )
  expect(titles()).toEqual([
    'Resumed 2 chats and asked them to continue',
    '1 chat on studio-mac couldn’t be resumed',
    'Continuation delivery is unconfirmed for 1 chat. Open it to check before sending another message.'
  ])
})

it('names the server when its chats alone are counted, and opens the dialog on it', () => {
  announceRestartResults(
    [
      answered(
        ['s1'],
        [{ sessionId: 's1', outcome: 'continued' }],
        [],
        'environment:studio',
        'studio-mac'
      )
    ],
    actions
  )
  expect(titles()).toEqual(['Resumed 1 chat on studio-mac and asked it to continue'])
})

it('counts failures on several machines together and opens the dialog on none in particular', () => {
  announceRestartResults(
    [
      answered(['a'], [], [{ sessionId: 'a', outcome: 'refused' }]),
      answered(
        ['s1'],
        [],
        [{ sessionId: 's1', outcome: 'refused' }],
        'environment:studio',
        'studio-mac'
      )
    ],
    actions
  )
  expect(titles()).toEqual(['2 chats couldn’t be resumed'])
  const options = vi.mocked(toast).mock.calls[0]?.[1]
  const press = (entry: unknown) =>
    typeof entry === 'object' &&
    entry !== null &&
    'onClick' in entry &&
    typeof entry.onClick === 'function'
      ? entry.onClick()
      : undefined
  press(options?.action)
  expect(actions.show).toHaveBeenCalledWith(null)
  press(options?.cancel)
  expect(actions.dismiss.mock.calls).toEqual([
    ['local', ['a']],
    ['environment:studio', ['s1']]
  ])
})

it('counts a resume refused before it left (the server was re-paired) as not resumed', () => {
  announceRestartResults(
    [
      {
        machine: 'environment:studio',
        machineName: 'studio-mac',
        requested: ['s1'],
        kind: 'not-sent'
      }
    ],
    actions
  )
  expect(titles()).toEqual(['1 chat on studio-mac couldn’t be resumed'])
})
