/**
 * Narrative persistence: a store behind an interface, so web, Android and tests share one shape.
 *
 * Narrative data is kept apart from the engine's save. A turn is marked pending while it is in
 * flight, so a turn interrupted by a reload is never mistaken for a completed one.
 */

import type { NarrativeHistoryState } from '../history'
import type { NarrativeMemoryState } from '../memory'

export interface SnapshotRecord {
  turnId: string
  tick: number
  chapter: string
  /** Opaque: the host's own pre-turn snapshot. */
  token: unknown
}

export interface PendingTurn {
  id: string
  intent: string
  /** The proposal whose alternatives the player is choosing between. */
  proposal: unknown
  question: string
  candidates: { index: number; label: string }[]
  phase: 'planning' | 'clarifying' | 'executing'
  tick: number
  chapter: string
}

export interface NarrativeSaveState {
  version: 1
  worldId: string
  /** The content version the narrative state belongs to (§9.1). */
  contentVersion?: string
  history: NarrativeHistoryState
  memory: NarrativeMemoryState
  pending?: PendingTurn
  /** The last 10 pre-turn snapshots (§9.2). */
  snapshots: SnapshotRecord[]
  nextTurn: number
}

export interface LoadedNarrative {
  state?: NarrativeSaveState
  /** True when an incompatible content version invalidated the old narrative state. */
  invalidated: boolean
  /** True when a turn was found mid-execution (its outcome is unknown). */
  interrupted?: PendingTurn
}

export interface NarrativeStore {
  load(worldId: string, contentVersion?: string): Promise<LoadedNarrative>
  save(state: NarrativeSaveState): Promise<void>
  clear(worldId: string): Promise<void>
}

/** How many pre-turn snapshots are kept (approved decision §9.2). */
export const SNAPSHOT_LIMIT = 10

/** A store kept in memory: tests, and a host with no persistence yet. */
export class MemoryNarrativeStore implements NarrativeStore {
  private states = new Map<string, NarrativeSaveState>()

  async load(worldId: string, contentVersion?: string): Promise<LoadedNarrative> {
    const state = this.states.get(worldId)
    if (!state) return { invalidated: false }
    if (state.contentVersion !== contentVersion) return { invalidated: true }
    const interrupted = state.pending?.phase === 'executing' ? state.pending : undefined
    return { state: structuredClone(state), invalidated: false, ...(interrupted ? { interrupted } : {}) }
  }

  async save(state: NarrativeSaveState): Promise<void> {
    this.states.set(state.worldId, structuredClone(state))
  }

  async clear(worldId: string): Promise<void> {
    this.states.delete(worldId)
  }
}

/** The minimal key-value surface (the runtime's IndexedDB wrapper, a test's Map). */
export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del?(key: string): Promise<void>
}

/** A store over any key-value surface, one key per world. */
export class KeyValueNarrativeStore implements NarrativeStore {
  constructor(
    private readonly kv: KeyValue,
    private readonly prefix = 'narrative',
  ) {}

  private key(worldId: string): string {
    return `${this.prefix}:${worldId}`
  }

  async load(worldId: string, contentVersion?: string): Promise<LoadedNarrative> {
    const state = await this.kv.get<NarrativeSaveState>(this.key(worldId))
    if (!state) return { invalidated: false }
    if (state.contentVersion !== contentVersion) return { invalidated: true }
    const interrupted = state.pending?.phase === 'executing' ? state.pending : undefined
    return { state, invalidated: false, ...(interrupted ? { interrupted } : {}) }
  }

  async save(state: NarrativeSaveState): Promise<void> {
    await this.kv.set(this.key(state.worldId), state)
  }

  async clear(worldId: string): Promise<void> {
    await this.kv.del?.(this.key(worldId))
  }
}
