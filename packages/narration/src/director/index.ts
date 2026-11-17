/**
 * The narrative director: one turn's plan and one turn's prose.
 *
 * It asks the provider, validates what comes back, and never lets an invalid narrative through.
 * It holds no engine and no world: the turn machine gives it what it may see.
 */

import type { NarrativeOutput, NarrativeOutputCtx, OutcomeDigest } from '../contracts'
import { validateNarrativeOutput } from '../contracts'
import { fallbackLine } from '../digest'
import type { NarrativeProvider, NarrativeRequest, ProposalRequest } from '../provider'
import type { ActionProposal } from '../contracts'
import type { NarrativeWorldView } from '../engine/port'

/** What the player's words look like, before anything is proposed. */
export type IntentKind = 'question' | 'dialogue' | 'movement' | 'interaction' | 'combat' | 'other'

export function classifyIntent(text: string): IntentKind {
  const lower = text.trim().toLowerCase()
  if (!lower) return 'other'
  if (lower.endsWith('?')) return 'question'
  if (/^(hi|hello|hey|greetings|good (morning|evening|day))\b/.test(lower)) return 'dialogue'
  if (/^(say|ask|tell|speak|talk)\b/.test(lower)) return 'dialogue'
  if (/^(go|walk|move|head|travel|run|north|south|east|west|up|down)\b/.test(lower)) return 'movement'
  if (/^(attack|hit|strike|fight|kill|shoot|cast)\b/.test(lower)) return 'combat'
  if (/^(take|pick|grab|put|place|drop|open|use|craft|make|learn|study|give|offer)\b/.test(lower)) return 'interaction'
  return 'other'
}

export interface NarrationResult {
  output: NarrativeOutput
  /** False when the provider's output failed validation and the fallback was used. */
  fromProvider: boolean
  errors?: string[]
}

export class NarrativeDirector {
  constructor(private readonly provider: NarrativeProvider) {}

  get name(): string {
    return this.provider.name
  }

  /** Ask for the turn's proposal (unvalidated: the turn machine validates it). */
  async propose(request: ProposalRequest): Promise<ActionProposal> {
    return this.provider.propose(request)
  }

  /**
   * Ask for the turn's prose, and validate it. An invalid output is replaced by a line built
   * from the digest alone; the narrator never gets to say something the cast cannot say.
   */
  async narrate(request: NarrativeRequest, view: NarrativeWorldView): Promise<NarrationResult> {
    const ctx: NarrativeOutputCtx = {
      cast: (id) => view.npcs.some((n) => n.id === id) || view.nearby.some((e) => e.id === id),
      player: view.playerId,
      limits: { blocks: 6, chars: 1400 },
    }
    try {
      const output = await this.provider.narrate(request)
      const verdict = validateNarrativeOutput(output, ctx)
      if (verdict.ok) return { output, fromProvider: true }

      const digest: OutcomeDigest | undefined = request.digest
      return {
        output: {
          turnId: request.turnId,
          blocks: [{ speaker: { kind: 'narrator' }, text: digest ? fallbackLine(digest) : 'Nothing more is said.' }],
          meta: { model: `${this.provider.name}:fallback`, purpose: 'narration' },
        },
        fromProvider: false,
        errors: verdict.errors,
      }
    } catch (error) {
      const digest = request.digest
      return {
        output: {
          turnId: request.turnId,
          blocks: [{ speaker: { kind: 'narrator' }, text: digest ? fallbackLine(digest) : 'The words do not come.' }],
          meta: { model: `${this.provider.name}:fallback`, purpose: 'narration' },
        },
        fromProvider: false,
        errors: [error instanceof Error ? error.message : String(error)],
      }
    }
  }
}
