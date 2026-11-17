import { describe, expect, it } from 'vitest'
import {
  VERBS, buildDigest, validateActionProposal, validateNarrativeOutput, validateRulePatch,
  type ActionProposal, type ActionProposalCtx,
} from '../src/contracts'
import { mapProposal, proposalToAct } from '../src/act'
import { fallbackLine } from '../src/digest'

const ctx: ActionProposalCtx = {
  seat: 'p1',
  visible: (id) => ['p1', 'i1', 'n1'].includes(id),
  verbs: VERBS,
  talkVerbs: (id) => (id === 'n1' ? ['talk', 'greet'] : []),
}

const action = (over: Partial<Extract<ActionProposal, { kind: 'action' }>> = {}): ActionProposal => ({
  kind: 'action', actorId: 'p1', verb: 'take', target: { e: 'i1' }, instrument: null,
  params: {}, intentText: 'take the apple', confidence: 0.8, ...over,
})

describe('ActionProposal validation', () => {
  it('accepts a well-formed act for the seat', () => {
    expect(validateActionProposal(action(), ctx)).toEqual({ ok: true })
  })

  it('refuses a proposal acting for someone else', () => {
    const verdict = validateActionProposal(action({ actorId: 'n1' }), ctx)
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.errors.join(' ')).toContain('seat')
  })

  it('refuses an unseen referent', () => {
    const verdict = validateActionProposal(action({ target: { e: 'dragon:1' } }), ctx)
    expect(verdict.ok).toBe(false)
  })

  it('refuses verbs outside the engine seven and unknown params', () => {
    expect(validateActionProposal(action({ verb: 'summon' as never }), ctx).ok).toBe(false)
    expect(validateActionProposal(action({ params: { colour: 'red' } as never }), ctx).ok).toBe(false)
  })

  it('refuses a talk verb the target does not offer', () => {
    expect(validateActionProposal(action({ verb: 'hands', params: { say: 'insult' } }), ctx).ok).toBe(false)
    expect(validateActionProposal(action({ verb: 'hands', target: { e: 'n1' }, params: { say: 'greet' } }), ctx).ok).toBe(true)
  })

  it('validates every alternative of an ambiguous proposal', () => {
    const ambiguous: ActionProposal = {
      kind: 'ambiguous',
      question: 'Which?',
      candidates: [action(), action({ target: { e: 'n1' }, verb: 'hands' })],
    }
    expect(validateActionProposal(ambiguous, ctx).ok).toBe(true)
    const bad = { ...ambiguous, candidates: [action(), action({ target: { e: 'ghost' } })] }
    expect(validateActionProposal(bad, ctx).ok).toBe(false)
  })
})

describe('proposal mapping never guesses', () => {
  const ambiguous: ActionProposal = {
    kind: 'ambiguous',
    question: 'The apple or the stone?',
    candidates: [action({ confidence: 0.9 }), action({ target: { e: 'n1' }, verb: 'hands', confidence: 0.1 })],
  }

  it('returns null rather than the highest-confidence candidate', () => {
    expect(proposalToAct(ambiguous)).toBeNull()
  })

  it('hands an ambiguous proposal back as a clarification', () => {
    const mapping = mapProposal(ambiguous, ctx)
    expect(mapping.status).toBe('clarification_required')
    if (mapping.status === 'clarification_required') {
      expect(mapping.candidates).toHaveLength(2)
      expect(mapping.question).toContain('apple')
    }
  })

  it('maps a plain action to exactly one engine act', () => {
    const mapping = mapProposal(action({ target: { e: 'n1' }, params: { say: 'greet' }, verb: 'hands' }), ctx)
    expect(mapping.status).toBe('ready')
    if (mapping.status === 'ready') {
      expect(mapping.action).toEqual({ verb: 'hands', actorId: 'p1', target: { e: 'n1' }, instrument: null, params: { say: 'greet' } })
    }
  })

  it('reports no-action and invalid separately from readiness', () => {
    expect(mapProposal({ kind: 'no-action', reason: 'talk' }, ctx).status).toBe('no_action')
    expect(mapProposal(action({ target: { e: 'dragon:1' } }), ctx).status).toBe('invalid')
  })
})

describe('NarrativeOutput validation', () => {
  const nctx = { cast: (id: string) => id === 'n1' || id === 'i1', player: 'p1', limits: { blocks: 4, chars: 200 } }

  it('accepts narrator and cast speech', () => {
    expect(validateNarrativeOutput({
      turnId: 't1',
      blocks: [
        { speaker: { kind: 'narrator' }, text: 'The mill turns.' },
        { speaker: { kind: 'character', entityId: 'n1' }, text: 'Aye.', mood: 'happy' },
      ],
      meta: { model: 'mock', purpose: 'narration' },
    }, nctx)).toEqual({ ok: true })
  })

  it('refuses the player speaking, an outsider, and an overlong text', () => {
    expect(validateNarrativeOutput({ turnId: 't', blocks: [{ speaker: { kind: 'character', entityId: 'p1' }, text: 'I say.' }], meta: { model: 'm', purpose: 'narration' } }, nctx).ok).toBe(false)
    expect(validateNarrativeOutput({ turnId: 't', blocks: [{ speaker: { kind: 'character', entityId: 'ghost' }, text: 'Boo.' }], meta: { model: 'm', purpose: 'narration' } }, nctx).ok).toBe(false)
    expect(validateNarrativeOutput({ turnId: 't', blocks: [{ speaker: { kind: 'narrator' }, text: 'x'.repeat(201) }], meta: { model: 'm', purpose: 'narration' } }, nctx).ok).toBe(false)
  })
})

describe('RulePatch validation', () => {
  const rctx = { hostTypes: (t: string) => t === 'person/herbalist', kinds: (k: string) => k === 'act/take', allowed: true }
  const patch = { id: 'p1', note: 'They refuse the offer', hostType: 'person/herbalist', on: 'act/take', effects: [{ op: 'say', text: 'No.' }], confidence: 0.4 }

  it('accepts a permissioned patch and refuses an unsafe op', () => {
    expect(validateRulePatch(patch, rctx).ok).toBe(true)
    expect(validateRulePatch({ ...patch, effects: [{ op: 'eval' }] }, rctx).ok).toBe(false)
  })

  it('refuses every patch when not allowed', () => {
    expect(validateRulePatch(patch, { ...rctx, allowed: false }).ok).toBe(false)
  })
})

describe('digest', () => {
  it('records facts, changes and mutation from the engine alone', () => {
    const digest = buildDigest(
      't1', 7, { defined: true, rule: { id: 'r' } } as never,
      [{ op: 'say', to: 'n1', params: { text: 'Mind the seeds.' } }],
      { n1: { hp: 8, maxHp: 8 } }, { n1: { hp: 5, maxHp: 8 } },
      { verb: 'use', target: 'n1', params: {}, accepted: true },
    )
    expect(digest.facts[0]).toMatchObject({ kind: 'say', who: 'n1', text: 'Mind the seeds.' })
    expect(digest.changes[0].summary).toContain('took 3 harm')
    expect(digest.mutated).toBe(true)
    expect(fallbackLine(digest)).toBe('Mind the seeds.')
  })

  it('does not call an open hole a mutation', () => {
    const digest = buildDigest('t', 1, { defined: false, hole: { rule: { id: 'h' }, path: [], default: [] } } as never, [], {}, {})
    expect(digest.mutated).toBe(false)
    expect(digest.resolution.filledHole).toBe(true)
  })
})
