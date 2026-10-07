import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatResolvedPrompt } from './native-chat-resolution-receipt'
import type { NativeChatTurnDiff } from './native-chat-turn-diffs'
import {
  buildNativeChatTranscriptSlots,
  nativeChatSlotIndexOf,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import {
  nativeChatWorkRunEditKey,
  nativeChatWorkRunEntries
} from '../../../../shared/native-chat-work-run'

function text(id: string, body: string, role: NativeChatMessage['role'] = 'assistant') {
  return {
    id,
    role,
    blocks: [{ type: 'text' as const, text: body }],
    timestamp: 1,
    source: 'transcript' as const
  }
}

function thought(id: string): NativeChatMessage {
  return { ...text(id, `thinking ${id}`, 'reasoning'), state: 'completed', completedAt: 2 }
}

function call(id: string, name = 'shell'): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [
      { type: 'tool-call', name, input: { command: id }, state: 'completed', callId: `c-${id}` }
    ],
    timestamp: 1,
    source: 'transcript'
  }
}

function build(
  messages: NativeChatMessage[],
  overrides: Partial<Parameters<typeof buildNativeChatTranscriptSlots>[0]> = {}
): NativeChatMessageSlot[] {
  let turn: string | undefined
  const turnKeys = messages.map((message) => {
    if (message.role === 'user') {
      turn = message.id
    }
    return turn
  })
  return buildNativeChatTranscriptSlots({
    messages,
    turnKeys,
    liveTurnKey: undefined,
    receipts: new Map<string, NativeChatResolvedPrompt>(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: new Map<string, NativeChatTurnDiff>(),
    expandedTurnKeys: new Set<string>(),
    isWorking: false,
    lifecycleWorking: false,
    ...overrides
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}

/** Each slot as its id, or its members' ids when it draws a work run. */
function rows(slots: NativeChatMessageSlot[]): (string | string[])[] {
  return slots.map((slot) => slot.workRun?.map((message) => message.id) ?? slot.message.id)
}

describe('work runs', () => {
  // A model that thinks before every call: one row, not one per thought and one per call.
  it('draws thoughts and the calls between them as one row', () => {
    const slots = build([
      text('u', 'go', 'user'),
      thought('r1'),
      call('a'),
      thought('r2'),
      call('b'),
      thought('r3'),
      text('x', 'Found it.'),
      call('c'),
      thought('r4'),
      call('d'),
      text('y', 'Done.')
    ])
    expect(rows(slots)).toEqual(['u', ['r1', 'a', 'r2', 'b', 'r3'], 'x', ['c', 'r4', 'd'], 'y'])
  })

  // The words a call was folded under head the run, so their calls and the ones after a
  // thought read as one run, not two.
  it('lets the agent words that carry calls head the run, but never join one', () => {
    const lead = (id: string): NativeChatMessage => ({
      ...call(id),
      blocks: [{ type: 'text', text: `${id} says` }, ...call(id).blocks]
    })
    expect(
      rows(
        build([
          text('u', 'go', 'user'),
          lead('x'),
          thought('r1'),
          call('a'),
          lead('y'),
          thought('r2'),
          text('z', 'Done.')
        ])
      )
    ).toEqual(['u', ['x', 'r1', 'a'], ['y', 'r2'], 'z'])
  })

  it('leaves a thought with no call beside it as its own row', () => {
    expect(rows(build([text('u', 'go', 'user'), thought('r'), text('x', 'Hi.')]))).toEqual([
      'u',
      'r',
      'x'
    ])
    expect(
      rows(build([text('u', 'go', 'user'), thought('r1'), thought('r2'), text('x', 'Hi.')]))
    ).toEqual(['u', 'r1', 'r2', 'x'])
  })

  it('never joins rows from two turns', () => {
    expect(
      rows(build([text('u1', 'go', 'user'), call('a'), text('u2', 'more', 'user'), call('b')]))
    ).toEqual(['u1', 'a', 'u2', 'b'])
  })

  it('ends a run at a receipt, which keeps its own row', () => {
    const receipts = new Map<string, NativeChatResolvedPrompt>([
      [
        'approval',
        {
          kind: 'approval',
          title: 'Run?',
          detail: 'ls',
          options: [],
          resolution: {
            state: 'resolved',
            selectedOptionId: 'y',
            resolvedBy: 'desktop',
            resolvedAt: 1
          }
        }
      ]
    ])
    const slots = build(
      [
        text('u', 'go', 'user'),
        call('a'),
        call('b'),
        text('approval', 'Run?', 'system'),
        call('c')
      ],
      { receipts }
    )
    expect(rows(slots)).toEqual(['u', ['a', 'b'], 'approval', 'c'])
  })

  // The thought the live line is showing draws no row; it joins once it ends.
  it('keeps the run open across the thought the live line shows', () => {
    const messages = [text('u', 'go', 'user'), call('a'), thought('r1'), call('b'), thought('r2')]
    expect(rows(build(messages, { liveReasoningId: 'r2' }))).toEqual(['u', ['a', 'r1', 'b']])
    expect(rows(build(messages))).toEqual(['u', ['a', 'r1', 'b', 'r2']])
  })

  it('is live while any of its calls is the turn frontier', () => {
    const slots = build([text('u', 'go', 'user'), call('a'), thought('r1'), call('b')], {
      liveTurnKey: 'u',
      isWorking: true
    })
    expect(slots[1]?.trailingRun).toBe(true)
  })

  it('finds a member by id, for a reveal aimed at it', () => {
    const slots = build([text('u', 'go', 'user'), call('a'), thought('r1'), call('b')])
    expect(nativeChatSlotIndexOf(slots, 'b')).toBe(1)
    expect(nativeChatSlotIndexOf(slots, 'r1')).toBe(1)
  })
})

describe('work run entries', () => {
  it('places each thought before the call after it, and keeps trailing ones last', () => {
    const members = [thought('r1'), call('a'), thought('r2'), call('b'), thought('r3')]
    const { blocks, thoughtsBefore, thoughtsAfter } = nativeChatWorkRunEntries(members)
    expect(blocks).toEqual([...members[1]!.blocks, ...members[3]!.blocks])
    expect(thoughtsBefore.get(blocks[0]!)?.map((m) => m.id)).toEqual(['r1'])
    expect(thoughtsBefore.get(blocks[1]!)?.map((m) => m.id)).toEqual(['r2'])
    expect(thoughtsAfter.map((m) => m.id)).toEqual(['r3'])
  })

  // The turn's diff rollup numbers an edit within its own message; the run counts across all.
  it("re-keys a message's edit to the run's numbering", () => {
    const members = [call('a', 'Diff'), call('b', 'Diff')]
    const { blocks } = nativeChatWorkRunEntries(members)
    expect(nativeChatWorkRunEditKey(members, blocks, { messageId: 'b', editKey: 'Diff:0' })).toBe(
      'Diff:1'
    )
    expect(nativeChatWorkRunEditKey(members, blocks, { messageId: 'z', editKey: 'Diff:0' })).toBe(
      null
    )
  })
})
