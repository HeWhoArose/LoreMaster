// @vitest-environment jsdom
// What the player types is the field's, and never the world's: the same gate every gameplay key handler in
// main.ts asks (src/input/ownership.ts), wired here to a game that records what it was told to do. The narrative
// panel is the real one, so its Enter/Shift+Enter/Escape and its focus behaviour are the shipped ones.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameOwnsKey, installInputOwnership, isTextEntry, isTyping } from '../src/input/ownership.ts'
import { NarrativePanel } from '../src/ui/narrative.ts'
import type { NarrativeView } from '../src/protocol.ts'

/** The movement a key code means, as main.ts maps it. */
const DIR: Record<string, string> = {
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const view = (over: Partial<NarrativeView> = {}): NarrativeView => ({
  status: 'idle',
  chapter: '',
  lines: [],
  turns: 0,
  memories: 0,
  ...over,
})

const codeOf = (char: string): string => (char === ' ' ? 'Space' : `Key${char.toUpperCase()}`)

/** A key pressed at a target: whether the page took it (default prevented) comes back. */
function pressAt(target: EventTarget, code: string, key = code, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function releaseAt(target: EventTarget, code: string, key = code): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }))
}

interface Rig {
  panel: NarrativePanel
  input: HTMLTextAreaElement
  asked: string[]
  /** Every walk direction the game was told about, in order (null: stand still). */
  moves: (string | null)[]
  /** Gameplay actions other than walking (the attack key, the menu key). */
  actions: string[]
  /** Times the keyboard changed hands and the game was made to drop what it held. */
  stops: number
  held: string[]
  type: (text: string) => void
  dispose: () => void
}

/**
 * The page's keyboard as main.ts wires it: one ownership gate in front of the game's own actions, and the same
 * installInputOwnership so a field taking the keyboard clears whatever was held.
 */
function mount(): Rig {
  document.body.replaceChildren()
  const asked: string[] = []
  const moves: (string | null)[] = []
  const actions: string[] = []
  const held: string[] = []
  const panel = new NarrativePanel({
    ask: (text) => asked.push(text),
    clarify: () => {},
    regenerate: () => {},
  })

  const sync = (): void => {
    moves.push(held.length ? held[held.length - 1]! : null)
  }
  const onDown = (event: KeyboardEvent): void => {
    // the ownership gate: a text field's key is never the world's
    if (!gameOwnsKey(event)) return
    if (event.code === 'Space') {
      actions.push('attack')
      event.preventDefault()
      return
    }
    if (event.code === 'Escape') {
      actions.push('menu')
      return
    }
    const dir = DIR[event.code]
    if (!dir) return
    if (!held.includes(dir)) held.push(dir)
    sync()
    event.preventDefault()
  }
  const onUp = (event: KeyboardEvent): void => {
    if (!gameOwnsKey(event)) return
    const dir = DIR[event.code]
    if (!dir) return
    const at = held.indexOf(dir)
    if (at >= 0) held.splice(at, 1)
    sync()
  }
  let stops = 0
  const detach = installInputOwnership({
    stop: () => {
      stops++
      held.length = 0
      sync()
    },
  })
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)

  const input = document.querySelector('.narr-input') as HTMLTextAreaElement
  const rig: Rig = {
    panel,
    input,
    asked,
    moves,
    actions,
    get stops() {
      return stops
    },
    held,
    // real typing: the key the browser would see, then the character, unless the page stopped it
    type: (text: string) => {
      for (const char of text) {
        if (!pressAt(input, codeOf(char), char)) input.value += char
      }
    },
    dispose: () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      detach()
      panel.toggle(false)
      document.body.replaceChildren()
    },
  }
  return rig
}

let rig: Rig
beforeEach(() => {
  rig = mount()
})
afterEach(() => {
  rig.dispose()
})

/** The directions the game was told to walk (the nulls are the moments it was made to stand still). */
const walked = (): string[] => rig.moves.filter((move): move is string => move !== null)

describe('the narrative field owns the keyboard', () => {
  it('types wasd without walking', () => {
    rig.panel.toggle(true)
    expect(document.activeElement).toBe(rig.input)
    rig.type('wasd')
    expect(rig.input.value).toBe('wasd')
    expect(rig.held).toEqual([])
    expect(walked()).toEqual([])
  })

  it('types a sentence of movement words without acting in the world', () => {
    rig.panel.toggle(true)
    rig.type('walk north, then put the axe down and run south')
    expect(rig.input.value).toBe('walk north, then put the axe down and run south')
    expect(walked()).toEqual([])
    expect(rig.actions).toEqual([])
  })

  it('lets the arrow keys move the caret, not the player', () => {
    rig.panel.toggle(true)
    rig.input.value = 'the lantern'
    expect(pressAt(rig.input, 'ArrowLeft', 'ArrowLeft')).toBe(false)
    pressAt(rig.input, 'ArrowUp', 'ArrowUp')
    pressAt(rig.input, 'ArrowRight', 'ArrowRight')
    expect(walked()).toEqual([])
    expect(rig.input.value).toBe('the lantern')
  })

  it('inserts a space rather than swinging', () => {
    rig.panel.toggle(true)
    rig.type('two words')
    expect(rig.input.value).toBe('two words')
    expect(rig.actions).toEqual([])
    expect(walked()).toEqual([])
  })

  it('sends exactly one message on Enter, and can be used again', () => {
    rig.panel.toggle(true)
    rig.type('look around')
    pressAt(rig.input, 'Enter', 'Enter')
    expect(rig.asked).toEqual(['look around'])
    expect(rig.input.value).toBe('')
    // a second Enter with nothing written sends nothing more
    pressAt(rig.input, 'Enter', 'Enter')
    expect(rig.asked).toHaveLength(1)
    // the answer comes: the field takes the keyboard back, and the next message goes too
    rig.panel.show(view({ status: 'narrated', turns: 1 }))
    rig.type('again')
    pressAt(rig.input, 'Enter', 'Enter')
    expect(rig.asked).toEqual(['look around', 'again'])
  })

  it('keeps Shift+Enter to the field as a newline', () => {
    rig.panel.toggle(true)
    rig.type('first line')
    const prevented = pressAt(rig.input, 'Enter', 'Enter', { shiftKey: true })
    expect(prevented).toBe(false)
    if (!prevented) rig.input.value += '\n'
    expect(rig.input.value).toBe('first line\n')
    expect(rig.asked).toEqual([])
  })

  it('submits nothing twice and nothing to the world', () => {
    rig.panel.toggle(true)
    rig.type('strike the post')
    pressAt(rig.input, 'Enter', 'Enter')
    expect(rig.asked).toHaveLength(1)
    expect(rig.actions).toEqual([])
    expect(walked()).toEqual([])
  })
})

describe('gameplay keeps its keys when no field has them', () => {
  it('walks and stands still outside text entry', () => {
    rig.panel.toggle(true)
    rig.input.blur()
    pressAt(document.body, 'KeyD', 'd')
    expect(rig.held).toEqual(['right'])
    expect(walked()).toEqual(['right'])
    releaseAt(document.body, 'KeyD', 'd')
    expect(rig.held).toEqual([])
    expect(rig.moves.slice(-2)).toEqual(['right', null])
    // the attack key is still the game's
    pressAt(document.body, 'Space', ' ')
    expect(rig.actions).toEqual(['attack'])
  })

  it('suppresses gameplay from every kind of editable field', () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.append(field)
    field.focus()
    pressAt(field, 'KeyW', 'w')
    expect(walked()).toEqual([])

    const area = document.createElement('textarea')
    document.body.append(area)
    area.focus()
    pressAt(area, 'KeyA', 'a')
    expect(walked()).toEqual([])

    const select = document.createElement('select')
    document.body.append(select)
    select.focus()
    pressAt(select, 'KeyS', 's')
    expect(walked()).toEqual([])

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = 0
    document.body.append(editable)
    editable.focus()
    pressAt(editable, 'KeyD', 'd')
    expect(walked()).toEqual([])

    const widget = document.createElement('div')
    widget.setAttribute('data-text-entry', '')
    widget.tabIndex = 0
    document.body.append(widget)
    widget.focus()
    pressAt(widget, 'KeyW', 'w')
    expect(walked()).toEqual([])

    expect(isTextEntry(editable)).toBe(true)
    expect(isTextEntry(widget)).toBe(true)
    expect(isTextEntry(document.createElement('button'))).toBe(false)
    expect(isTyping()).toBe(true)
  })

  it('does not leave movement stuck when a field takes the keyboard mid-walk', () => {
    pressAt(document.body, 'KeyW', 'w')
    expect(rig.held).toEqual(['up'])
    expect(walked()).toEqual(['up'])
    rig.panel.toggle(true)
    expect(document.activeElement).toBe(rig.input)
    expect(rig.held).toEqual([])
    expect(rig.moves[rig.moves.length - 1]).toBe(null)
    // released over the field: the keyup is the field's, and the game is already standing still
    releaseAt(rig.input, 'KeyW', 'w')
    expect(rig.held).toEqual([])
    expect(rig.moves[rig.moves.length - 1]).toBe(null)
    expect(rig.stops).toBe(1)
  })
})
