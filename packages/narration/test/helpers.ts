/** A small, honest engine stand-in: it only does what the port allows. */

import type { Resolution } from '@openworld/engine'
import type { DigestFx } from '../src/contracts'
import type { EngineAction, EngineOutcome, EnginePort, NarrativeWorldView, NpcView, WorldEntityView } from '../src/engine/port'
import type { LoadedNarrative, NarrativeSaveState, NarrativeStore } from '../src/persistence'

export interface FakeSnapshot {
  tick: number
  revision: number
  player: { hp: number; maxHp: number }
  npcs: FakeNpc[]
  nearby: WorldEntityView[]
}

export interface FakeNpc extends NpcView {
  hp: number
  maxHp: number
}

export class FakeEngine implements EnginePort {
  tick = 100
  revision = 0
  acts: EngineAction[] = []
  restored = 0
  /** The next act is undefined (the world has no answer). */
  undefineNext = false
  private player = { hp: 10, maxHp: 12 }
  private npcs: FakeNpc[] = [
    {
      id: 'n1', name: 'Mira', type: 'person/herbalist', role: 'herbalist', distance: 1,
      temperament: { personality: 'patient', manner: 'speaks slowly and precisely', social: 'warm', outlook: 'hopeful' },
      regard: 20, talk: ['talk', 'greet', 'ask'], hp: 8, maxHp: 8, deeds: [],
    },
    {
      id: 'n2', name: 'Bran', type: 'person/guard', role: 'guard', distance: 2,
      temperament: { personality: 'blunt', manner: 'barks', social: 'wary', outlook: 'grim' },
      regard: -15, talk: ['talk', 'greet'], hp: 14, maxHp: 14, deeds: ['stood watch'],
    },
  ]
  private nearby: WorldEntityView[] = [
    { id: 'i1', name: 'apple', type: 'item/food', distance: 1 },
    { id: 'i2', name: 'stone', type: 'item/stone', distance: 2 },
    { id: 'i3', name: 'sword', type: 'item/weapon', distance: 2 },
  ]

  view(): NarrativeWorldView {
    return {
      playerId: 'p1', playerName: 'Ari', mapId: 'map/town', mapName: 'Millbrook',
      x: 5, y: 5, hour: 9, day: 2, tick: this.tick, revision: this.revision,
      hp: this.player.hp, maxHp: this.player.maxHp, stats: { atk: 3, def: 1 }, statuses: [],
      nearby: this.nearby.map((e) => ({ ...e })),
      npcs: this.npcs.map((n) => ({ ...n, recalled: [] })),
      recent: ['The mill wheel turns.'], facts: { 'chapter.one': true }, chapter: 'Millbrook',
    }
  }

  act(action: EngineAction): EngineOutcome {
    this.acts.push(action)
    this.revision++
    const before = this.health()
    const fx: DigestFx[] = []
    if (action.verb === 'take') {
      this.nearby = this.nearby.filter((e) => e.id !== action.target.e)
      fx.push({ op: 'say', to: 'n1', params: { text: 'Mind the seeds.' } })
    }
    if (action.verb === 'hands' && action.params.say) {
      const who = this.npcs.find((n) => n.id === action.target.e)
      if (who) fx.push({ op: 'say', to: who.id, params: { text: 'Well met, Ari.' } })
    }
    if (action.verb === 'use' && action.target.e === 'n1') {
      this.npcs = this.npcs.map((n) => (n.id === 'n1' ? { ...n, hp: Math.max(0, n.hp - 2) } : n))
    }
    const after = this.health()
    const defined = !this.undefineNext
    this.undefineNext = false
    const resolution = (defined
      ? { defined: true, rule: { id: `rule/${action.verb}` } }
      : { defined: false, hole: { rule: { id: `hole/${action.verb}` }, path: [], default: [] } }) as unknown as Resolution
    return { resolution, fx, before, after, revision: this.revision }
  }

  snapshot(): FakeSnapshot {
    return {
      tick: this.tick, revision: this.revision,
      player: { ...this.player },
      npcs: this.npcs.map((n) => ({ ...n })),
      nearby: this.nearby.map((e) => ({ ...e })),
    }
  }

  restore(token: unknown): void {
    const state = token as FakeSnapshot
    this.tick = state.tick
    this.revision = state.revision
    this.player = { ...state.player }
    this.npcs = state.npcs.map((n) => ({ ...n }))
    this.nearby = state.nearby.map((e) => ({ ...e }))
    this.restored++
  }

  visible(id: string): boolean {
    return id === 'p1' || this.npcs.some((n) => n.id === id) || this.nearby.some((e) => e.id === id)
  }

  talkVerbs(id: string): readonly string[] {
    return this.npcs.find((n) => n.id === id)?.talk ?? []
  }

  /** Test control: leave town with a thing. */
  removeNearby(id: string): void {
    this.nearby = this.nearby.filter((e) => e.id !== id)
  }

  private health(): Record<string, { hp?: number; maxHp?: number }> {
    return {
      p1: { ...this.player },
      ...Object.fromEntries(this.npcs.map((n) => [n.id, { hp: n.hp, maxHp: n.maxHp }])),
    }
  }
}

/** A store whose saves can be made to fail on a chosen call (1-based). */
export class ScriptedStore implements NarrativeStore {
  inner = new Map<string, NarrativeSaveState>()
  saves = 0
  failOn: number | undefined
  failAll = false

  async load(worldId: string, contentVersion?: string): Promise<LoadedNarrative> {
    const state = this.inner.get(worldId)
    if (!state) return { invalidated: false }
    if (state.contentVersion !== contentVersion) return { invalidated: true }
    const interrupted = state.pending?.phase === 'executing' ? state.pending : undefined
    return { state: structuredClone(state), invalidated: false, ...(interrupted ? { interrupted } : {}) }
  }

  async save(state: NarrativeSaveState): Promise<void> {
    this.saves++
    if (this.failAll || this.saves === this.failOn) throw new Error('the store is full')
    this.inner.set(state.worldId, structuredClone(state))
  }

  async clear(worldId: string): Promise<void> {
    this.inner.delete(worldId)
  }
}
