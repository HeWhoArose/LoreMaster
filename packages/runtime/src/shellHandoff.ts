// The application shell's handoff to the game (docs/phase1-design-specification.md §7): the shell page cannot reach
// into the runtime's own Cover instance, so it leaves a small record of what the game's title should do — continue a
// slot, or begin a new game with the look the shell recommended — and the game page takes it once as it boots. The
// record is read once and removed: an ordinary visit to the game page opens its title as it always has.

import type { Difficulty, Look } from '@openworld/engine'
import type { Slot } from './saves.ts'

export interface ShellHandoff {
  /** resume: the slot's save is loaded; new: the title opens its new-game panel. */
  kind: 'resume' | 'new'
  slot?: Slot
  /** The look the existing creator opens with (the shell's recommendation, edited there). */
  look?: Look
  difficulty?: Difficulty
  start?: string
}

const KEY = 'loremaster:handoff'

export function setShellHandoff(handoff: ShellHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff))
  } catch {
    /* no session storage: the game opens its own title */
  }
}

/** The handoff left for this page, taken (removed) as it is read: undefined when there is none. */
export function takeShellHandoff(): ShellHandoff | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    sessionStorage.removeItem(KEY)
    const h = JSON.parse(raw) as ShellHandoff
    if (!h || (h.kind !== 'resume' && h.kind !== 'new')) return undefined
    return h
  } catch {
    return undefined
  }
}
