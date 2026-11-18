// The application shell's deterministic checks (docs/phase1-design-specification.md §14): the story→act mapping, and
// the appearance recommendation against the world's real look table. No AI service and no browser are involved: the
// recommendation is the offline rule set, and every id it names must already exist in the table.

import { describe, expect, it } from 'vitest'
import { LOOK_TABLE, PLAYER_LOOK } from '../../content/src/looks.ts'
import { OPENWORLD_STORY, currentAct } from '../src/shell/contracts.ts'
import { applyPins, lookFrom, pinsFromText, LOCAL_RECOMMENDER } from '../src/shell/recommend.ts'

describe('story → act metadata', () => {
  it('reads the act from the save’s own day count, never from an engine act entity', () => {
    expect(currentAct(OPENWORLD_STORY, 1)?.actId).toBe('act-1')
    expect(currentAct(OPENWORLD_STORY, 3)?.actId).toBe('act-3')
    expect(currentAct(OPENWORLD_STORY, 99)?.actId).toBe('act-5')
    expect(currentAct(OPENWORLD_STORY, 0)).toBeUndefined()
  })
})

describe('appearance recommendation', () => {
  const text = 'A young woman with cropped silver hair, a scar, a travelling coat and tall boots'

  it('names only parts and colours the look table already has', () => {
    const { pins } = pinsFromText(text, PLAYER_LOOK, LOOK_TABLE)
    for (const [slot, id] of Object.entries(pins.parts)) {
      expect(id).toBeTruthy()
      expect(LOOK_TABLE.parts[id!]).toBeDefined()
      expect(LOOK_TABLE.parts[id!]!.slot).toBe(slot)
      expect(LOOK_TABLE.parts[id!]!.bodies?.includes(pins.body ?? PLAYER_LOOK.body) ?? true).toBe(true)
    }
    for (const [key, colour] of Object.entries(pins.colors)) {
      expect(key).toBeTruthy()
      expect(LOOK_TABLE.colors[colour] ?? (/^#[0-9a-f]{6}$/i.test(colour) ? colour : undefined)).toBeDefined()
    }
    expect(pins.body === undefined || LOOK_TABLE.bodies[pins.body]).toBeTruthy()
  })

  it('makes a look the engine’s own checker accepts', async () => {
    const answer = await LOCAL_RECOMMENDER.recommend(text, PLAYER_LOOK, LOOK_TABLE)
    const { look, problems } = lookFrom(PLAYER_LOOK, answer, LOOK_TABLE)
    expect(problems).toEqual([])
    expect(look.parts.mark).toBe('mark.scar')
    expect(look.parts.shoes).toBe('shoes.boots')
    expect(look.colors.hair).toBeTruthy()
  })

  it('leaves every field the recommendation does not name untouched (player edits survive)', () => {
    const edited = { ...PLAYER_LOOK, parts: { ...PLAYER_LOOK.parts, hair: 'hair.wavy' }, colors: { ...PLAYER_LOOK.colors, hair: 'black' } }
    const { pins } = pinsFromText('a scar', edited, LOOK_TABLE)
    const merged = applyPins(edited, pins)
    expect(merged.parts.hair).toBe('hair.wavy')
    expect(merged.colors.hair).toBe('black')
    expect(merged.parts.mark).toBe('mark.scar')
  })

  it('marks what the look contract cannot express as approximate, and still returns a valid look', async () => {
    const answer = await LOCAL_RECOMMENDER.recommend('an elf with silver hair and a hood', PLAYER_LOOK, LOOK_TABLE)
    expect(answer.approximate.length).toBeGreaterThan(0)
    expect(lookFrom(PLAYER_LOOK, answer, LOOK_TABLE).problems).toEqual([])
  })

  it('changes nothing when the description names nothing the table has', async () => {
    const answer = await LOCAL_RECOMMENDER.recommend('qqqq zzzz', PLAYER_LOOK, LOOK_TABLE)
    expect(answer.pins.parts).toEqual({})
    expect(lookFrom(PLAYER_LOOK, answer, LOOK_TABLE).look).toEqual(applyPins(PLAYER_LOOK, answer.pins))
  })
})
