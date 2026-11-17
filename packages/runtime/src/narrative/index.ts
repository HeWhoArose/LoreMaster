/**
 * The runtime's side of the narrative core: a projection of the live engine, acts through the
 * engine's own act(), and a pre-turn snapshot through the game's own save.
 *
 * This file imports no DOM and no UI: it runs inside the engine worker.
 */

import { TICKS_PER_HOUR, type Entity, type FxEvent, type Game, type PropValue, type Text } from '@openworld/engine'
import {
  KeyValueNarrativeStore,
  MockNarrativeProvider,
  NarrativeTurnMachine,
  type DigestFx,
  type EngineAction,
  type EngineOutcome,
  type EnginePort,
  type KeyValue,
  type NarrativeWorldView,
  type NpcView,
  type WorldEntityView,
} from '@openworld/narration'

const TALK_VERBS = ['talk', 'greet', 'ask', 'bye'] as const
const NEAR_RADIUS = 8
const PEOPLE_RADIUS = 12

const words = (text: Text | undefined): string => (typeof text === 'string' ? text : text?.en ?? '')

/** Only plain prop values a narrator may repeat. */
function plainProps(e: Entity): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(e.props ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value
  }
  return out
}

function stat(w: Game['engine']['world'], e: Entity, key: string): number {
  return w.num(e, key, 0)
}

/** The live game, as the narrative port sees it. */
export class RuntimeNarrativePort implements EnginePort {
  constructor(
    private readonly current: () => Game | undefined,
    private readonly hooks: { snapshot: () => unknown; restore: (token: unknown) => void },
  ) {}

  private game(): Game {
    const game = this.current()
    if (!game) throw new Error('there is no game to narrate')
    return game
  }

  view(): NarrativeWorldView {
    const game = this.game()
    const w = game.engine.world
    const player = w.player
    const at = w.posOf(player)
    if (!at) {
      return {
        playerId: player.id, playerName: words(player.name) || 'the traveller',
        mapId: '', mapName: 'nowhere', x: 0, y: 0, hour: 0, day: 1, tick: w.state.tick, revision: w.state.tick,
        stats: {}, statuses: [], nearby: [], npcs: [], recent: [], facts: {}, chapter: 'nowhere',
      }
    }
    const map = w.map(at.map)
    const mapName = words(map?.name) || at.map

    const seen = new Map<string, Entity>()
    for (let dy = -NEAR_RADIUS; dy <= NEAR_RADIUS; dy++) {
      for (let dx = -NEAR_RADIUS; dx <= NEAR_RADIUS; dx++) {
        for (const e of w.entitiesAt(at.map, at.x + dx, at.y + dy)) {
          if (e.id !== player.id && !seen.has(e.id)) seen.set(e.id, e)
        }
      }
    }

    const at_tile = (e: Entity) => {
      const pos = w.posOf(e)
      return pos && pos.map === at.map ? w.distance(at, e) : undefined
    }

    const nearby: WorldEntityView[] = []
    const npcs: NpcView[] = []
    for (const e of seen.values()) {
      if (e.npc) {
        const memory = e.npc.memory
        const distance = at_tile(e)
        if (distance === undefined || distance > PEOPLE_RADIUS) continue
        npcs.push({
          id: e.id,
          name: words(e.name) || e.id,
          type: e.type,
          distance,
          role: e.npc.role,
          ...(e.npc.person?.temperament ? { temperament: e.npc.person.temperament } : {}),
          ...(memory?.regard?.[player.id] !== undefined ? { regard: memory.regard[player.id] } : {}),
          ...(memory?.deeds?.length
            ? { deeds: memory.deeds.slice(-3).map((deed) => `${deed.deed}${deed.what ? `: ${words(deed.what)}` : ''}`) }
            : {}),
          talk: TALK_VERBS,
        })
        continue
      }
      const distance = at_tile(e)
      nearby.push({
        id: e.id,
        name: words(e.name) || e.id,
        type: e.type,
        ...(distance !== undefined ? { distance } : {}),
        ...(e.tags?.length ? { tags: [...e.tags] } : {}),
        props: plainProps(e),
      })
    }
    nearby.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
    npcs.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))

    const hour = w.hour()
    const day = Math.floor(w.state.tick / (TICKS_PER_HOUR * 24)) + 1

    return {
      playerId: player.id,
      playerName: words(player.name) || 'the traveller',
      mapId: at.map,
      mapName,
      x: at.x,
      y: at.y,
      hour,
      day,
      tick: w.state.tick,
      revision: w.state.tick,
      hp: stat(w, player, 'hp'),
      maxHp: stat(w, player, 'maxHp'),
      stats: { atk: stat(w, player, 'atk'), def: stat(w, player, 'def') },
      statuses: Object.keys(player.statuses ?? {}),
      nearby: nearby.slice(0, 24),
      npcs: npcs.slice(0, 6),
      recent: w.recent.map((line) => words(line)),
      facts: {},
      chapter: mapName,
    }
  }

  act(action: EngineAction): EngineOutcome {
    const game = this.game()
    const engine = game.engine
    const w = engine.world
    const before = this.health(action.target.e)
    const fxStart = w.fx.length
    const resolution = engine.act(action.verb, action.actorId, action.target, {
      instrument: action.instrument ?? null,
      params: action.params as Record<string, PropValue>,
    })
    const fx = w.fx.slice(fxStart).map(toDigestFx)
    const after = this.health(action.target.e)
    return { resolution, fx, before, after, revision: w.state.tick }
  }

  snapshot(): unknown {
    return this.hooks.snapshot()
  }

  restore(token: unknown): void {
    this.hooks.restore(token)
  }

  visible(id: string): boolean {
    const w = this.game().engine.world
    const entity = w.get(id)
    if (!entity) return false
    const player = w.player
    if (id === player.id) return true
    const here = w.posOf(player)
    const there = w.posOf(entity)
    if (here && there && here.map === there.map) return true
    // what the player carries or holds is in the turn's view
    if (entity.place.on === 'inside' || entity.place.on === 'hand') {
      const holder = w.get(entity.place.holder)
      return !!holder && (holder.id === player.id || this.visible(holder.id))
    }
    return false
  }

  talkVerbs(id: string): readonly string[] {
    const e = this.game().engine.world.get(id)
    return e?.npc ? TALK_VERBS : []
  }

  private health(also: string): Record<string, { hp?: number; maxHp?: number }> {
    const w = this.game().engine.world
    const ids = new Set<string>([w.player.id, also])
    for (const person of w.people()) if (person.npc) ids.add(person.id)
    const out: Record<string, { hp?: number; maxHp?: number }> = {}
    for (const id of ids) {
      const e = w.get(id)
      if (!e) continue
      out[id] = { hp: stat(w, e, 'hp'), maxHp: stat(w, e, 'maxHp') }
    }
    return out
  }
}

function toDigestFx(fx: FxEvent): DigestFx {
  if (fx.t === 'say') return { op: 'say', to: fx.who, params: { text: words(fx.text), ...(fx.mood ? { mood: fx.mood } : {}) } }
  if (fx.t === 'emote') return { op: 'emote', to: fx.who, params: { mood: fx.mood } }
  if (fx.t === 'log') return { op: 'log', params: { text: words(fx.text) } }
  return { op: fx.t }
}

export interface NarrativeRuntimeOptions {
  game: () => Game | undefined
  worldId: string
  contentVersion?: string
  kv: KeyValue
  snapshot: () => unknown
  restore: (token: unknown) => void
}

/** The turn machine wired to this worker's game. */
export function createNarrativeRuntime(options: NarrativeRuntimeOptions): {
  machine: NarrativeTurnMachine
  port: RuntimeNarrativePort
} {
  const port = new RuntimeNarrativePort(options.game, { snapshot: options.snapshot, restore: options.restore })
  const store = new KeyValueNarrativeStore(options.kv, 'narrative')
  const machine = new NarrativeTurnMachine({
    port,
    provider: new MockNarrativeProvider(),
    store,
    worldId: options.worldId,
    ...(options.contentVersion ? { contentVersion: options.contentVersion } : {}),
  })
  return { machine, port }
}
