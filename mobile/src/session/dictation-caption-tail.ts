/** Average glyph width as a share of the font size; conservative so two lines rarely overflow. */
const GLYPH_WIDTH_RATIO = 0.6
const CAPTION_LINES = 2
const MIN_CHAR_BUDGET = 24
/** Used before the first layout pass reports the caption width. */
export const DEFAULT_CAPTION_CHAR_BUDGET = 80
/** Snap to a word start only when one is this close, so a long word still shows its end. */
const WORD_SNAP_WINDOW = 16

/** How many characters fit in the caption's two lines at this width and Dynamic Type scale. */
export function captionCharBudget(width: number, fontSize: number, fontScale: number): number {
  if (!(width > 0) || !(fontSize > 0)) {
    return DEFAULT_CAPTION_CHAR_BUDGET
  }
  const glyphWidth = fontSize * Math.max(fontScale, 1) * GLYPH_WIDTH_RATIO
  return Math.max(MIN_CHAR_BUDGET, Math.floor(width / glyphWidth) * CAPTION_LINES)
}

/**
 * The newest words of a live caption, led by '…' when older words were cut.
 * Why: Android ignores ellipsizeMode="head" past one line, so the cut happens in JS.
 */
export function captionTail(caption: string, maxChars: number): string {
  if (caption.length <= maxChars) {
    return caption
  }
  let tail = caption.slice(caption.length - Math.max(maxChars - 1, 1))
  const boundary = tail.search(/\s/)
  if (boundary >= 0 && boundary < WORD_SNAP_WINDOW && boundary < tail.length - 1) {
    tail = tail.slice(boundary + 1)
  }
  return `…${tail.trimStart()}`
}
