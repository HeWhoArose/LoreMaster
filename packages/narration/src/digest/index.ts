/**
 * Digest builder — the narrator's only view of what happened.
 *
 * The narrator never sees WorldState. It sees the OutcomeDigest, built from the Resolution,
 * the engine's fx and before/after health reads (R2-03 §2.2–2.3). This is the digest-only
 * rule: the narrator may describe only what the digest says happened.
 */

import type { DigestFact, DigestFx, OutcomeDigest } from '../contracts'
import { buildDigest } from '../contracts'
import type { Resolution } from '@openworld/engine'
import type { Id, Verb } from '@openworld/engine'

/** Build the full OutcomeDigest for a turn. */
export function buildTurnDigest(
  turnId: string,
  worldRevision: number,
  resolution: Resolution,
  fx: readonly DigestFx[],
  before: Readonly<Record<string, { hp?: number; maxHp?: number }>>,
  after: Readonly<Record<string, { hp?: number; maxHp?: number }>>,
  proposal?: { verb: Verb; target: Id; params: object; accepted: boolean; rejection?: string },
): OutcomeDigest {
  return buildDigest(turnId, worldRevision, resolution, fx, before, after, proposal)
}

/** A line code-composed from a digest, for when narration is unavailable or invalid. */
export function fallbackLine(digest: OutcomeDigest): string {
  if (!digest.resolution.defined) return 'Nothing comes of it.'

  const spoken = digest.facts.find((f) => (f.kind === 'say' || f.kind === 'remark') && f.text)
  if (spoken?.text) return spoken.text

  const emote = digest.facts.find((f) => f.kind === 'emote')
  if (emote) return 'A look passes over them.'

  if (digest.changes.length > 0) {
    const change = digest.changes[0]
    return change.summary.startsWith('took') || change.summary.startsWith('healed')
      ? `The blow tells: ${change.summary}.`
      : change.summary
  }

  const verb = digest.proposal?.verb
  if (verb === 'move') return 'You move on.'
  if (verb === 'take') return 'You take it.'
  if (verb === 'put') return 'You put it away.'
  if (verb === 'use') return 'It is done.'
  if (verb === 'hands') return 'You reach out.'
  if (verb === 'craft') return 'You set to work.'
  if (verb === 'learn') return 'You take it in.'
  return 'Something happens.'
}

/** The digest's facts said plainly (the transcript's own record of what the world did). */
export function digestFacts(digest: OutcomeDigest): DigestFact[] {
  return digest.facts
}
