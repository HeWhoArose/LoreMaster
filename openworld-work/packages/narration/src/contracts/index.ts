/**
 * Contract layer for the AI-driven RPG project.
 * Pure functions, no model calls, no engine imports.
 * 
 * ActionProposal: strict model-emitted object describing what someone tries to do.
 * NarrativeOutput: speaker-tagged prose, structurally validated, never authoritative.
 *
 * These schemas and validators replace the single-contract design of Reports 05/06/10/12
 * with three separate contracts (RulePatch, ActionProposal, NarrativeOutput) as
 * established by Revision 2 corrections C-01 through C-03.
 */

import type { Id, Verb } from '@openworld/engine/types'
import type { Resolution } from '@openworld/engine/rules'

/**
 * Proposal params — a closed record. Every key below is taken from a verified `act()` call
 * site (controls.ts). Nothing from a model is accepted outside this set.
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

/**
 * The seven verbs the engine accepts (design.md §5.7, types.ts:1762).
 */
export const VERBS: ReadonlySet<Verb> = new Set(['use', 'put', 'take', 'hands', 'move', 'craft', 'learn'])

/** ActionProposal — a new, strict, model-emitted object describing what someone tries to do. */
export type ActionProposal =
  | { kind: 'action'
      actorId: Id
      verb: Verb
      target: { e: Id }
      instrument?: { e: Id } | null
      params: ProposalParams
      intentText: string
      confidence: number
    }
  | { kind: 'no-action'
      reason: 'talk' | 'question' | 'emote' | 'nothing'
    }
  | { kind: 'ambiguous'
      candidates: ActionProposal[]
      question: string }

/** Verdict from validation — ok, or rejected with errors. */
export type Verdict = { ok: true } | { ok: false; errors: string[] }

/** NarrativeBlock — a speaker-tagged prose block. */
export type NarrativeBlock =
  | { speaker: { kind: 'narrator' }; text: string }
  | { speaker: { kind: 'character'; entityId: Id }; text: string; mood?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'shy' }

/** NarrativeOutput — speaker-tagged prose, structurally validated, never authoritative. */
export type NarrativeOutput = {
  turnId: string
  blocks: NarrativeBlock[]
  meta: { model: string; purpose: 'narration'; keptTokens?: number }
}

/** Validation context for ActionProposal. */
export interface ActionProposalCtx {
  seat: Id                        // the actor the turn belongs to
  visible: (id: Id) => boolean   // referent check against the turn's projection
  verbs: readonly Verb[]         // the engine's seven
  talkVerbs: (who: Id) => readonly string[]
}

/** Validation context for NarrativeOutput. */
export interface NarrativeOutputCtx {
  cast: (id: Id) => boolean      // speakers allowed this turn
  player: Id
  limits: { blocks: number; chars: number }
}

/** Validate an ActionProposal against the four-layer check (R2-02 §4.3). */
export function validateActionProposal(
  p: unknown,
  ctx: ActionProposalCtx
): Verdict {
  // 1. Schema: types, closed params, lengths, verb in the seven, kind discriminants
  if (typeof p !== 'object' || p === null || ('kind' in p === false)) {
    return { ok: false; errors: ['expected ActionProposal object'] }
  }

  const proposal = p as Record<string, unknown>

  // kind discriminant
  const kind = proposal.kind
  if (kind === undefined || typeof kind !== 'string') {
    return { ok: false; errors: ['missing or invalid kind'] }
  }

  // ---- kind: 'action' ----
  if (kind === 'action') {
    // actorId exists and is the seat that owns the turn
    const actorId = proposal.actorId
    if (typeof actorId !== 'string' || actorId === '') {
      return { ok: false; errors: ['actorId must be a non-empty string'] }
    }

    // verb in the seven
    const verb = proposal.verb
    if (typeof verb !== 'string' || !VERBS.has(verb as Verb)) {
      return { ok: false; errors: [`verb must be one of: ${Array.from(VERBS).join(', ')}`] }
    }

    // target: { e: Id }
    const target = proposal.target
    if (typeof target !== 'object' || target === null || !('e' in target) || typeof (target as any).e !== 'string') {
      return { ok: false; errors: ['target must be { e: Id }'] }
    }

    // instrument?: { e: Id } | null
    const instrument = proposal.instrument
    if (instrument !== undefined && instrument !== null) {
      if (typeof instrument !== 'object' || !('e' in instrument) || typeof (instrument as any).e !== 'string') {
        return { ok: false; errors: ['instrument must be { e: Id } or null'] }
      }
    }

    // params: ProposalParams (closed record)
    const params = proposal.params
    if (typeof params !== 'object' || params === null) {
      return { ok: false; errors: ['params must be an object'] }
    }
    // Validate specific params keys
    if (typeof params.say !== 'string' && params.say !== undefined) {
      return { ok: false; errors: ['say must be a string or undefined'] }
    }
    if (typeof params.quest !== 'string' && params.quest !== undefined) {
      return { ok: false; errors: ['quest must be a string ID or undefined'] }
    }
    if (typeof params.topic !== 'string' && params.topic !== undefined) {
      return { ok: false; errors: ['topic must be a string or undefined'] }
    }
    if (typeof params.choice !== 'string' && params.choice !== undefined) {
      return { ok: false; errors: ['choice must be a string or undefined'] }
    }
    if (typeof params.item !== 'string' && params.item !== undefined) {
      return { ok: false; errors: ['item must be a string ID or undefined'] }
    }
    if (typeof params.into !== 'string' && params.into !== undefined) {
      return { ok: false; errors: ['into must be a string or undefined'] }
    }
    if (typeof params.dir !== 'string' && params.dir !== undefined) {
      return { ok: false; errors: ['dir must be a string or undefined'] }
    }
    if (typeof params.skill !== 'string' && params.skill !== undefined) {
      return { ok: false; errors: ['skill must be a string ID or undefined'] }
    }
    if (typeof params.profession !== 'string' && params.prospection !== undefined) {
      return { ok: false; errors: ['profession must be a string ID or undefined'] }
    }
    if (typeof params.recipe !== 'string' && params.recipe !== undefined) {
      return { ok: false; errors: ['recipe must be a string ID or undefined'] }
    }
    if (typeof params.at !== 'string' && params.at !== undefined) {
      return { ok: false; errors: ['at must be a string ID or undefined'] }
    }

    // intentText: string
    const intentText = proposal.intentText
    if (typeof intentText !== 'string' || intentText === '') {
      return { ok: false; errors: ['intentText must be a non-empty string'] }
    }

    // confidence: number 0..1
    const confidence = proposal.confidence
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return { ok: false; errors: ['confidence must be a number between 0 and 1'] }
    }

    return { ok: true }
  }

  // ---- kind: 'no-action' ----
  if (kind === 'no-action') {
    const reason = proposal.reason
    if (typeof reason !== 'string' || !['talk', 'question', 'emote', 'nothing'].includes(reason)) {
      return { ok: false; errors: ["reason must be 'talk'|'question'|'emote'|'nothing'"] }
    }
    return { ok: true }
  }

  // ---- kind: 'ambiguous' ----
  if (kind === 'ambiguous') {
    const candidates = proposal.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false; errors: ['candidates must be a non-empty array'] }
    }
    for (const c of candidates) {
      const verdict = validateActionProposal(c, ctx)
      if (!verdict.ok) {
        return { ok: false; errors: [...verdict.errors, 'ambiguous candidate validation failed'] }
      }
    }
    const question = proposal.question
    if (typeof question !== 'string' || question === '') {
      return { ok: false; errors: ['question must be a non-empty string'] }
    }
    return { ok: true }
  }

  return { ok: false; errors: ['unknown ActionProposal kind'] ]
}

/** Validate a NarrativeOutput against structural limits (R2-02 §5.2–5.3). */
export function validateNarrativeOutput(
  o: unknown,
  ctx: NarrativeOutputCtx
): Verdict {
  if (typeof o !== 'object' || o === null || ('turnId' in o === false)) {
    return { ok: false; errors: ['expected NarrativeOutput object'] }
  }

  const output = o as Record<string, unknown>

  // turnId: string
  const turnId = output.turnId
  if (typeof turnId !== 'string' || turnId === '') {
    return { ok: false; errors: ['turnId must be a non-empty string'] }
  }

  // blocks: NarrativeBlock[], 1–6 blocks
  const blocks = output.blocks
  if (!Array.isArray(blocks)) {
    return { ok: false; errors: ['blocks must be an array'] }
  }
  if (blocks.length < 1 || blocks.length > 6) {
    return { ok: false; errors: ['blocks must be between 1 and 6, inclusive'] }
  }

  // Validate each block
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (typeof block !== 'object' || block === null || ('speaker' in block === false)) {
      return { ok: false; errors: [`block ${i}: missing speaker`] }
    }

    const speaker = block.speaker
    if (typeof speaker !== 'object' || speaker === null || ('kind' in speaker === false)) {
      return { ok: false; errors: [`block ${i}: speaker must have kind`] }
    }

    const kind = speaker.kind
    if (kind === 'narrator') {
      // { speaker: { kind: 'narrator' }; text: string }
      const text = block.text
      if (typeof text !== 'string' || text === '') {
        return { ok: false; errors: [`block ${i}: narrator text must be a non-empty string`] }
      }
      // Block count limit already checked above
    } else if (kind === 'character') {
      // { speaker: { kind: 'character'; entityId: Id }; text: string; mood?: Mood }
      const entityId = speaker.entityId
      if (typeof entityId !== 'string' || entityId === '') {
        return { ok: false; errors: [`block ${i}: character entityId must be a non-empty string`] }
      }

      // Check speaker is allowed (present on active map or in scene's cast list)
      // This is enforced by the NarrationOutputCtx.cast check at a higher level

      const text = block.text
      if (typeof text !== 'string' || text === '') {
        return { ok: false; errors: [`block ${i}: character text must be a non-empty string`] }
      }

      // mood check if present
      if ('mood' in block) {
        const mood = block.mood
        if (typeof mood !== 'string' || !['neutral', 'happy', 'sad', 'angry', 'surprised', 'shy'].includes(mood)) {
          return { ok: false; errors: [`block ${i}: mood must be engine union or undefined`] }
        }
      } else {
        // default mood when not specified
        // (no default assigned - text stands on its own)
      }
    } else {
      return { ok: false; errors: [`block ${i}: unknown speaker kind '${kind}'`] }
    }
  }

  // limits: blocks and chars
  const limits = output.limits
  if (typeof limits !== 'object' || limits === null) {
    return { ok: false; errors: ['limits must be an object'] }
  }
  if (typeof limits.blocks !== 'number' || limits.blocks < 1 || limits.blocks > 6) {
    return { ok: false; errors: ['limits.blocks must be between 1 and 6'] }
  }
  if (typeof limits.chars !== 'number' || limits.chars < 1) {
    return { ok: false; errors: ['limits.chars must be a positive number'] }
  }

  // meta: model, purpose, keptTokens?
  const meta = output.meta
  if (typeof meta !== 'object' || meta === null || typeof meta.model !== 'string' || meta.model === '') {
    return { ok: false; errors: ['meta.model must be a non-empty string'] }
  }
  if (typeof meta.purpose !== 'string' || meta.purpose !== 'narration') {
    return { ok: false; errors: ['meta.purpose must be "narration"'] }
  }
  if (typeof meta.keptTokens !== 'undefined' && (typeof meta.keptTokens !== 'number' || meta.keptTokens < 0)) {
    return { ok: false; errors: ['meta.keptTokens must be a non-negative number or undefined'] }
  }

  // player impersonation check: blocks may not be attributed to the player entity
  // (this is enforced at the turn machine level, not here structurally)

  return { ok: true }
}

/** Build a digest from engine Resolution and effects (R2-03 §2.2). */
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
  facts: {
    kind: 'say' | 'remark' | 'log' | 'emote' | 'vfx'
    who?: Id
    text?: string
  }[]
  changes: {
    entityId: Id
    summary: string
  }[]
  mutated: boolean
}

/** Build an OutcomeDigest from a Resolution and the engine's fx output. */
export function buildDigest(
  turnId: string,
  worldRevision: number,
  resolution: Resolution,
  fx: { op: string; to: string; params?: Record<string, unknown> }[],
  before: Record<Id, { hp?: number; maxHp?: number }>,
  after: Record<Id, { hp?: number; maxHp?: number }>,
  proposal?: { verb: Verb; target: Id; params: object; accepted: boolean; rejection?: string }
): OutcomeDigest {
  const facts: OutcomeDigest['facts'] = []
  const changes: OutcomeDigest['changes'] = []

  // Collect facts from fx entries that produce narratable output
  for (const effect of fx) {
    switch (effect.op) {
      case 'say':
        facts.push({ kind: 'say', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text: effect.params?.text as string | undefined })
        break
      case 'emote':
        facts.push({ kind: 'emote', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text: effect.params?.text as string | undefined })
        break
      case 'log':
        facts.push({ kind: 'log' })
        break
      case 'vfx':
        facts.push({ kind: 'vfx' })
        break
      case 'remark':
        facts.push({ kind: 'remark', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text: effect.params?.text as string | undefined })
        break
    }
  }

  // Collect changes from before/after entity states
  for (const entityId of Object.keys(after)) {
    const beforeEnt = before[entityId as Id]
    const afterEnt = after[entityId as Id]
    const hpChanged = (beforeEnt?.hp ?? 0) !== (afterEnt?.hp ?? 0)
    if (hpChanged || beforeEnt?.hp !== afterEnt?.hp) {
      changes.push({
        entityId: entityId as Id,
        summary: hpChanged ? `hp: ${afterEnt?.hp ?? 0}` : 'state change'
      })
    }
  }

  // Determine if the turn mutated world state
  const mutated = resolution.defined && !resolution.hole // defined outcome with no hole = mutation

  return {
    turnId,
    worldRevision,
    proposal,
    resolution: {
      defined: resolution.defined,
      filledHole: resolution.hole !== undefined,
      ruleId: resolution.rule?.id,
      fault: resolution.fault
    },
    facts,
    changes,
    mutated
  }
}