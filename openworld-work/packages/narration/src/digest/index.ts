/**
 * Digest builder — constructs the narrator's view from engine data only.
 * 
 * The narrator never sees WorldState. It only sees the OutcomeDigest, which is
 * built from the Resolution plus the effects' fx output and before/after entity
 * reads (R2-03 §2.2, §2.3). This is the "digest-only" rule: the narrator may
 * describe only what the digest says happened.
 */

import type { OutcomeDigest, Verdict } from '../contracts'
import type { Resolution } from '@openworld/engine/rules'
import type { Id, Verb } from '@openworld/engine/types'

/** Build the full OutcomeDigest for a turn. */
export function buildTurnDigest(
  turnId: string,
  worldRevision: number,
  resolution: Resolution,
  fx: Array<{ op: string; to: string; params?: Record<string, unknown> }>,
  before: Record<string, { hp?: number; maxHp?: number }>,
  after: Record<string, { hp?: number; maxHp?: number }>,
  proposal?: { verb: Verb; target: Id; params: object; accepted: boolean; rejection?: string }
): OutcomeDigest {
  // Extract facts from fx entries (the engine's narrative output channel)
  const facts: OutcomeDigest['facts'] = []
  const changes: OutcomeDigest['changes'] = []

  for (const effect of fx) {
    switch (effect.op) {
      case 'say': {
        const text = effect.params?.text as string | undefined
        facts.push({ kind: 'say', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text })
        break
      }
      case 'emote': {
        const text = effect.params?.text as string | undefined
        facts.push({ kind: 'emote', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text })
        break
      }
      case 'log':
        facts.push({ kind: 'log' })
        break
      case 'vfx':
        facts.push({ kind: 'vfx' })
        break
      case 'remark': {
        const text = effect.params?.text as string | undefined
        facts.push({ kind: 'remark', who: typeof effect.to === 'string' ? effect.to as Id : undefined, text })
        break
      }
    }
  }

  // Collect changes from before/after entity states
  for (const entityId of Object.keys(after)) {
    const beforeEnt = before[entityId]
    const afterEnt = after[entityId]
    const hpBefore = beforeEnt?.hp ?? 0
    const hpAfter = afterEnt?.hp ?? 0
    if (hpBefore !== hpAfter) {
      changes.push({
        entityId: entityId as Id,
        summary: `hp: ${hpAfter}`
      })
    }
  }

  // Determine if the turn mutated world state
  // defined outcome with no hole means the engine resolved a definite result
  const mutated = resolution.defined && resolution.hole === undefined

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

/** Fallback line code-composed from the digest (R2-02 §5.3). */
export function fallbackLine(digest: OutcomeDigest): string {
  // If the turn was a failure/refusal, describe the failure
  if (!digest.resolution.defined) {
    return 'The action could not be completed.'
  }

  // If a say fact exists, use it
  const sayFact = digest.facts.find(f => f.kind === 'say')
  if (sayFact && sayFact.text) {
    return sayFact.text
  }

  // If an emote fact exists, use it
  const emoteFact = digest.facts.find(f => f.kind === 'emote')
  if (emoteFact && emoteFact.text) {
    return emoteFact.text
  }

  // Default: describe the action based on changes
  if (digest.changes.length > 0) {
    const change = digest.changes[0]
    return `You ${change.summary}.`
  }

  // Last resort: a terse descriptive line
  return 'Something happened.'
}