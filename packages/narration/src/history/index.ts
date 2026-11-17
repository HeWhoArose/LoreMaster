/**
 * Conversation history, rolling summaries and chapter memory.
 *
 * Recent turns are kept verbatim. Older ones are condensed into a deterministic summary; the
 * summary is context, never authoritative state, and never replaces the engine's record.
 */

import type { Id } from '@openworld/engine'
import type { OutcomeDigest } from '../contracts'

export type LineRole = 'player' | 'narrator' | 'character' | 'system'

export interface TranscriptLine {
  role: LineRole
  text: string
  speakerId?: Id
  tick: number
  /** The turn that said it (regeneration removes a turn's lines by this). */
  turnId?: string
}

export type TurnOutcome = 'narrated' | 'executed' | 'rejected' | 'clarified' | 'failed' | 'interrupted'

/** One completed turn, as the record keeps it. */
export interface TurnRecord {
  id: string
  tick: number
  intent: string
  outcome: TurnOutcome
  chapter: string
  digest?: OutcomeDigest
  /** What the player chose, when the turn needed clarification. */
  clarified?: string
  /** The words shown for the turn. */
  text?: string
}

export interface ChapterRecord {
  name: string
  startedAt: number
  summary: string
}

export interface NarrativeHistoryState {
  lines: TranscriptLine[]
  turns: TurnRecord[]
  summary: string
  /** How many turns the summary covers (the rest stay verbatim). */
  summarizedThrough: number
  chapter: string
  chapters: ChapterRecord[]
}

/** How many turns stay verbatim before older ones are summarised. */
export const VERBATIM_TURNS = 10

export class NarrativeHistory {
  lines: TranscriptLine[] = []
  turns: TurnRecord[] = []
  summary = ''
  summarizedThrough = 0
  chapter = ''
  chapters: ChapterRecord[] = []
  /** The cap on the transcript kept in memory (the summary covers what falls off). */
  maxLines: number

  constructor(maxLines = 300) {
    this.maxLines = maxLines
  }

  append(line: TranscriptLine): void {
    this.lines.push(line)
    if (this.lines.length > this.maxLines) this.lines.splice(0, this.lines.length - this.maxLines)
  }

  pushTurn(turn: TurnRecord): void {
    this.turns.push(turn)
    this.append({ role: 'player', text: turn.intent, tick: turn.tick })
    if (turn.text) this.append({ role: 'narrator', text: turn.text, tick: turn.tick })
    this.maybeSummarize(turn.tick)
  }

  /** The last `n` turns' lines, verbatim. */
  recentLines(n = 8): TranscriptLine[] {
    return this.lines.slice(-n)
  }

  /** Condense all but the newest turns into the rolling summary (deterministic, extractive). */
  maybeSummarize(tick: number): void {
    const keep = VERBATIM_TURNS
    const cutoff = this.turns.length - keep
    if (cutoff <= this.summarizedThrough) return
    const older = this.turns.slice(this.summarizedThrough, cutoff)
    const lines = older.map((t) => {
      const what = t.outcome === 'executed' ? 'did' : t.outcome === 'rejected' ? 'was refused' : t.outcome === 'failed' ? 'went wrong' : 'said'
      const detail = t.digest && t.digest.changes.length ? ` (${t.digest.changes.map((c) => c.summary).join('; ')})` : ''
      return `- day ${Math.floor(t.tick / 24000)}: “${t.intent}” ${what}${detail}`
    })
    const kept = this.summary ? [this.summary, ...lines] : lines
    // cap the summary's own growth: the oldest lines fall out of it
    const joined = kept.join('\n').split('\n').slice(-40).join('\n')
    this.summary = joined
    this.summarizedThrough = cutoff
    this.touchChapter(tick, older)
  }

  /** A chapter is the map (or story stage) a stretch of turns happened in. */
  setChapter(name: string, tick: number): void {
    if (!name || name === this.chapter) return
    const previous = this.chapters[this.chapters.length - 1]
    if (previous && previous.name === name) return
    this.chapters.push({ name, startedAt: tick, summary: '' })
    this.chapter = name
  }

  private touchChapter(tick: number, older: TurnRecord[]): void {
    const chapter = this.chapters[this.chapters.length - 1]
    if (!chapter) return
    const within = older.filter((t) => t.chapter === chapter.name)
    if (!within.length) return
    chapter.summary = within
      .slice(-6)
      .map((t) => `${t.intent} → ${t.outcome}`)
      .join('; ')
    if (chapter.summary.length > 600) chapter.summary = chapter.summary.slice(-600)
    void tick
  }

  /** The chapter summaries worth carrying into a turn's context. */
  chapterMemory(limit = 3): string[] {
    return this.chapters
      .filter((c) => c.summary)
      .slice(-limit)
      .map((c) => `${c.name}: ${c.summary}`)
  }

  get lastTurn(): TurnRecord | undefined {
    return this.turns[this.turns.length - 1]
  }

  toJSON(): NarrativeHistoryState {
    return {
      lines: this.lines.map((l) => ({ ...l })),
      turns: this.turns.map((t) => ({ ...t })),
      summary: this.summary,
      summarizedThrough: this.summarizedThrough,
      chapter: this.chapter,
      chapters: this.chapters.map((c) => ({ ...c })),
    }
  }

  static from(state: NarrativeHistoryState | undefined, maxLines = 300): NarrativeHistory {
    const history = new NarrativeHistory(maxLines)
    if (!state) return history
    history.lines = (state.lines ?? []).map((l) => ({ ...l }))
    history.turns = (state.turns ?? []).map((t) => ({ ...t }))
    history.summary = state.summary ?? ''
    history.summarizedThrough = state.summarizedThrough ?? 0
    history.chapter = state.chapter ?? ''
    history.chapters = (state.chapters ?? []).map((c) => ({ ...c }))
    return history
  }
}
