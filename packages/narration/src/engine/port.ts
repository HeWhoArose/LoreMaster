/**
 * The boundary the narrative layer may cross, and nothing else.
 *
 * The OpenWorld engine stays authoritative: this port can read a projection of the world, ask
 * it to perform one validated act, and take or restore a pre-turn snapshot. There is no method
 * here that writes state directly, so no model output can bypass Engine.act().
 */

import type { Id, Resolution, Verb } from '@openworld/engine'
import type { DigestFx } from '../contracts'

/** One thing the turn can see, as words and ids (never a live engine entity). */
export interface WorldEntityView {
  id: Id
  name: string
  type: string
  /** Tiles from the player, when it has a place. */
  distance?: number
  tags?: string[]
  props?: Record<string, string | number | boolean>
}

/** What an NPC remembers, as the turn is shown it. */
export interface RecalledMemory {
  text: string
  tick: number
  salience?: number
}

/** One person in the turn's view: the character card the narrator may use. */
export interface NpcView extends WorldEntityView {
  role?: string
  temperament?: { personality?: string; manner?: string; social?: string; outlook?: string }
  /** How they regard the player, −100…100. */
  regard?: number
  /** What they know that bears on this turn. */
  recalled?: RecalledMemory[]
  /** What they were seen doing (the engine's own deeds), in words. */
  deeds?: string[]
  /** Talk verbs offered with them. */
  talk?: readonly string[]
}

/** The world as one turn sees it: a projection, built from the engine, never the engine itself. */
export interface NarrativeWorldView {
  playerId: Id
  playerName: string
  mapId: string
  mapName: string
  /** Where the player is, for closeness of what is around. */
  x: number
  y: number
  hour: number
  day: number
  tick: number
  /** A number that changes when the world does (the digest's worldRevision). */
  revision: number
  hp?: number
  maxHp?: number
  stats: Record<string, number>
  statuses: string[]
  nearby: WorldEntityView[]
  npcs: NpcView[]
  /** The engine's last words logged or said, newest last. */
  recent: string[]
  facts: Record<string, string | number | boolean>
  /** The chapter the turn belongs to (a map's name, or the story's). */
  chapter: string
}

/** One validated act, exactly as Engine.act() takes it. */
export interface EngineAction {
  verb: Verb
  actorId: Id
  target: { e: Id }
  instrument?: { e: Id } | null
  params: Record<string, unknown>
}

/** What the engine did: its resolution, its fx, and the health it changed. */
export interface EngineOutcome {
  resolution: Resolution
  fx: DigestFx[]
  before: Record<Id, { hp?: number; maxHp?: number }>
  after: Record<Id, { hp?: number; maxHp?: number }>
  revision: number
}

/** The only way the narrative layer touches the game. */
export interface EnginePort {
  /** The current projection. */
  view(): NarrativeWorldView
  /** Perform one validated act. Never called with an unvalidated proposal. */
  act(action: EngineAction): EngineOutcome
  /** A pre-turn snapshot (opaque to this package). */
  snapshot(): unknown
  /** Restore a snapshot taken before a mutating turn (regeneration, recovery). */
  restore(snapshot: unknown): void
  /** Is this id in the turn's projection? (the referent layer of validation) */
  visible(id: Id): boolean
  /** What one may say to this person. */
  talkVerbs(id: Id): readonly string[]
}
