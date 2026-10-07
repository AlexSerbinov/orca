import { memo, useMemo } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatToolCallBlock
} from '../../../../shared/native-chat-types'
import { deriveNativeChatRowContent } from '../../../../shared/native-chat-row-content'
import {
  nativeChatWorkRunEditKey,
  nativeChatWorkRunEntries
} from '../../../../shared/native-chat-work-run'
import { MessageRow, type NativeChatMessageRowRun } from './NativeChatMessageRow'
import { NativeChatReasoningRow } from './NativeChatReasoningRow'
import { NativeChatToolRun } from './NativeChatToolRun'
import type { NativeChatDiffReveal } from './native-chat-turn-diffs'
import { nativeChatRowRendersProse } from './native-chat-trailing-run'

type NativeChatWorkRunRowProps = {
  /** The run's messages, oldest first; the first one's id keys the run's disclosure. */
  members: readonly NativeChatMessage[]
  previousTodoWrite?: NativeChatToolCallBlock
  previousUpdatePlan?: NativeChatToolCallBlock
  revealedDiff?: NativeChatDiffReveal
  expandSignal: boolean
  activeTurnIsWorking?: boolean
  trailingRun?: boolean
  onScrollMessageToTop: (el: HTMLElement) => void
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  runtimeContext?: RuntimeFileOperationArgs | null
}

/** Tool calls and thoughts from several messages as one run: the header speaks for the
 *  calls, and the thoughts read in order among them once it opens. A run headed by the
 *  agent's words draws under them, as that message's own run. */
export const NativeChatWorkRunRow = memo(function NativeChatWorkRunRow({
  members,
  previousTodoWrite,
  previousUpdatePlan,
  revealedDiff,
  expandSignal,
  activeTurnIsWorking,
  trailingRun,
  onScrollMessageToTop,
  onLinkClick,
  allowFileUriLinks,
  runtimeContext
}: NativeChatWorkRunRowProps): React.JSX.Element | null {
  const run = useMemo((): NativeChatMessageRowRun => {
    const { blocks, thoughtsBefore, thoughtsAfter } = nativeChatWorkRunEntries(members)
    const thought = (message: NativeChatMessage): React.JSX.Element => (
      <NativeChatReasoningRow
        key={message.id}
        message={message}
        markdown={deriveNativeChatRowContent(message.blocks).markdown}
        turnIsWorking={activeTurnIsWorking}
        onLinkClick={onLinkClick}
        allowFileUriLinks={allowFileUriLinks}
      />
    )
    const asidesBefore = new Map<NativeChatBlock, React.ReactNode>()
    for (const [block, thoughts] of thoughtsBefore) {
      asidesBefore.set(block, thoughts.map(thought))
    }
    return {
      blocks,
      asidesBefore,
      ...(thoughtsAfter.length > 0 ? { asideAfter: thoughtsAfter.map(thought) } : {})
    }
  }, [members, activeTurnIsWorking, onLinkClick, allowFileUriLinks])
  const reveal = useMemo(() => {
    const editKey = revealedDiff
      ? nativeChatWorkRunEditKey(members, run.blocks, revealedDiff)
      : null
    return revealedDiff && editKey ? { ...revealedDiff, editKey } : undefined
  }, [members, run.blocks, revealedDiff])
  const head = members[0]
  if (!head) {
    return null
  }
  if (head.role === 'assistant' && nativeChatRowRendersProse(head)) {
    return (
      <MessageRow
        message={head}
        previousTodoWrite={previousTodoWrite}
        previousUpdatePlan={previousUpdatePlan}
        revealedDiff={reveal}
        expandSignal={expandSignal}
        activeTurnIsWorking={activeTurnIsWorking}
        trailingRun={trailingRun}
        onScrollMessageToTop={onScrollMessageToTop}
        onLinkClick={onLinkClick}
        allowFileUriLinks={allowFileUriLinks}
        runtimeContext={runtimeContext}
        run={run}
      />
    )
  }
  return (
    <div className="group relative max-w-full select-text text-sm native-chat-message-text leading-relaxed text-chat-foreground">
      <NativeChatToolRun
        blocks={run.blocks}
        previousTodoWrite={previousTodoWrite}
        previousUpdatePlan={previousUpdatePlan}
        revealedDiff={reveal}
        onRevealDiff={onScrollMessageToTop}
        onLinkClick={onLinkClick}
        expandSignal={expandSignal}
        activeTurnIsWorking={activeTurnIsWorking}
        trailing={trailingRun}
        disclosureId={head.id}
        asidesBefore={run.asidesBefore}
        asideAfter={run.asideAfter}
      />
    </div>
  )
}, sameWorkRunRowProps)

const SCALAR_PROPS = [
  'previousTodoWrite',
  'previousUpdatePlan',
  'revealedDiff',
  'expandSignal',
  'activeTurnIsWorking',
  'trailingRun',
  'onScrollMessageToTop',
  'onLinkClick',
  'allowFileUriLinks',
  'runtimeContext'
] as const satisfies readonly Exclude<keyof NativeChatWorkRunRowProps, 'members'>[]

/** A rebuilt transcript hands every run a fresh member list; same messages, same row. */
function sameWorkRunRowProps(
  previous: NativeChatWorkRunRowProps,
  next: NativeChatWorkRunRowProps
): boolean {
  return (
    SCALAR_PROPS.every((key) => Object.is(previous[key], next[key])) &&
    previous.members.length === next.members.length &&
    previous.members.every((message, index) => message === next.members[index])
  )
}
