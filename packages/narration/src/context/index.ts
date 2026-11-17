/**
 * Context assembly: everything a narrator may know this turn, and nothing more.
 *
 * Sections are budgeted by characters and admitted by priority, so the whole world history is
 * never sent to a provider. Memories are recalled by relevance to the player's intent, and each
 * NPC's private memories stay with that NPC.
 */

import type { NarrativeWorldView, NpcView } from '../engine/port'
import type { NpcMemoryBook } from '../memory'
import type { NarrativeHistory } from '../history'

export interface ContextBudget {
  /** The whole package's size, in characters. */
  chars: number
  maxNpcs: number
  maxNearby: number
  memoryPerNpc: number
}

export const DEFAULT_BUDGET: ContextBudget = {
  chars: 6000,
  maxNpcs: 4,
  maxNearby: 12,
  memoryPerNpc: 3,
}

/** One admitted section of context. */
export interface ContextSection {
  id: string
  title: string
  text: string
  /** Higher is kept first when the budget is tight. */
  priority: number
}

export interface ContextPackage {
  text: string
  sections: ContextSection[]
  chars: number
  /** Sections left out for want of budget. */
  omitted: string[]
  /** What the provider is being shown (the UI's "what the model saw" view). */
  tokens: number
}

const HOURS = ['midnight', 'night', 'small hours', 'before dawn', 'dawn', 'early morning', 'morning', 'late morning', 'noon', 'afternoon', 'late afternoon', 'evening', 'night']

function clock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  return `${String(h).padStart(2, '0')}:00 (${HOURS[Math.floor(h / 2)] ?? 'day'})`
}

function describePerson(npc: NpcView): string {
  const bits: string[] = []
  if (npc.role) bits.push(npc.role)
  const t = npc.temperament
  if (t?.personality) bits.push(t.personality)
  if (t?.manner) bits.push(t.manner)
  if (typeof npc.regard === 'number') {
    const regard = npc.regard >= 40 ? 'warm toward you' : npc.regard >= 10 ? 'well disposed' : npc.regard <= -40 ? 'hostile' : npc.regard <= -10 ? 'cold' : 'neutral toward you'
    bits.push(regard)
  }
  return bits.join('; ')
}

/** Assemble the turn's context package. */
export function assembleContext(
  view: NarrativeWorldView,
  memory: NpcMemoryBook,
  history: NarrativeHistory,
  query: string,
  budget: ContextBudget = DEFAULT_BUDGET,
): ContextPackage {
  const sections: ContextSection[] = []

  sections.push({
    id: 'rules',
    title: 'The rules of this turn',
    priority: 100,
    text: [
      'You are the narrator of an open-world RPG. The engine has already decided what happened.',
      'Describe only what the digest says. Never invent world state, items, deaths, or travel.',
      'Speak as the player only through the player\'s own typed intent, never as a character.',
      'Only the people listed below may speak, each in their own voice and knowledge.',
    ].join('\n'),
  })

  sections.push({
    id: 'scene',
    title: 'Scene',
    priority: 95,
    text: [
      `Chapter: ${view.chapter || view.mapName}`,
      `Place: ${view.mapName}`,
      `Day ${view.day}, ${clock(view.hour)}`,
      `Tick: ${view.tick}`,
    ].join('\n'),
  })

  const condition = [
    `You are ${view.playerName}.`,
    typeof view.hp === 'number' ? `Condition: ${view.hp}${view.maxHp ? `/${view.maxHp}` : ''} health.` : '',
    view.statuses.length ? `Status: ${view.statuses.join(', ')}.` : '',
    Object.keys(view.stats).length ? `Stats: ${Object.entries(view.stats).map(([k, v]) => `${k} ${v}`).join(', ')}.` : '',
  ].filter(Boolean).join('\n')
  sections.push({ id: 'player', title: 'The player', priority: 90, text: condition })

  const npcs = view.npcs.slice(0, budget.maxNpcs)
  const people = npcs.map((npc) => {
    const lines = [`- ${npc.name} (${npc.id})${npc.distance !== undefined ? `, ${npc.distance} tiles away` : ''}`]
    const card = describePerson(npc)
    if (card) lines.push(`  Character: ${card}`)
    if (npc.deeds?.length) lines.push(`  Seen to: ${npc.deeds.slice(-3).join('; ')}`)
    const recalled = memory.recall(npc.id, query, view.tick, budget.memoryPerNpc)
    if (recalled.length) lines.push(`  Remembers: ${recalled.map((m) => m.text).join(' / ')}`)
    const talk = npc.talk?.length ? npc.talk : []
    if (talk.length) lines.push(`  Talk options: ${talk.join(', ')}`)
    return lines.join('\n')
  })
  sections.push({
    id: 'people',
    title: 'People here',
    priority: 85,
    text: people.length ? people.join('\n') : 'Nobody is close enough to notice.',
  })

  const nearby = view.nearby.slice(0, budget.maxNearby)
  sections.push({
    id: 'nearby',
    title: 'Within reach',
    priority: 70,
    text: nearby.length
      ? nearby.map((e) => `- ${e.name} (${e.id}, ${e.type})${e.distance !== undefined ? ` — ${e.distance} tiles` : ''}`).join('\n')
      : 'Nothing else is close.',
  })

  const lines = history.recentLines(8)
  sections.push({
    id: 'recent',
    title: 'The last few exchanges',
    priority: 80,
    text: lines.length
      ? lines.map((l) => `${l.role === 'player' ? 'Player' : l.role === 'character' ? `Character ${l.speakerId ?? ''}` : 'Narrator'}: ${l.text}`).join('\n')
      : 'This is the first thing said.',
  })

  if (history.summary) {
    sections.push({ id: 'summary', title: 'What came before', priority: 60, text: history.summary })
  }
  const chapters = history.chapterMemory()
  if (chapters.length) {
    sections.push({ id: 'chapters', title: 'Earlier chapters', priority: 55, text: chapters.join('\n') })
  }
  if (view.recent.length) {
    sections.push({
      id: 'engine-recent',
      title: 'What the world last said or logged',
      priority: 50,
      text: view.recent.slice(-8).map((t) => `- ${t}`).join('\n'),
    })
  }
  const facts = Object.entries(view.facts).slice(0, 12)
  if (facts.length) {
    sections.push({
      id: 'facts',
      title: 'Facts of the world',
      priority: 45,
      text: facts.map(([k, v]) => `- ${k}: ${String(v)}`).join('\n'),
    })
  }

  // admit sections by priority until the budget is spent; the rules always go first
  const ordered = [...sections].sort((a, b) => b.priority - a.priority)
  const admitted: ContextSection[] = []
  const omitted: string[] = []
  let chars = 0
  for (const section of ordered) {
    const cost = section.text.length + section.title.length + 4
    if (chars + cost > budget.chars) {
      omitted.push(section.id)
      continue
    }
    admitted.push(section)
    chars += cost
  }

  // keep the prompt in a stable reading order, not the priority order
  admitted.sort((a, b) => b.priority - a.priority)
  const text = admitted.map((s) => `## ${s.title}\n${s.text}`).join('\n\n')

  return { text, sections: admitted, chars, omitted, tokens: Math.ceil(chars / 4) }
}
