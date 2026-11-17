// The story panel: the player's own words, the narrator's answer, speaker-tagged lines,
// clarification choices and clear feedback when a turn is refused, fails or cannot be saved.
// It only sends messages; the engine worker runs the pipeline.

import type { NarrativeLineView, NarrativeView } from '../protocol.ts'

export interface NarrativeHooks {
  ask: (text: string) => void
  clarify: (choice: number) => void
  regenerate: (turnId: string) => void
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const ROLE_LABEL: Record<NarrativeLineView['role'], string> = {
  player: 'You',
  narrator: '',
  character: '',
  system: 'Note',
}

export class NarrativePanel {
  open = false
  private view: NarrativeView | undefined
  private readonly button: HTMLButtonElement
  private readonly panel: HTMLElement
  private readonly title: HTMLElement
  private readonly list: HTMLElement
  private readonly question: HTMLElement
  private readonly choices: HTMLElement
  private readonly status: HTMLElement
  private readonly form: HTMLFormElement
  private readonly input: HTMLInputElement
  private readonly retry: HTMLButtonElement
  private retryTurn: string | undefined

  constructor(private readonly hooks: NarrativeHooks) {
    this.button = el('button', 'narr-btn', 'Story')
    this.button.type = 'button'
    this.button.title = 'Speak, ask, or act in words'
    this.panel = el('section', 'narr-panel hidden')
    this.panel.setAttribute('aria-label', 'Story')

    const head = el('header', 'narr-head')
    this.title = el('h2', 'narr-title', 'The story')
    const close = el('button', 'narr-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close')
    close.onclick = () => this.toggle(false)
    head.append(this.title, close)

    this.list = el('div', 'narr-list')
    this.question = el('p', 'narr-question hidden')
    this.choices = el('div', 'narr-choices hidden')
    this.status = el('p', 'narr-status')

    this.form = el('form', 'narr-form')
    this.input = el('input', 'narr-input')
    this.input.type = 'text'
    this.input.maxLength = 500
    this.input.autocomplete = 'off'
    this.input.placeholder = 'Say, ask, or try something…'
    const send = el('button', 'narr-send', 'Send')
    send.type = 'submit'
    this.form.append(this.input, send)
    this.form.onsubmit = (event) => {
      event.preventDefault()
      const text = this.input.value.trim()
      if (!text) return
      this.input.value = ''
      this.busy('Thinking…')
      this.hooks.ask(text)
    }
    // the game's keys never reach the page while one is typing here
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      this.input.addEventListener(type, (event) => {
        event.stopPropagation()
        if (type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
          this.toggle(false)
          this.input.blur()
        }
      })
    }

    this.retry = el('button', 'narr-retry hidden', 'Regenerate the last turn')
    this.retry.type = 'button'
    this.retry.onclick = () => {
      if (!this.retryTurn) return
      this.busy('Restoring the world before that turn…')
      this.hooks.regenerate(this.retryTurn)
    }

    this.panel.append(head, this.list, this.question, this.choices, this.status, this.retry, this.form)
    document.body.append(this.button, this.panel)
    this.button.onclick = () => this.toggle()
  }

  /** The worker's state after a turn or a load. */
  show(view: NarrativeView): void {
    this.view = view
    this.title.textContent = view.chapter ? `The story — ${view.chapter}` : 'The story'
    this.button.textContent = view.turns ? `Story · ${view.turns}` : 'Story'
    this.button.classList.toggle('narr-waiting', view.status === 'clarification_required' || !!view.notice)
    this.render()
  }

  /** The page is waiting for the worker: say so, and take no second ask. */
  busy(what = 'Thinking…'): void {
    this.status.textContent = what
    this.status.className = 'narr-status narr-busy'
    this.input.disabled = true
  }

  toggle(open = !this.open): void {
    this.open = open
    this.panel.classList.toggle('hidden', !open)
    this.button.classList.toggle('narr-open', open)
    if (open) {
      this.render()
      this.list.scrollTop = this.list.scrollHeight
      this.input.focus()
    }
  }

  private render(): void {
    const view = this.view
    this.input.disabled = false
    if (!view) {
      this.list.replaceChildren(el('p', 'narr-empty', 'No story yet. Begin a game.'))
      return
    }

    const lines = view.lines.map((line) => {
      const row = el('div', `narr-line narr-${line.role}`)
      const who = line.role === 'character' ? line.speakerName ?? line.speakerId ?? 'Someone' : ROLE_LABEL[line.role]
      if (who) row.append(el('span', 'narr-who', who))
      row.append(el('span', 'narr-text', line.text))
      return row
    })
    if (!lines.length) lines.push(el('p', 'narr-empty', 'Say something to begin.'))
    this.list.replaceChildren(...lines)
    this.list.scrollTop = this.list.scrollHeight

    const pending = view.status === 'clarification_required' ? view : undefined
    this.question.classList.toggle('hidden', !pending?.question)
    if (pending?.question) this.question.textContent = pending.question
    this.choices.replaceChildren(
      ...(pending?.choices ?? []).map((choice) => {
        const button = el('button', 'narr-choice', choice.label)
        button.type = 'button'
        button.onclick = () => {
          this.busy(`You chose: ${choice.label}`)
          this.hooks.clarify(choice.index)
        }
        return button
      }),
    )
    this.choices.classList.toggle('hidden', !pending?.choices?.length)

    this.retryTurn = view.committed && view.turnId ? view.turnId : undefined
    this.retry.classList.toggle('hidden', !this.retryTurn)

    const notes: string[] = []
    if (view.notice) notes.push(view.notice)
    if (view.status === 'rejected') notes.push('That was refused — nothing in the world changed.')
    if (view.status === 'failed') notes.push('That did not happen.')
    if (view.errors?.length) notes.push(view.errors.join(' '))
    if (view.committed) notes.push(view.persisted ? 'The world changed and the turn was kept.' : 'The world changed, but the turn could not be saved.')
    if (view.status === 'clarification_required') notes.push('Choose one, or say it another way.')
    this.status.textContent = notes.join(' ')
    this.status.className = `narr-status${view.status === 'failed' || view.status === 'rejected' ? ' narr-bad' : ''}`
  }
}
