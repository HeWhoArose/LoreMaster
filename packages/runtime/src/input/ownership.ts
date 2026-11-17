// Input ownership: whose key is this? The game listens on `window` (movement, shortcuts); the player types into
// fields (the story's, a search, a select). Both answer the same keys, so the rule has to be one function that every
// gameplay handler asks — not a handler's own guess, and not `stopPropagation` in one widget.
//
// A key that came from a text field is never the game's, and while a field holds the keyboard the game takes no key
// at all. Fields are recognised from the event's own path as well as from `document.activeElement`, so a key typed in
// a field the browser has not finished focusing cannot walk the player, and a page's own editor inside a shadow root
// is seen too.
//
// installInputOwnership is the other half: the moment a field takes the keyboard the game's held state is cleared. A
// movement key pressed before the player clicked into a field would otherwise stay down forever, its keyup going to
// the field instead of to the game.

/** The tags whose content is typed: a text area and a select own their keys as an input does. */
const TEXT_TAGS = new Set(['TEXTAREA', 'SELECT'])
/** Inputs that hold no text: a click or a drag, never a keystroke. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

interface ElementLike {
  tagName?: unknown
  type?: unknown
  isContentEditable?: unknown
  getAttribute?: (name: string) => string | null
}

const attribute = (node: ElementLike, name: string): string | null =>
  typeof node.getAttribute === 'function' ? node.getAttribute(name) : null

/**
 * Whether a node is something the player types into: an input that holds text, a text area, a select, an editable
 * element, or a widget that says its keys are its own (`data-text-entry`, `role="textbox"`).
 */
export function isTextEntry(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const element = node as ElementLike
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  if (tag === 'INPUT') {
    const type = typeof element.type === 'string' ? element.type.toLowerCase() : 'text'
    return !NON_TEXT_INPUTS.has(type)
  }
  if (TEXT_TAGS.has(tag)) return true
  if (element.isContentEditable === true) return true
  const editable = attribute(element, 'contenteditable')
  if (editable !== null && editable.toLowerCase() !== 'false') return true
  const role = (attribute(element, 'role') ?? '').toLowerCase()
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true
  return attribute(element, 'data-text-entry') !== null
}

/** Whether a key event came from (or bubbled through) a text field: the game must not act on it. */
export function isTextEntryEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false
  const e = event as { composedPath?: () => unknown[]; target?: unknown }
  const path = typeof e.composedPath === 'function' ? e.composedPath() : []
  const nodes = path.length ? path : [e.target]
  for (const node of nodes) if (isTextEntry(node)) return true
  return false
}

/** The field that holds the keyboard now, if any (looking into shadow roots, where a page keeps its own editors). */
export function focusedTextEntry(): unknown {
  let active: unknown = typeof document === 'undefined' ? undefined : document.activeElement
  for (let depth = 0; active && depth < 10; depth++) {
    if (isTextEntry(active)) return active
    const shadow = (active as { shadowRoot?: { activeElement?: unknown } | null }).shadowRoot
    active = shadow?.activeElement
  }
  return undefined
}

/** The player is typing: the game takes no key at all. */
export const isTyping = (): boolean => !!focusedTextEntry()

/** A key is the game's: only when no text field owns the keyboard, and the event did not come from one. */
export function gameOwnsKey(event: unknown): boolean {
  return !isTextEntryEvent(event) && !isTyping()
}

export interface TextEntryOwnership {
  /** Ends whatever the game was doing with the keyboard (held movement, a swing, a press under way). */
  stop: () => void
}

/**
 * Watch the keyboard change hands: the moment a text field takes it, the game's held state is cleared. Returns the
 * undo (for a frame torn down, or a test).
 */
export function installInputOwnership(ownership: TextEntryOwnership): () => void {
  if (typeof document === 'undefined') return () => {}
  let typing = isTyping()
  const check = (): void => {
    const now = isTyping()
    if (now === typing) return
    typing = now
    if (now) ownership.stop()
  }
  document.addEventListener('focusin', check, true)
  document.addEventListener('focus', check, true)
  document.addEventListener('focusout', check, true)
  return () => {
    document.removeEventListener('focusin', check, true)
    document.removeEventListener('focus', check, true)
    document.removeEventListener('focusout', check, true)
  }
}
