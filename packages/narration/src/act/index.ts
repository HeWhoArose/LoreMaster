/**
 * Action proposal → verified engine act.
 *
 * This module is the authority boundary (R2-02 §4.3): it never resolves an ambiguity by
 * guessing. An `ambiguous` proposal becomes a clarification request for the player, always.
 */

import type { ActionProposal, ActionProposalCtx, ProposalParams } from '../contracts'
import { validateActionProposal } from '../contracts'
import type { EngineAction } from '../engine/port'

/** What came of mapping a proposal: exactly one of these, never an overloaded null. */
export type ProposalMapping =
  | { status: 'ready'; action: EngineAction }
  | { status: 'clarification_required'; candidates: ActionProposal[]; question: string }
  | { status: 'no_action'; reason: string }
  | { status: 'invalid'; errors: string[] }

const ACTION_PARAMS: readonly (keyof ProposalParams)[] = [
  'say', 'quest', 'topic', 'choice', 'item', 'into', 'dir', 'skill', 'profession', 'recipe', 'at',
]

/**
 * Turn a plain `action` proposal into the arguments Engine.act() takes.
 * Returns null for every other kind: ambiguity is not resolved here.
 */
export function proposalToAct(proposal: ActionProposal): EngineAction | null {
  if (proposal.kind !== 'action') return null

  const params: Record<string, unknown> = {}
  for (const key of ACTION_PARAMS) {
    const value = proposal.params[key]
    if (value !== undefined) params[key] = value
  }

  return {
    verb: proposal.verb,
    actorId: proposal.actorId,
    target: proposal.target,
    instrument: proposal.instrument ?? null,
    params,
  }
}

/**
 * Validate, then map. Invalid proposals are rejected; ambiguous ones are handed back to the
 * player with their alternatives; only a valid, unambiguous action becomes a `ready` act.
 */
export function mapProposal(proposal: ActionProposal, ctx: ActionProposalCtx): ProposalMapping {
  const verdict = validateActionProposal(proposal, ctx)
  if (!verdict.ok) return { status: 'invalid', errors: verdict.errors }

  if (proposal.kind === 'no-action') return { status: 'no_action', reason: proposal.reason }

  if (proposal.kind === 'ambiguous') {
    return {
      status: 'clarification_required',
      candidates: proposal.candidates,
      question: proposal.question,
    }
  }

  const action = proposalToAct(proposal)
  if (!action) return { status: 'invalid', errors: ['the proposal did not map to an engine act'] }
  return { status: 'ready', action }
}
