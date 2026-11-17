/**
 * NPC character cards and memory.
 *
 * The engine already carries a person's temperament, the regard they hold, and the deeds they
 * witnessed (Entity.npc.person, NpcMemory). This module adapts that data into what a narrator
 * may use, and adds the running record of what was said and done with each person. Memory is
 * per NPC and per world: no NPC reads another's private knowledge through this book.
 */

import type { Id } from '@openworld/engine'

export interface Temperament {
  personality?: string
  manner?: string
  social?: string
  outlook?: string
}

/** A character card, as a narrator needs one. */
export interface NpcCard {
  id: Id
  name: string
  role?: string
  temperament?: Temperament
  /** −100…100 (the engine's regard for the player). */
  regard: number
  /** The map they were last known on. */
  map?: string
}

export type MemoryKind = 'interaction' | 'event' | 'decision' | 'relationship' | 'chapter'

/** One remembered thing. */
export interface MemoryEntry {
  id: number
  npcId: Id
  text: string
  tick: number
  kind: MemoryKind
  /** 0…1: how much it matters when the budget is tight. */
  salience: number
}

export interface NarrativeMemoryState {
  cards: Record<Id, NpcCard>
  entries: MemoryEntry[]
  nextId: number
}

export interface RememberOptions {
  tick: number
  kind?: MemoryKind
  salience?: number
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'it', 'is', 'was', 'you', 'your', 'i', 'me', 'my', 'with', 'for', 'that', 'this'])

/** The words a memory is found by: its own, lowercased, without the noise. */
export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [])].filter((w) => !STOPWORDS.has(w))
}

/** How strongly a memory answers a query: shared words, salience, and recency. */
export function scoreMemory(entry: MemoryEntry, query: string[], tick: number): number {
  const words = new Set(keywords(entry.text))
  const shared = query.filter((w) => words.has(w)).length
  const age = Math.max(0, tick - entry.tick)
  // a memory is half as easy to recall after 2000 ticks
  const recency = 1 / (1 + age / 2000)
  return shared * 2 + entry.salience * 2 + recency
}

/** The memory book of one world: character cards and what each person remembers. */
export class NpcMemoryBook {
  private cards = new Map<Id, NpcCard>()
  private entries: MemoryEntry[] = []
  private nextId = 1
  /** How many entries one person keeps (older, less salient ones go first). */
  perNpc: number

  constructor(perNpc = 40) {
    this.perNpc = perNpc
  }

  /** Add or update a card (the engine's own record wins where it has one). */
  upsertCard(card: NpcCard): NpcCard {
    const was = this.cards.get(card.id)
    const merged: NpcCard = was ? { ...was, ...card } : card
    this.cards.set(card.id, merged)
    return merged
  }

  card(id: Id): NpcCard | undefined {
    return this.cards.get(id)
  }

  all(): NpcCard[] {
    return [...this.cards.values()]
  }

  setRegard(id: Id, regard: number): void {
    const card = this.cards.get(id)
    if (card) card.regard = Math.max(-100, Math.min(100, Math.round(regard)))
  }

  record(npcId: Id, text: string, options: RememberOptions): MemoryEntry | undefined {
    const clean = text.trim()
    if (!clean) return undefined
    // the same thing said twice is one memory, refreshed rather than repeated
    const same = this.entries.find((e) => e.npcId === npcId && e.text === clean)
    if (same) {
      same.tick = options.tick
      same.salience = Math.max(same.salience, options.salience ?? same.salience)
      return same
    }
    const entry: MemoryEntry = {
      id: this.nextId++,
      npcId,
      text: clean,
      tick: options.tick,
      kind: options.kind ?? 'interaction',
      salience: Math.max(0, Math.min(1, options.salience ?? 0.5)),
    }
    this.entries.push(entry)
    this.prune(npcId)
    return entry
  }

  /** Forget the least useful entries of one person, past the cap. */
  private prune(npcId: Id): void {
    const mine = this.entries.filter((e) => e.npcId === npcId)
    if (mine.length <= this.perNpc) return
    const drop = new Set(
      [...mine]
        .sort((a, b) => a.salience - b.salience || a.tick - b.tick)
        .slice(0, mine.length - this.perNpc)
        .map((e) => e.id),
    )
    this.entries = this.entries.filter((e) => !drop.has(e.id))
  }

  /** What this person remembers that bears on a query, best first. */
  recall(npcId: Id, query: string, tick: number, limit = 4): MemoryEntry[] {
    const words = keywords(query)
    return this.entries
      .filter((e) => e.npcId === npcId)
      .map((e) => ({ e, score: scoreMemory(e, words, tick) }))
      .filter(({ score }) => score > 1.05)
      .sort((a, b) => b.score - a.score || b.e.tick - a.e.tick)
      .slice(0, limit)
      .map(({ e }) => e)
  }

  /** Everything one person remembers, newest first (the memory panel's view). */
  entriesOf(npcId: Id): MemoryEntry[] {
    return this.entries.filter((e) => e.npcId === npcId).sort((a, b) => b.tick - a.tick)
  }

  get size(): number {
    return this.entries.length
  }

  toJSON(): NarrativeMemoryState {
    return {
      cards: Object.fromEntries(this.cards),
      entries: this.entries.map((e) => ({ ...e })),
      nextId: this.nextId,
    }
  }

  static from(state: NarrativeMemoryState | undefined, perNpc = 40): NpcMemoryBook {
    const book = new NpcMemoryBook(perNpc)
    if (!state) return book
    for (const [id, card] of Object.entries(state.cards ?? {})) book.cards.set(id, { ...card })
    book.entries = (state.entries ?? []).map((e) => ({ ...e }))
    book.nextId = state.nextId ?? book.entries.length + 1
    return book
  }
}
