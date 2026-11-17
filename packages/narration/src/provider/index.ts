/**
 * The provider interface: one shape for a mock, a hosted model, a local endpoint, or BYOK.
 *
 * A provider proposes an action and narrates a digest. It never touches the engine, and the
 * orchestrator validates every proposal and every narrative before use.
 */

import type { ActionProposal, NarrativeOutput, OutcomeDigest } from '../contracts'
import type { ContextPackage } from '../context'
import type { NarrativeWorldView } from '../engine/port'

export interface ProposalRequest {
  turnId: string
  /** The player's words, exactly as typed. */
  intent: string
  context: ContextPackage
  view: NarrativeWorldView
  /** The actor the turn belongs to (the seat a proposal must name). */
  seat: string
  /** What the player chose, when this turn is the second half of a clarification. */
  clarification?: string
}

export interface NarrativeRequest {
  turnId: string
  intent: string
  context: ContextPackage
  view: NarrativeWorldView
  /** What the engine did; absent when the turn changed nothing. */
  digest?: OutcomeDigest
  /** Why a proposal was refused, when it was. */
  rejection?: string
  /** The clarification question and the choice made, when there was one. */
  clarification?: { question: string; choice: string }
}

/** What a provider is. */
export interface NarrativeProvider {
  /** A short name for the log and the transcript's provenance. */
  readonly name: string
  /** What the player tries to do, as a strict proposal. */
  propose(request: ProposalRequest): Promise<ActionProposal>
  /** What happened, as speaker-tagged prose. */
  narrate(request: NarrativeRequest): Promise<NarrativeOutput>
}
