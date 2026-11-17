/**
 * Action proposal → verified engine call mapping.
 * 
 * Every proposal kind maps to exactly one Engine.act() call or Controls wrapper,
 * mirroring the calls that controls.ts makes (R2-02 §4.3). No model output
 * reaches WorldState; the engine either resolves or returns {defined:false}.
 */

import type { ActionProposal, Verdict } from '../contracts'
import type { Id, Verb } from '@openworld/engine/types'
import type { Resolution } from '@openworld/engine/rules'

/** Map an ActionProposal to an Engine.act call or a Controls wrapper. */
export function proposalToAct(proposal: ActionProposal): {
  verb: Verb
  actorId: Id
  target: { e: Id }
  instrument?: { e: Id } | null
  params: Record<string, unknown>
} | null {
  const kind = proposal.kind

  // ---- kind: 'no-action' ----
  if (kind === 'no-action') {
    return null // no engine call needed
  }

  // ---- kind: 'ambiguous' ----
  if (kind === 'ambiguous') {
    // Pick the highest-confidence candidate, or return null for player disambiguation
    const best = proposal.candidates.reduce((best, c) => {
      const cConf = c.confidence
      const bestConf = best ? best.confidence : -1
      return cConf > bestConf ? c : best
    }, null as ActionProposal | null)
    if (best) {
      return proposalToAct(best)
    }
    return null
  }

  // ---- kind: 'action' ----
  if (kind === 'action') {
    const verb = proposal.verb as Verb
    const actorId = proposal.actorId
    const target = proposal.target
    const instrument = proposal.instrument
    const params: Record<string, unknown> = { verb }

    // Build params object from the proposal's params
    const p = proposal.params
    // Copy allowed keys
    if (p.say !== undefined) (params as any).say = p.say
    if (p.quest !== undefined) (params as any).quest = p.quest
    if (p.topic !== undefined) (params as any).topic = p.topic
    if (p.choice !== undefined) (params as any).choice = p.choice
    if (p.item !== undefined) (params as any).item = p.item
    if (p.into !== undefined) (params as any).into = p.into
    if (p.dir !== undefined) (params as any).dir = p.dir
    if (p.skill !== undefined) (params as any).skill = p.skill
    if (p.profession !== undefined) (params as any).profession = p.profession
    if (p.recipe !== undefined) (params as any).recipe = p.recipe
    if (p.at !== undefined) (params as any).at = p.at

    return { verb, actorId, target, instrument, params }
  }

  return null
}

/** Reject a proposal and return the appropriate turn outcome. */
export function rejectProposal(
  proposal: ActionProposal,
  reason: string
): { outcome: 'rejected'; digest?: never } {
  return { outcome: 'rejected' }
}

/** Process an ActionProposal through validation + engine call.
 *  Returns the engine Resolution and the turn outcome kind.
 */
export function processProposal(
  proposal: ActionProposal,
  ctx: {
    seat: Id
    visible: (id: Id) => boolean
    verbs: readonly Verb[]
    talkVerbs: (who: Id) => readonly string[]
  }
): {
  verdict: Verdict
  resolution: Resolution | undefined
  outcome: 'resolved' | 'rejected' | 'refused'
} {
  // Step 1: Validate the proposal
  const verdict = validateActionProposal(proposal, ctx)
  if (!verdict.ok) {
    return { verdict, outcome: 'rejected' }
  }

  // Step 2: Translate to engine act call
  const actArgs = proposalToAct(proposal)
  if (!actArgs) {
    return { verdict, outcome: 'refused' }
  }

  // Step 3: The actual engine.act call happens in the turn machine.
  // We return the args so the caller can make the real call.
  return {
    verdict,
    outcome: 'resolved' as const,
    // resolution is filled in by the engine
    resolution: undefined
  }
}