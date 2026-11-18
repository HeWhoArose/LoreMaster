// The appearance recommendation the shell feeds to the existing pixel creator (docs/phase1-design-specification.md
// §11.4). Two providers answer the same shape: a deterministic local one that only ever names ids the world's look
// table already has, and a model one that is validated the same way. Nothing here invents a part, a colour or a body,
// and nothing here draws: the existing creator renders and edits the result.

import type { Look, LookTable, Text } from '@openworld/engine'
import { lookProblems } from '@openworld/engine'
import type { AppearancePins, AppearanceRecommendation } from './contracts.ts'

/** What the shell asks for an appearance: the local rules, or a model behind them. */
export interface Recommender {
  id: string
  /** False: the provider needs a service the page does not have (the caller gates it behind consent). */
  available(): boolean
  recommend(text: string, base: Look, table: LookTable): Promise<AppearanceRecommendation>
}

/** A request for a part: the slot it fills and a piece of its English name ('' : any part of the slot). */
const ASKS: { test: RegExp; slot: string; name: string }[] = [
  { test: /\b(bun|topknot|updo)\b/i, slot: 'hair', name: 'bun' },
  { test: /\b(ponytail|pigtail|tied back)\b/i, slot: 'hair', name: 'ponytail' },
  { test: /\b(braid|braided|plait)\b/i, slot: 'hair', name: 'braid' },
  { test: /\b(wavy|waves|curly|curls)\b/i, slot: 'hair', name: 'wavy' },
  { test: /\b(cropped|shaved|buzz|short hair|crew cut)\b/i, slot: 'hair', name: 'cropped' },
  { test: /\bbeard\b/i, slot: 'beard', name: '' },
  { test: /\bstubble\b/i, slot: 'beard', name: '' },
  { test: /\bscar(red)?\b/i, slot: 'mark', name: 'scar' },
  { test: /\b(freckle|freckles|mole)\b/i, slot: 'mark', name: 'freckle' },
  { test: /\b(glasses|spectacles|spectacle|monocle)\b/i, slot: 'glasses', name: 'spectacle' },
  { test: /\bstraw hat\b/i, slot: 'hat', name: 'straw' },
  { test: /\b(hood|hooded)\b/i, slot: 'hat', name: 'hood' },
  { test: /\b(helmet|helm)\b/i, slot: 'hat', name: 'helm' },
  { test: /\b(kerchief|headscarf|scarf)\b/i, slot: 'hat', name: 'kerchief' },
  { test: /\bcap\b/i, slot: 'hat', name: 'cap' },
  { test: /\b(dress|gown)\b/i, slot: 'outfit', name: 'dress' },
  { test: /\bapron\b/i, slot: 'outfit', name: 'apron' },
  { test: /\b(robe|robes)\b/i, slot: 'outfit', name: 'robe' },
  { test: /\b(coat|jacket)\b/i, slot: 'outfit', name: 'coat' },
  { test: /\b(vestment|priest|priestly)\b/i, slot: 'outfit', name: 'vestment' },
  { test: /\btunic\b/i, slot: 'outfit', name: 'tunic' },
  { test: /\b(shirt|workshirt)\b/i, slot: 'outfit', name: 'shirt' },
  { test: /\b(gambeson|tabard)\b/i, slot: 'outfit', name: 'gambeson' },
  { test: /\b(plate|armour|armor)\b/i, slot: 'outfit', name: 'plate' },
  { test: /\bcloak\b/i, slot: 'outfit', name: 'cloak' },
  { test: /\btravel()?ling\b/i, slot: 'outfit', name: 'travel' },
  { test: /\b(boots|boot)\b/i, slot: 'shoes', name: 'boot' },
  { test: /\bsandals?\b/i, slot: 'shoes', name: 'sandal' },
  { test: /\b(buckled|buckle)\b/i, slot: 'shoes', name: 'buckl' },
  { test: /\b(leg wraps?|wraps?)\b/i, slot: 'legs', name: 'wrap' },
  { test: /\b(hose|stockings)\b/i, slot: 'legs', name: 'hose' },
]

/** A request for a colour: the key it colours (or the slot's first colour) and a piece of its name. */
const COLOUR_ASKS: { test: RegExp; key: string; name: string }[] = [
  { test: /\b(silver|grey|gray) hair\b|\bhair\b.*\b(silver|grey|gray)\b/i, key: 'hair', name: 'silver' },
  { test: /\b(red|auburn|ginger) hair\b/i, key: 'hair', name: 'red' },
  { test: /\b(blond|blonde|golden|fair) hair\b/i, key: 'hair', name: 'gold' },
  { test: /\bblack hair\b/i, key: 'hair', name: 'black' },
  { test: /\bwhite hair\b/i, key: 'hair', name: 'white' },
  { test: /\b(brown|chestnut) hair\b/i, key: 'hair', name: 'brown' },
  { test: /\bpale skin\b|\bporcelain\b/i, key: 'skin', name: 'porcelain' },
  { test: /\bdark skin\b|\bbrown skin\b/i, key: 'skin', name: 'dark' },
  { test: /\bgreen eyes\b/i, key: 'eyes', name: 'green' },
  { test: /\bblue eyes\b/i, key: 'eyes', name: 'blue' },
  { test: /\bamber eyes\b|\bgolden eyes\b/i, key: 'eyes', name: 'amber' },
]

/** Requests the look contract cannot express: said plainly, and marked approximate. */
const UNSUPPORTED: { test: RegExp; note: string }[] = [
  { test: /\b(elf|elven|elfin)\b/i, note: 'Elves: the look table has no species field, so the nearest human body stands in.' },
  { test: /\b(dwarf|dwarven|dwarfish)\b/i, note: 'Dwarves: the look table has no species field, so the nearest human body stands in.' },
  { test: /\b(orc|orcish|goblin)\b/i, note: 'Orcs and goblins: the look table has no species field, so the nearest human body stands in.' },
  { test: /\b(beast|beastfolk|catfolk|foxfolk)\b/i, note: 'Beastfolk: the look table has no species field, so the nearest human body stands in.' },
  { test: /\b(tall|short|muscular|slim)\b/i, note: 'Build: the body is chosen from the bodies the world has; height and frame are not separate fields.' },
]

const enOf = (t: Text): string => (typeof t === 'string' ? t : t.en)
const zhOf = (t: Text): string => (typeof t === 'string' ? t : (t.zh ?? t.en))
const says = (name: Text, word: string) => enOf(name).toLowerCase().includes(word) || zhOf(name).includes(word)

/** The part of `slot` whose name matches, drawn for `body`; undefined: nothing matches. */
function partFor(table: LookTable, slot: string, name: string, body: string): string | undefined {
  const fits = ([, p]: [string, LookTable['parts'][string]]) => p.slot === slot && (!p.bodies || p.bodies.includes(body))
  const hits = Object.entries(table.parts).filter(fits)
  const named = name ? hits.filter(([, p]) => says(p.name, name)) : hits
  return (named[0] ?? (name ? undefined : hits[0]))?.[0]
}

/** The named colour for a key, from the families it is offered for; undefined: none matches. */
function colourFor(table: LookTable, key: string, name: string): string | undefined {
  const family = key === 'hair' ? 'hair' : key === 'skin' ? 'skin' : key === 'eyes' ? 'eyes' : 'cloth'
  const hit = Object.entries(table.colors).find(([, c]) => c.for.includes(family) && says(c.name, name))
  return hit?.[0]
}

/** The closest body the world has to what was asked (sex and age, never a species). */
function bodyFor(table: LookTable, text: string, base: Look): string {
  const male = /\b(man|male|boy|his|he|him)\b/i.test(text) && !/\b(woman|female|girl|her|she)\b/i.test(text)
  const female = /\b(woman|female|girl|her|she|lady)\b/i.test(text)
  const child = /\b(child|boy|girl|young child)\b/i.test(text)
  const want = (sex: 'male' | 'female', age: 'adult' | 'child') => Object.entries(table.bodies).find(([, b]) => b.sex === sex && b.age === age)?.[0]
  if (child) return want(male ? 'male' : 'female', 'child') ?? base.body
  if (male) return want('male', 'adult') ?? base.body
  if (female) return want('female', 'adult') ?? base.body
  return base.body
}

/** The pins a description asks for, in the look table's own ids. */
export function pinsFromText(text: string, base: Look, table: LookTable): { pins: AppearancePins; approximate: string[] } {
  const body = bodyFor(table, text, base)
  const parts: Record<string, string | null> = {}
  for (const ask of ASKS) {
    if (parts[ask.slot] !== undefined) continue
    if (!ask.test.test(text)) continue
    const id = partFor(table, ask.slot, ask.name, body)
    if (id) parts[ask.slot] = id
  }
  const colors: Record<string, string> = {}
  for (const ask of COLOUR_ASKS) {
    if (colors[ask.key]) continue
    if (!ask.test.test(text)) continue
    const id = colourFor(table, ask.key, ask.name)
    if (id) colors[ask.key] = id
  }
  const approximate = UNSUPPORTED.filter((u) => u.test.test(text)).map((u) => u.note)
  return { pins: { ...(body !== base.body && { body }), parts, colors }, approximate }
}

/** A look with the pins set on it (the base's own fields where the pins say nothing). */
export function applyPins(base: Look, pins: AppearancePins): Look {
  const parts = { ...base.parts }
  for (const [slot, id] of Object.entries(pins.parts)) {
    if (id) parts[slot] = id
    else delete parts[slot]
  }
  return { ...base, body: pins.body ?? base.body, parts, colors: { ...base.colors, ...pins.colors }, own: true }
}

/** The local rules: deterministic, offline, and limited to the world's own ids. */
export const LOCAL_RECOMMENDER: Recommender = {
  id: 'local-rules',
  available: () => true,
  async recommend(text, base, table) {
    const { pins, approximate } = pinsFromText(text, base, table)
    const named = [...Object.entries(pins.parts).map(([slot, id]) => `${slot}: ${id}`), ...Object.entries(pins.colors).map(([k, v]) => `${k}: ${v}`)]
    return {
      pins,
      approximate,
      source: 'local',
      explanation: {
        en: named.length
          ? `Read from what you described, using parts and colours this world already has — ${named.join(', ')}. You can change every choice in the character creator.`
          : 'Nothing in that description maps to a part this world already has, so the traveller is left as they are. You can choose everything in the character creator.',
      },
    }
  },
}

/**
 * A model behind the same contract: it may only name ids that exist, and its answer is checked against the table
 * before anything is shown (an unknown part, colour or body is dropped, not repaired into a guess).
 */
export function modelRecommender(ask: (prompt: string) => Promise<string>): Recommender {
  return {
    id: 'model',
    available: () => true,
    async recommend(text, base, table) {
      const parts = Object.keys(table.parts).map((id) => `${id} (${enOf(table.parts[id]!.name)})`).join('; ')
      const answer = await ask(
        `Choose an appearance for this traveller, using only these ids. Description: "${text}". Bodies: ${Object.keys(table.bodies).join(', ')}. Parts: ${parts}. Colours: ${Object.keys(table.colors).join(', ')}. Answer with JSON {"body","parts":{"<slot>":"<id>"},"colors":{"<key>":"<id>"},"explanation":"..."} and nothing else.`,
      )
      const parsed = JSON.parse(answer) as { body?: string; parts?: Record<string, string>; colors?: Record<string, string>; explanation?: string }
      const pins: AppearancePins = { parts: {}, colors: {} }
      if (parsed.body && table.bodies[parsed.body]) pins.body = parsed.body
      for (const [slot, id] of Object.entries(parsed.parts ?? {})) if (table.parts[id] && table.parts[id]!.slot === slot) pins.parts[slot] = id
      for (const [key, id] of Object.entries(parsed.colors ?? {})) if (table.colors[id] || /^#[0-9a-f]{6}$/i.test(id)) pins.colors[key] = id
      return { pins, approximate: [], source: 'model', explanation: { en: parsed.explanation?.trim() || 'A recommendation from the model.' } }
    },
  }
}

/** The look a recommendation makes, and what is still wrong with it against the table (nothing: ready to show). */
export function lookFrom(base: Look, recommendation: AppearanceRecommendation, table: LookTable): { look: Look; problems: string[] } {
  const look = applyPins(base, recommendation.pins)
  return { look, problems: lookProblems(look, table) }
}
