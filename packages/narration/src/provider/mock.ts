/**
 * A deterministic provider: the same words always give the same proposal and the same prose.
 *
 * It is a real provider — it goes through the same interface, the same context, the same
 * validation and the same orchestration a live model will use. Nothing here bypasses the
 * pipeline: it only decides what to say.
 */

import type { ActionProposal, NarrativeBlock, NarrativeOutput } from '../contracts'
import type { Verb } from '@openworld/engine'
import type { NarrativeWorldView, NpcView, WorldEntityView } from '../engine/port'
import type { NarrativeProvider, NarrativeRequest, ProposalRequest } from './index'

/** The phrases each scenario answers to (tests and the manual use these). */
export const MOCK_SCENARIOS = {
  dialogue: ['hello', 'hi ', 'greet', 'say ', 'ask ', '?', 'how are you'],
  validAction: ['take ', 'pick up', 'grab ', 'put ', 'place ', 'use ', 'attack', 'hit ', 'strike', 'go ', 'walk ', 'move ', 'craft', 'make ', 'learn', 'study'],
  invalid: ['summon', 'conjure', 'teleport me'],
  ambiguous: ['open it', 'pick it up', 'take it', 'use it'],
  failure: ['fail', 'break the provider'],
  invalidOutput: ['glitch', 'corrupt'],
  multiNpc: ['everyone', 'both of you', 'all of you'],
} as const

const has = (text: string, words: readonly string[]) => {
  const lower = text.toLowerCase()
  return words.some((w) => (w.endsWith(' ') ? lower.startsWith(w) || lower.includes(` ${w}`) : lower.includes(w)))
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? []

/** The thing or person an intent names, else the closest. */
export function matchEntity(view: NarrativeWorldView, text: string): WorldEntityView | undefined {
  const said = new Set(words(text))
  const pool: WorldEntityView[] = [...view.npcs, ...view.nearby]
  return (
    pool.find((e) => said.has(e.id.toLowerCase())) ??
    pool.find((e) => words(e.name).some((w) => w.length > 2 && said.has(w))) ??
    pool.find((e) => words(e.name).length > 0 && text.toLowerCase().includes(e.name.toLowerCase())) ??
    pool[0]
  )
}

function direction(text: string): 'up' | 'down' | 'left' | 'right' | undefined {
  const lower = text.toLowerCase()
  if (/\bup\b|\bnorth\b/.test(lower)) return 'up'
  if (/\bdown\b|\bsouth\b/.test(lower)) return 'down'
  if (/\bleft\b|\bwest\b/.test(lower)) return 'left'
  if (/\bright\b|\beast\b/.test(lower)) return 'right'
  return undefined
}

function action(view: NarrativeWorldView, intent: string, verb: Verb, target: { e: string }, params: Record<string, string> = {}, confidence = 0.8): ActionProposal {
  return {
    kind: 'action',
    actorId: view.playerId,
    verb,
    target,
    instrument: null,
    params,
    intentText: intent,
    confidence,
  }
}

/** The mock: proposals by phrase, then prose by digest. */
export class MockNarrativeProvider implements NarrativeProvider {
  readonly name: string

  constructor(name = 'mock:deterministic') {
    this.name = name
  }

  async propose(request: ProposalRequest): Promise<ActionProposal> {
    const { intent, view, seat } = request
    const lower = intent.toLowerCase()

    if (has(intent, MOCK_SCENARIOS.failure)) throw new Error('the provider is unavailable')

    if (has(intent, MOCK_SCENARIOS.invalid)) {
      // a referent the turn cannot see: validation must refuse it
      return action(view, intent, 'use', { e: 'dragon:1' }, {}, 0.9)
    }

    if (lower.includes('?') || has(intent, MOCK_SCENARIOS.dialogue)) {
      return { kind: 'no-action', reason: lower.includes('?') ? 'question' : 'talk' }
    }

    // two things that could be meant: never choose for the player
    if (has(intent, MOCK_SCENARIOS.ambiguous) && view.nearby.length >= 2) {
      const [a, b] = view.nearby
      return {
        kind: 'ambiguous',
        question: `Which do you mean: ${a.name} or ${b.name}?`,
        candidates: [
          action(view, intent, 'take', { e: a.id }, {}, 0.6),
          action(view, intent, 'take', { e: b.id }, {}, 0.55),
        ],
      }
    }

    const target = matchEntity(view, intent)
    const say = view.npcs.find((n) => n.id === target?.id)?.talk?.[0]

    if (has(intent, ['go ', 'walk ', 'move ']) || direction(intent)) {
      return action(view, intent, 'move', { e: seat }, direction(intent) ? { dir: direction(intent)! } : {}, 0.75)
    }
    if (has(intent, ['craft', 'make ']) || lower.startsWith('learn') || lower.includes('study')) {
      const craft = lower.includes('craft') || lower.includes('make ')
      return action(view, intent, craft ? 'craft' : 'learn', { e: seat }, {}, 0.7)
    }
    if (!target) {
      return { kind: 'no-action', reason: 'emote' }
    }
    if (has(intent, ['talk', 'speak', 'say ', 'ask ', 'greet']) && say) {
      return action(view, intent, 'hands', { e: target.id }, { say }, 0.75)
    }
    if (has(intent, ['take ', 'pick up', 'grab '])) return action(view, intent, 'take', { e: target.id })
    if (has(intent, ['put ', 'place '])) return action(view, intent, 'put', { e: target.id })
    return action(view, intent, 'use', { e: target.id })
  }

  async narrate(request: NarrativeRequest): Promise<NarrativeOutput> {
    const { turnId, intent, view, digest, rejection, clarification } = request
    const meta = { model: this.name, purpose: 'narration' as const }

    if (has(intent, MOCK_SCENARIOS.failure)) throw new Error('the provider is unavailable')

    if (has(intent, MOCK_SCENARIOS.invalidOutput)) {
      // a speaker outside the cast: validation must refuse this output
      return { turnId, blocks: [{ speaker: { kind: 'character', entityId: 'ghost:none' }, text: 'I was never here.' }], meta }
    }

    const npcs = view.npcs
    const speaker = (npc: NpcView, text: string, mood: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'shy' = 'neutral'): NarrativeBlock => ({
      speaker: { kind: 'character', entityId: npc.id },
      text,
      mood,
    })
    const narrator = (text: string): NarrativeBlock => ({ speaker: { kind: 'narrator' }, text })

    if (clarification) {
      return {
        turnId,
        blocks: [
          narrator(clarification.question),
          ...(npcs[0] ? [speaker(npcs[0], `${view.playerName} settles on ${clarification.choice}.`, 'neutral')] : []),
        ],
        meta,
      }
    }

    if (rejection) {
      return {
        turnId,
        blocks: [
          narrator(`That cannot be done here: ${rejection}`),
          ...(npcs[0] ? [speaker(npcs[0], 'That is not something this place allows.', 'neutral')] : []),
        ],
        meta,
      }
    }

    if (digest) {
      const blocks: NarrativeBlock[] = []
      for (const fact of digest.facts) {
        if (!fact.text) continue
        if (fact.kind === 'say' || fact.kind === 'remark') {
          const who = fact.who && npcs.find((n) => n.id === fact.who)
          blocks.push(who ? speaker(who, fact.text, fact.mood === 'happy' ? 'happy' : 'neutral') : narrator(fact.text))
        }
      }

      const verb = digest.proposal?.verb
      const targetName = digest.proposal ? nameOf(view, digest.proposal.target) : undefined
      const done = verb === 'take' ? `You take ${targetName}.`
        : verb === 'put' ? `You put ${targetName} away.`
        : verb === 'use' ? `You use ${targetName}.`
        : verb === 'move' ? 'You move on.'
        : verb === 'craft' ? 'You set to work.'
        : verb === 'learn' ? 'You take it in.'
        : verb === 'hands' ? `You reach for ${targetName}.`
        : 'It is done.'

      if (!digest.resolution.defined) {
        blocks.push(narrator('Nothing comes of it — the world has no answer for that here.'))
      } else {
        blocks.push(narrator(done))
        for (const change of digest.changes) {
          blocks.push(narrator(`${nameOf(view, change.entityId)} ${change.summary}.`))
        }
      }

      // people close enough react, each in their own voice
      const reactor = npcs[0]
      if (reactor && (verb === 'use' || verb === 'take')) {
        const warm = (reactor.regard ?? 0) >= 10
        blocks.push(speaker(reactor, warm ? 'Well struck.' : 'Mind yourself.', warm ? 'happy' : 'surprised'))
      }

      if (has(intent, MOCK_SCENARIOS.multiNpc)) {
        for (const npc of npcs.slice(0, 3)) blocks.push(speaker(npc, lineFor(npc)))
      }

      return { turnId, blocks: blocks.slice(0, 6), meta }
    }

    // no action: a question, a greeting, or an emote
    if (npcs.length) {
      const who = npcs[0]
      const lines = has(intent, MOCK_SCENARIOS.multiNpc)
        ? npcs.slice(0, 3).map((n) => speaker(n, lineFor(n)))
        : [speaker(who, greet(who, intent))]
      return { turnId, blocks: [narrator(`${who.name} looks up as you speak.`), ...lines], meta }
    }
    return { turnId, blocks: [narrator('There is no one here to answer.')], meta }
  }
}

function nameOf(view: NarrativeWorldView, id: string): string {
  if (id === view.playerId) return 'yourself'
  const found = [...view.npcs, ...view.nearby].find((e) => e.id === id)
  return found?.name ?? id
}

function lineFor(npc: NpcView): string {
  const manner = npc.temperament?.manner ?? npc.temperament?.personality
  if (manner) return `${manner.charAt(0).toUpperCase()}${manner.slice(1)}.`
  return npc.role ? `A ${npc.role} has little to say.` : 'They nod.'
}

function greet(npc: NpcView, intent: string): string {
  if (/\?\s*$/.test(intent.trim())) return 'Ask, then. I am listening.'
  const regard = npc.regard ?? 0
  if (regard >= 40) return 'You again — good. What do you need?'
  if (regard <= -40) return 'Say your piece and go.'
  return 'What is it?'
}
