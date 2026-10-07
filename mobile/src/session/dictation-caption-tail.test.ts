import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAPTION_CHAR_BUDGET,
  captionCharBudget,
  captionTail
} from './dictation-caption-tail'

describe('captionTail', () => {
  it('keeps a caption that fits untouched', () => {
    expect(captionTail('git status', 40)).toBe('git status')
  })

  it('keeps the newest words and starts on a word boundary', () => {
    const caption = 'one two three four five six seven eight nine ten'
    expect(captionTail(caption, 20)).toBe('…eight nine ten')
  })

  it('cuts inside a very long word instead of dropping it', () => {
    const tail = captionTail(`start ${'x'.repeat(50)}`, 20)
    expect(tail).toBe(`…${'x'.repeat(19)}`)
  })
})

describe('captionCharBudget', () => {
  it('fits two lines of the measured width', () => {
    expect(captionCharBudget(336, 14, 1)).toBe(80)
  })

  it('shrinks with Dynamic Type', () => {
    expect(captionCharBudget(336, 14, 2)).toBeLessThan(captionCharBudget(336, 14, 1))
  })

  it('falls back before the first layout', () => {
    expect(captionCharBudget(0, 14, 1)).toBe(DEFAULT_CAPTION_CHAR_BUDGET)
  })
})
