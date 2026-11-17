/**
 * Contract layer for the AI-driven RPG.
 *
 * Pure functions and data: no model calls, no engine mutation. Three contracts sit between
 * a model and the world (Revision 2 corrections C-01…C-03):
 *
 *  - ActionProposal  what someone tries to do — validated, then mapped to one engine act.
 *  - NarrativeOutput speaker-tagged prose — structurally validated, never authoritative.
 *  - RulePatch       a proposed rule answer — separate from ordinary play, permissioned.
 *
 * Nothing here mutates WorldState. The engine alone decides what happened.
 */

import type { Id, Mood, Resolution, Verb } from '@openworld/engine'

/** The seven verbs the engine accepts (engine/types.ts:1762). */
export const VERBS = ['use', 'put', 'take', 'hands', 'move', 'craft', 'learn'] as const
const VERB_SET: ReadonlySet<string> = new Set(VERBS)

/**
 * Proposal params — a closed record. Every key is taken from a verified `act()` call site
 * (engine/controls.ts). Nothing outside this set survives validation.
 */
export type ProposalParams = {
  say?: string | null
  quest?: Id
  topic?: string
  choice?: string
  item?: Id
  into?: 'contents'
  dir?: 'up' | 'down' | 'left' | 'right'
  skill?: Id
  profession?: Id
  recipe?: Id
  at?: Id
}

/** A strict, model-emitted object describing what someone tries to do. */
export type ActionProposal =
  | {
      kind: 'action'
      actorId: Id
      verb: Verb
      target: { e: Id }
      instrument?: { e: Id } | null
      params: ProposalParams
      intentText: string
      confidence: number
    }
  | { kind: 'no-action'; reason: 'talk' | 'question' | 'emote' | 'nothing' }
  | { kind: 'ambiguous'; candidates: ActionProposal[]; question: string }

/** Ok, or rejected with human-readable reasons. */
export type Verdict = { ok: true } | { ok: false; errors: string[] }

const ok: Verdict = { ok: true }
const bad = (...errors: string[]): Verdict => ({ ok: false, errors })

/** A speaker-tagged block of prose. */
export type NarrativeBlock =
  | { speaker: { kind: 'narrator' }; text: string }
  | { speaker: { kind: 'character'; entityId: Id }; text: string; mood?: Mood }

export const MOODS: readonly Mood[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'shy']

/** Speaker-tagged prose, structurally validated, never authoritative. */
export type NarrativeOutput = {
  turnId: string
  blocks: NarrativeBlock[]
  meta: { model: string; purpose: 'narration'; keptTokens?: number }
}

/** Validation context for an ActionProposal: who acts, over what, with which verbs. */
export interface ActionProposalCtx {
  /** The actor the turn belongs to. A proposal for anyone else is rejected outright. */
  seat: Id
  /** Referent check against the turn's projection. */
  visible: (id: Id) => boolean
  /** The engine's seven (or the subset this world offers). */
  verbs: readonly Verb[]
  /** The talk verbs available with someone (engine/npc lines). */
  talkVerbs: (who: Id) => readonly string[]
}

/** Validation context for a NarrativeOutput. */
export interface NarrativeOutputCtx {
  /** Speakers allowed this turn: those on the map, or met in it. */
  cast: (id: Id) => boolean
  /** The player may not be made to speak by the narrator. */
  player: Id
  limits: { blocks: number; chars: number }
}

/** A rule answer a model may propose (never applied without permission). */
export interface RulePatch {
  id: string
  /** Why the answer is proposed, in the proposer's words. */
  note: string
  /** The host type the answer is for. */
  hostType: string
  /** The event kind, e.g. `act/take`. */
  on: string
  /** The hole's key (rules.ts holeKey) when the answer fills a hole. */
  hole?: string
  /** The leaf's effects, in the engine's effect language. */
  effects: RuleEffect[]
  confidence: number
}

/** One effect of a proposed rule answer. */
export interface RuleEffect {
  op: string
  text?: string
  to?: string
  amount?: number
  prop?: string
  value?: string | number | boolean
  status?: string
  ticks?: number
  item?: string
  [key: string]: unknown
}

/** Ops a proposed rule may use. Anything else is rejected before it reaches the engine. */
export const RULE_EFFECT_OPS: ReadonlySet<string> = new Set([
  'log', 'say', 'vfx', 'emote', 'damage', 'heal', 'setProp', 'addStatus', 'removeStatus',
  'spawn', 'remove', 'teleport', 'give', 'setFact', 'delta', 'move', 'none',
])

export interface RulePatchCtx {
  /** Types the world may grow an answer for. */
  hostTypes: (type: string) => boolean
  /** Event kinds the world knows. */
  kinds: (kind: string) => boolean
  /** Whether the proposer may change rules at all this turn. */
  allowed: boolean
}

// ------------------------------------------------------------------ ActionProposal

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const STRING_PARAMS = [
  'say', 'quest', 'topic', 'choice', 'item', 'into', 'dir', 'skill', 'profession', 'recipe', 'at',
] as const

/**
 * Validate an ActionProposal against the four layers (R2-02 §4.3):
 * schema, authority (the seat), reference (what the turn can see), permission (verbs and talk).
 */
export function validateActionProposal(p: unknown, ctx: ActionProposalCtx, depth = 0): Verdict {
  if (!isRecord(p)) return bad('expected an ActionProposal object')
  const kind = p.kind
  if (typeof kind !== 'string') return bad('missing or invalid kind')

  if (kind === 'action') {
    if (typeof p.actorId !== 'string' || p.actorId === '') return bad('actorId must be a non-empty string')
    // authority: a proposal may only act for the seat that owns this turn
    if (p.actorId !== ctx.seat) return bad(`actorId ${p.actorId} is not the seat of this turn`)

    if (typeof p.verb !== 'string' || !VERB_SET.has(p.verb)) {
      return bad(`verb must be one of: ${VERBS.join(', ')}`)
    }
    if (!ctx.verbs.includes(p.verb as Verb)) return bad(`verb ${p.verb} is not offered in this world`)

    if (!isRecord(p.target) || typeof p.target.e !== 'string' || p.target.e === '') {
      return bad('target must be { e: Id }')
    }
    if (!ctx.visible(p.target.e)) return bad(`target ${p.target.e} is not in the turn's view`)

    if (p.instrument !== undefined && p.instrument !== null) {
      if (!isRecord(p.instrument) || typeof p.instrument.e !== 'string' || p.instrument.e === '') {
        return bad('instrument must be { e: Id } or null')
      }
      if (!ctx.visible(p.instrument.e)) return bad(`instrument ${p.instrument.e} is not in the turn's view`)
    }

    if (!isRecord(p.params)) return bad('params must be an object')
    for (const key of Object.keys(p.params)) {
      if (!(STRING_PARAMS as readonly string[]).includes(key)) return bad(`params.${key} is not an accepted parameter`)
    }
    for (const key of STRING_PARAMS) {
      const value = p.params[key]
      if (value !== undefined && value !== null && typeof value !== 'string') return bad(`params.${key} must be a string`)
    }
    if (p.params.into !== undefined && p.params.into !== null && p.params.into !== 'contents') {
      return bad("params.into may only be 'contents'")
    }
    if (p.params.dir !== undefined && p.params.dir !== null && !['up', 'down', 'left', 'right'].includes(String(p.params.dir))) {
      return bad("params.dir must be 'up'|'down'|'left'|'right'")
    }
    if (typeof p.params.say === 'string' && p.params.say !== '') {
      const offered = ctx.talkVerbs(p.target.e)
      if (!offered.includes(p.params.say) && !offered.includes('*')) {
        return bad(`say '${p.params.say}' is not something one may say to ${p.target.e}`)
      }
    }

    if (typeof p.intentText !== 'string' || p.intentText.trim() === '') return bad('intentText must be a non-empty string')
    if (p.intentText.length > 500) return bad('intentText is too long')
    if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
      return bad('confidence must be between 0 and 1')
    }
    return ok
  }

  if (kind === 'no-action') {
    if (typeof p.reason !== 'string' || !['talk', 'question', 'emote', 'nothing'].includes(p.reason)) {
      return bad("reason must be 'talk'|'question'|'emote'|'nothing'")
    }
    return ok
  }

  if (kind === 'ambiguous') {
    if (depth > 2) return bad('alternatives nested too deeply')
    if (!Array.isArray(p.candidates) || p.candidates.length === 0) return bad('candidates must be a non-empty array')
    if (p.candidates.length > 6) return bad('candidates must be at most 6')
    for (const candidate of p.candidates) {
      // an alternative inside an alternative is not accepted: only plain actions are
      if (!isRecord(candidate) || candidate.kind !== 'action') return bad('every candidate must be a plain action')
      const verdict = validateActionProposal(candidate, ctx, depth + 1)
      if (!verdict.ok) return bad(...verdict.errors, 'an alternative failed validation')
    }
    const targets = new Set(p.candidates.map((c) => JSON.stringify((c as { target?: unknown }).target)))
    if (targets.size !== p.candidates.length) return bad('candidates must differ')
    if (typeof p.question !== 'string' || p.question.trim() === '') return bad('question must be a non-empty string')
    if (p.question.length > 300) return bad('question is too long')
    return ok
  }

  return bad(`unknown ActionProposal kind '${kind}'`)
}

// ------------------------------------------------------------------ NarrativeOutput

/** Validate a NarrativeOutput against structure and the turn's cast (R2-02 §5.2–5.3). */
export function validateNarrativeOutput(o: unknown, ctx: NarrativeOutputCtx): Verdict {
  if (!isRecord(o)) return bad('expected a NarrativeOutput object')
  if (typeof o.turnId !== 'string' || o.turnId === '') return bad('turnId must be a non-empty string')
  const blocks = o.blocks
  if (!Array.isArray(blocks)) return bad('blocks must be an array')
  if (blocks.length < 1 || blocks.length > ctx.limits.blocks) {
    return bad(`blocks must be between 1 and ${ctx.limits.blocks}`)
  }

  let chars = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (!isRecord(block)) return bad(`block ${i}: expected an object`)
    if (!isRecord(block.speaker) || typeof block.speaker.kind !== 'string') return bad(`block ${i}: missing speaker`)
    if (typeof block.text !== 'string' || block.text.trim() === '') return bad(`block ${i}: text must be non-empty`)
    chars += block.text.length

    const speaker = block.speaker
    if (speaker.kind === 'narrator') continue
    if (speaker.kind !== 'character') return bad(`block ${i}: unknown speaker kind '${String(speaker.kind)}'`)
    if (typeof speaker.entityId !== 'string' || speaker.entityId === '') return bad(`block ${i}: entityId must be non-empty`)
    if (speaker.entityId === ctx.player) return bad(`block ${i}: the narrator may not speak for the player`)
    if (!ctx.cast(speaker.entityId)) return bad(`block ${i}: ${speaker.entityId} is not in this turn's cast`)
    if ('mood' in block && block.mood !== undefined) {
      if (typeof block.mood !== 'string' || !MOODS.includes(block.mood as Mood)) return bad(`block ${i}: unknown mood`)
    }
  }
  if (chars > ctx.limits.chars) return bad(`text is too long (${chars} > ${ctx.limits.chars} characters)`)

  if (!isRecord(o.meta)) return bad('meta must be an object')
  if (typeof o.meta.model !== 'string' || o.meta.model === '') return bad('meta.model must be a non-empty string')
  if (o.meta.purpose !== 'narration') return bad('meta.purpose must be "narration"')
  if (o.meta.keptTokens !== undefined && (typeof o.meta.keptTokens !== 'number' || o.meta.keptTokens < 0)) {
    return bad('meta.keptTokens must be a non-negative number')
  }
  return ok
}

// ------------------------------------------------------------------ RulePatch

/** Validate a proposed rule answer. Never applies it: permission and the engine's own checks do. */
export function validateRulePatch(p: unknown, ctx: RulePatchCtx): Verdict {
  if (!ctx.allowed) return bad('rule changes are not allowed this turn')
  if (!isRecord(p)) return bad('expected a RulePatch object')
  if (typeof p.id !== 'string' || p.id.trim() === '') return bad('id must be a non-empty string')
  if (typeof p.note !== 'string' || p.note.trim() === '') return bad('note must be a non-empty string')
  if (p.note.length > 400) return bad('note is too long')
  if (typeof p.hostType !== 'string' || !ctx.hostTypes(p.hostType)) return bad(`unknown host type '${String(p.hostType)}'`)
  if (typeof p.on !== 'string' || !ctx.kinds(p.on)) return bad(`unknown event kind '${String(p.on)}'`)
  if (p.hole !== undefined && (typeof p.hole !== 'string' || p.hole === '')) return bad('hole must be a non-empty string')
  if (!Array.isArray(p.effects) || p.effects.length === 0) return bad('effects must be a non-empty array')
  if (p.effects.length > 12) return bad('effects must be at most 12')
  for (let i = 0; i < p.effects.length; i++) {
    const effect = p.effects[i]
    if (!isRecord(effect) || typeof effect.op !== 'string' || !RULE_EFFECT_OPS.has(effect.op)) {
      return bad(`effect ${i}: unknown op`)
    }
    if (effect.text !== undefined && typeof effect.text !== 'string') return bad(`effect ${i}: text must be a string`)
  }
  if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
    return bad('confidence must be between 0 and 1')
  }
  return ok
}

// ------------------------------------------------------------------ OutcomeDigest

/** One narratable fact the engine produced. */
export interface DigestFact {
  kind: 'say' | 'remark' | 'log' | 'emote' | 'vfx'
  who?: Id
  text?: string
  mood?: string
}

/** One change the engine made, in words the narrator may repeat. */
export interface DigestChange {
  entityId: Id
  summary: string
}

/** What a narrator may describe: only what the engine did (R2-03 §2.2). */
export interface OutcomeDigest {
  turnId: string
  worldRevision: number
  proposal?: {
    verb: Verb
    target: Id
    params: object
    accepted: boolean
    rejection?: string
  }
  resolution: {
    defined: boolean
    filledHole: boolean
    ruleId?: string
    fault?: string
  }
  facts: DigestFact[]
  changes: DigestChange[]
  mutated: boolean
}

/** An effect as the engine's fx queue (or a normalised adapter) gives it. */
export interface DigestFx {
  op: string
  to?: string
  params?: Record<string, unknown>
}

const FACT_KINDS: Record<string, DigestFact['kind']> = {
  say: 'say',
  remark: 'remark',
  log: 'log',
  emote: 'emote',
  vfx: 'vfx',
}

/** Build an OutcomeDigest from a Resolution, the fx it produced, and before/after reads. */
export function buildDigest(
  turnId: string,
  worldRevision: number,
  resolution: Resolution,
  fx: readonly DigestFx[],
  before: Readonly<Record<Id, { hp?: number; maxHp?: number }>>,
  after: Readonly<Record<Id, { hp?: number; maxHp?: number }>>,
  proposal?: OutcomeDigest['proposal'],
): OutcomeDigest {
  const facts: DigestFact[] = []
  const changes: DigestChange[] = []

  for (const effect of fx) {
    const kind = FACT_KINDS[effect.op]
    if (!kind) continue
    const text = typeof effect.params?.text === 'string' ? effect.params.text : undefined
    const mood = typeof effect.params?.mood === 'string' ? effect.params.mood : undefined
    facts.push({
      kind,
      ...(typeof effect.to === 'string' && effect.to !== '' ? { who: effect.to } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(mood !== undefined ? { mood } : {}),
    })
  }

  for (const entityId of Object.keys(after)) {
    const was = before[entityId]
    const now = after[entityId]
    if (!now) continue
    const hpBefore = was?.hp ?? 0
    const hpAfter = now.hp ?? 0
    if (hpBefore !== hpAfter) {
      changes.push({
        entityId,
        summary: hpAfter > hpBefore
          ? `healed ${hpAfter - hpBefore} (${hpAfter} of ${now.maxHp ?? '?'})`
          : `took ${hpBefore - hpAfter} harm (${hpAfter} of ${now.maxHp ?? '?'})`,
      })
    }
  }

  return {
    turnId,
    worldRevision,
    ...(proposal ? { proposal } : {}),
    resolution: {
      defined: resolution.defined,
      filledHole: resolution.hole !== undefined,
      ...(resolution.rule?.id ? { ruleId: resolution.rule.id } : {}),
      ...(resolution.fault ? { fault: resolution.fault.reason ?? resolution.fault.rule } : {}),
    },
    facts,
    changes,
    // a defined outcome changes the world; a hole left open does not
    mutated: resolution.defined && resolution.hole === undefined,
  }
}
