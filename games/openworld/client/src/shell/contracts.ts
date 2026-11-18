// The Phase 1 application contracts (docs/phase1-design-specification.md §11): story metadata, the story→act
// mapping, world identity, the `act_cover` image slot, and the appearance recommendation the existing pixel creator
// renders. These are application-level records. No engine entity is added, and nothing here writes to a save.

import type { Text } from '@openworld/engine'

/** An act of a story: an ordered label the shell shows for a save's progress. */
export interface ActInfo {
  actId: string
  label: Text
  /**
   * The day the act begins, counted as `SaveSummary.day` counts days. The engine has no act entity (docs/phase0),
   * so this is the small curated mapping the shell uses; authored milestones replace these thresholds when the
   * content names them.
   */
  fromDay: number
}

export interface StoryMeta {
  storyId: string
  title: Text
  worldId: string
  summary: Text
  /** Artwork asset, when one is authored; the shell falls back to its own treatment. */
  cover?: string
  acts: ActInfo[]
}

export interface WorldIdentity {
  worldId: string
  title: Text
  summary: Text
  setting: Text
  genre: Text
  tone: Text
  era: Text
  motifs: string[]
  cover?: string
  /** False: shown in Discover as announced, with no play action. */
  playable: boolean
}

/** A picture slot of the application's asset family (world_cover, story_run_cover, act_cover). */
export interface ImageSlotDef {
  id: string
  aspect: string
  fit: 'cover' | 'contain'
  mime: string
  quality: number
  /** The fraction of each edge kept clear of the subject. */
  safeMargin: number
  /** What the picture shows: the current subject only, never a recap or what comes later. */
  prompt: Text
}

/** The act artwork slot: not an existing repo asset slot (docs/phase0 §3), defined here as the smallest extension. */
export const ACT_COVER: ImageSlotDef = {
  id: 'act_cover',
  aspect: '16:9',
  fit: 'cover',
  mime: 'image/webp',
  quality: 0.86,
  safeMargin: 0.06,
  prompt: {
    en: 'The act that is being played now: its place and the people in it, no recap of earlier acts and nothing of what comes later.',
    zh: '当下正在进行的这一幕：它的地点与在场的人，不回顾之前的幕，也不预告之后的幕。',
  },
}

/** A partial look: only what a recommendation names, in the look table's own ids. */
export interface AppearancePins {
  body?: string
  parts: Record<string, string | null>
  colors: Record<string, string>
}

export interface AppearanceRecommendation {
  pins: AppearancePins
  explanation: Text
  /** What the look contract cannot express as asked (a species, an unsupported request). */
  approximate: string[]
  source: 'local' | 'model'
}

/**
 * Species compatibility, as data only: the look contract has no species/race/ancestry field (docs/phase0 §5), so a
 * profile can only say which existing bodies stand in for it, and that the result is approximate.
 */
export interface SpeciesProfile {
  id: string
  label: Text
  bodies: string[]
  approximate: true
  note: Text
}

export const SPECIES_PROFILES: SpeciesProfile[] = [
  {
    id: 'human',
    label: { en: 'Human', zh: '人类' },
    bodies: [],
    approximate: true,
    note: {
      en: 'Every body in the current look table is a human body; the contract has no species field.',
      zh: '当前外观表里的体型都是人类体型；外观数据没有种族字段。',
    },
  },
]

export const OPENWORLD_WORLD: WorldIdentity = {
  worldId: 'world',
  title: { en: 'OpenWorld', zh: '开放世界' },
  summary: {
    en: 'A hand-built continent of five seals, a doomed night, and the people who live through it.',
    zh: '一片由五枚封印构成的大陆、一个注定降临的夜晚，以及在其中活下去的人。',
  },
  setting: { en: 'The Ford and the Holy City', zh: '晚祷渡与圣城' },
  genre: { en: 'Story-driven open-world RPG', zh: '剧情驱动的开放世界角色扮演' },
  tone: { en: 'Warm at the edges, dark at the centre', zh: '边缘温暖，中心幽暗' },
  era: { en: 'Late medieval, low magic', zh: '中世纪末，低魔' },
  motifs: ['lanterns', 'seals', 'river fog', 'ink and paper'],
  playable: true,
}

export const OPENWORLD_STORY: StoryMeta = {
  storyId: 'five-seals',
  title: { en: 'The Five Seals', zh: '五印' },
  worldId: 'world',
  summary: {
    en: 'The night the first seal breaks, and the road that carries you through the other four.',
    zh: '第一印破碎的那一夜，以及带你走过其余四印的那条路。',
  },
  acts: [
    { actId: 'act-1', label: { en: 'Act I — The First Seal', zh: '第一幕 · 第一印' }, fromDay: 1 },
    { actId: 'act-2', label: { en: 'Act II — The Second Seal', zh: '第二幕 · 第二印' }, fromDay: 2 },
    { actId: 'act-3', label: { en: 'Act III — The Third Seal', zh: '第三幕 · 第三印' }, fromDay: 3 },
    { actId: 'act-4', label: { en: 'Act IV — The Fourth Seal', zh: '第四幕 · 第四印' }, fromDay: 4 },
    { actId: 'act-5', label: { en: 'Act V — The Fifth Seal', zh: '第五幕 · 第五印' }, fromDay: 5 },
  ],
}

/** The act a save is in, from the story's own act list: undefined when the save is before the first act. */
export function currentAct(story: StoryMeta, day: number): ActInfo | undefined {
  let act: ActInfo | undefined
  for (const a of story.acts) if (day >= a.fromDay) act = a
  return act
}
