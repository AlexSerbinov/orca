import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentChildRowContextForSessionStream } from '../../../src/shared/agent-child-row-stream-context'
import type { AgentChildWorkView } from '../../../src/shared/agent-status-child-work-view'
import type { AgentSessionBackgroundTaskState } from '../../../src/shared/agent-session-wire'
import { structuredSessionBackgroundTasksView } from '../../../src/shared/structured-session-background-tasks-view'
import { MobileNativeChatBackgroundTasks } from './MobileNativeChatBackgroundTasks'

const NOW = 10_000_000
const windowWidth = vi.hoisted(() => ({ value: 430 }))

vi.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: windowWidth.value, height: 900 }) },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({
  Activity: 'Activity',
  Bot: 'Bot',
  ChevronDown: 'ChevronDown',
  CircleHelp: 'CircleHelp',
  SquareTerminal: 'SquareTerminal',
  Workflow: 'Workflow'
}))
vi.mock('../components/AgentStateDot', () => ({
  AGENT_WORKING_COLOR: '#eab308',
  AgentStateDot: 'AgentStateDot'
}))
vi.mock('../hooks/use-now', () => ({ useNow: () => NOW }))

function view(id: string, overrides: Partial<AgentChildWorkView> = {}): AgentChildWorkView {
  return {
    id,
    providerId: `task-${id}`,
    kind: 'agent',
    description: `review ${id}`,
    state: 'working',
    membership: 'live',
    firstObservedAt: NOW - 65_000,
    observedAt: NOW - 1_000,
    stoppable: true,
    invocation: { invocationId: `spawn-${id}`, generation: 1 },
    ...overrides
  }
}

type Props = Parameters<typeof MobileNativeChatBackgroundTasks>[0]

function tasksFor(
  state: AgentSessionBackgroundTaskState | null,
  options: { streamLive?: boolean; stop?: (taskId?: string) => Promise<unknown> } = {}
): Props['tasks'] {
  return {
    view: structuredSessionBackgroundTasksView(state, null),
    rowContext: agentChildRowContextForSessionStream(options.streamLive ?? true, {
      hostNow: NOW,
      receivedAt: NOW
    }),
    stop: options.stop ?? vi.fn(async () => undefined)
  }
}

describe('MobileNativeChatBackgroundTasks', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    windowWidth.value = 430
  })

  function mount(tasks: Props['tasks']): ReactTestRenderer {
    act(() => renderer?.unmount())
    const mounted = create(createElement('View'))
    renderer = mounted
    act(() => {
      mounted.update(createElement(MobileNativeChatBackgroundTasks, { tasks }))
    })
    return mounted
  }

  function textOf(node: ReactTestInstance): string {
    return node.children
      .map((child) => (typeof child === 'string' ? child : textOf(child)))
      .join('')
  }

  function header(mounted: ReactTestRenderer): ReactTestInstance {
    return mounted.root.findAll(
      (node) =>
        String(node.type) === 'Pressable' && node.props.accessibilityState?.expanded !== undefined
    )[0]!
  }

  function expand(mounted: ReactTestRenderer): void {
    act(() => header(mounted).props.onPress())
  }

  function stopButtons(mounted: ReactTestRenderer): ReactTestInstance[] {
    return mounted.root.findAll(
      (node) =>
        String(node.type) === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Stop')
    )
  }

  it('draws nothing while no child work runs', () => {
    expect(mount(tasksFor(null)).toJSON()).toBeNull()
    expect(
      mount(
        tasksFor({ state: 'monitoring', settledTasks: [{ id: 'old', kind: 'agent' }] })
      ).toJSON()
    ).toBeNull()
  })

  it('counts by kind on a wide strip and drops to a total once narrow', () => {
    const mounted = mount(
      tasksFor({
        state: 'monitoring',
        children: [view('a'), view('b'), view('s', { kind: 'command', description: 'npm test' })]
      })
    )
    expect(header(mounted).props.accessibilityLabel).toBe('2 agents · 1 shell')
    const strip = mounted.root.find((node) => node.props.testID === 'background-tasks-strip')
    act(() => strip.props.onLayout({ nativeEvent: { layout: { width: 343 } } }))
    expect(header(mounted).props.accessibilityLabel).toBe('3 background tasks')
  })

  it('starts narrow on a phone-width window, as desktop starts from its viewport', () => {
    windowWidth.value = 375
    const mounted = mount(tasksFor({ state: 'monitoring', children: [view('a'), view('b')] }))
    expect(header(mounted).props.accessibilityLabel).toBe('2 background tasks')
  })

  it('leads with a waiting agent and its reason', () => {
    const mounted = mount(
      tasksFor({ state: 'monitoring', children: [view('a', { state: 'waiting' })] })
    )
    expect(header(mounted).props.accessibilityLabel).toBe('1 agent waiting — needs approval')
  })

  it('opens to rows grouped by kind, with tokens and elapsed', () => {
    const mounted = mount(
      tasksFor({ state: 'monitoring', children: [view('a', { totalTokens: 18_130 })] })
    )
    expect(
      mounted.root.findAll((node) => node.props.testID === 'background-task-row')
    ).toHaveLength(0)
    expand(mounted)
    const rows = mounted.root.findAll((node) => node.props.testID === 'background-task-row')
    expect(rows.map(textOf)).toEqual(['review a · Agent18.1k · 1m 5s'])
    expect(textOf(mounted.root)).toContain('AGENTS')
  })

  it('stops one row by its provider id and holds its button while the Stop is on its way', async () => {
    let finish: () => void = () => {}
    const stop = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const mounted = mount(
      tasksFor(
        {
          state: 'monitoring',
          supportsTaskStop: true,
          children: [view('a'), view('b', { stoppable: false })]
        },
        { stop }
      )
    )
    expand(mounted)
    const buttons = stopButtons(mounted)
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(['Stop review a'])
    act(() => buttons[0]!.props.onPress())
    act(() => buttons[0]!.props.onPress())
    expect(stop).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledWith('task-a')
    expect(stopButtons(mounted)[0]!.props.disabled).toBe(true)
    await act(async () => finish())
    expect(stopButtons(mounted)[0]!.props.disabled).toBe(false)
  })

  it('offers Stop all only to a host with no per-row stop that still accepts one', () => {
    const fallback = mount(tasksFor({ state: 'monitoring', children: [view('a')] }))
    expand(fallback)
    expect(stopButtons(fallback).map((button) => button.props.accessibilityLabel)).toEqual([
      'Stop background tasks'
    ])
    const none = mount(
      tasksFor({ state: 'monitoring', supportsStopAll: false, children: [view('a')] })
    )
    expand(none)
    expect(stopButtons(none)).toEqual([])
  })

  it("reads an older host's task roster when it publishes no child views", () => {
    const mounted = mount(
      tasksFor({
        state: 'monitoring',
        tasks: [
          { id: 'a', kind: 'agent', state: 'working', startedAt: NOW - 1_000 },
          { id: 'b', kind: 'agent', state: 'waiting', startedAt: NOW - 1_000 }
        ]
      })
    )
    expect(header(mounted).props.accessibilityLabel).toBe('2 agents — 1 working, 1 waiting')
    expand(mounted)
    expect(
      mounted.root.findAll((node) => node.props.testID === 'background-task-row').map(textOf)
    ).toEqual(['Background agent1s', 'Background agent · needs approval1s'])
  })

  it('claims no live work once the stream is lost', () => {
    const mounted = mount(
      tasksFor({ state: 'monitoring', children: [view('a'), view('b')] }, { streamLive: false })
    )
    expect(header(mounted).props.accessibilityLabel).toBe('2 agents with status unavailable')
    expand(mounted)
    const dots = mounted.root.findAll((node) => String(node.type) === 'AgentStateDot')
    expect(dots.map((dot) => dot.props.state)).toEqual(['unverifiable', 'unverifiable'])
    expect(textOf(mounted.root)).toContain('review a · No update in 0m')
  })
})
