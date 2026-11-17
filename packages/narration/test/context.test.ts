import { describe, expect, it } from 'vitest'
import { NpcMemoryBook } from '../src/memory'
import { NarrativeHistory } from '../src/history'
import { assembleContext, DEFAULT_BUDGET } from '../src/context'
import { FakeEngine } from './helpers'

describe('memory and context', () => {
  it('recalls by relevance, per NPC, and forgets past the cap', () => {
    const book = new NpcMemoryBook(2)
    book.upsertCard({ id: 'n1', name: 'Mira', regard: 10 })
    book.record('n1', 'Ari brought the blue seeds', { tick: 10, salience: 0.9 })
    book.record('n1', 'Ari asked about the mill', { tick: 20, salience: 0.2 })
    book.record('n1', 'Ari left without a word', { tick: 30, salience: 0.1 })
    expect(book.recall('n1', 'blue seeds', 30)[0].text).toContain('blue seeds')
    expect(book.recall('n2', 'blue seeds', 30)).toHaveLength(0)
    expect(book.entriesOf('n1')).toHaveLength(2)
    expect(book.entriesOf('n1').some((e) => e.text.includes('blue seeds'))).toBe(true)
  })

  it('keeps a context package inside its budget and names what it dropped', () => {
    const engine = new FakeEngine()
    const book = new NpcMemoryBook()
    book.record('n1', 'Ari asked about the blue seeds', { tick: 90, salience: 0.9 })
    const history = new NarrativeHistory()
    const view = engine.view()
    const full = assembleContext(view, book, history, 'blue seeds', DEFAULT_BUDGET)
    expect(full.sections.map((s) => s.id)).toContain('people')
    expect(full.chars).toBeLessThanOrEqual(DEFAULT_BUDGET.chars)
    expect(full.text).toContain('Mira')
    expect(full.text).toContain('blue seeds')

    const tight = assembleContext(view, book, history, 'blue seeds', { ...DEFAULT_BUDGET, chars: 620 })
    expect(tight.chars).toBeLessThanOrEqual(620)
    expect(tight.omitted.length).toBeGreaterThan(0)
    expect(tight.sections[0].id).toBe('rules')
  })

  it('summarises older turns and keeps chapter memory', () => {
    const history = new NarrativeHistory()
    history.setChapter('Millbrook', 0)
    for (let i = 0; i < 13; i++) {
      history.pushTurn({ id: `t${i}`, tick: i * 10, intent: `thing ${i}`, outcome: 'executed', chapter: 'Millbrook', text: 'done' })
    }
    expect(history.summary).toContain('thing 0')
    expect(history.turns).toHaveLength(13)
    expect(history.recentLines(2)).toHaveLength(2)
    expect(history.chapterMemory().length).toBeGreaterThan(0)
  })
})
