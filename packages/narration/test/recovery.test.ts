import { describe, expect, it } from 'vitest'
import { NarrativeTurnMachine } from '../src/turn'
import { MockNarrativeProvider } from '../src/provider/mock'
import { FakeEngine, ScriptedStore } from './helpers'
import type { NarrativeSaveState } from '../src/persistence'

function setup(store = new ScriptedStore()) {
  const engine = new FakeEngine()
  const machine = new NarrativeTurnMachine({ port: engine, provider: new MockNarrativeProvider(), store, worldId: 'world-1', contentVersion: 'v1' })
  return { engine, store, machine }
}

const blank = (): NarrativeSaveState => ({
  version: 1,
  worldId: 'world-1',
  contentVersion: 'v1',
  history: { lines: [], turns: [], summary: '', summarizedThrough: 0, chapter: 'Millbrook', chapters: [] },
  memory: { cards: {}, entries: [], nextId: 1 },
  snapshots: [],
  nextTurn: 4,
})

describe('failure, recovery and regeneration', () => {
  it('starts nothing when the turn cannot be recorded first', async () => {
    const store = new ScriptedStore()
    store.failAll = true
    const { engine, machine } = setup(store)
    await machine.load()
    const result = await machine.submit('take the apple')
    expect(result.status).toBe('failed')
    expect(result.committed).toBe(false)
    expect(engine.acts).toHaveLength(0)
  })

  it('says the world changed when persistence fails after the act', async () => {
    const store = new ScriptedStore()
    const { engine, machine } = setup(store)
    await machine.load()
    store.failOn = 3 // planning, before-act, after-act: the last one fails
    const result = await machine.submit('take the apple')
    expect(result.status).toBe('executed')
    expect(result.committed).toBe(true)
    expect(result.persisted).toBe(false)
    expect(engine.acts).toHaveLength(1)
  })

  it('never treats an interrupted turn as completed', async () => {
    const store = new ScriptedStore()
    const state = blank()
    state.pending = { id: 'turn-3', intent: 'take the apple', proposal: null, question: '', candidates: [], phase: 'executing', tick: 100, chapter: 'Millbrook' }
    store.inner.set('world-1', state)

    const { machine } = setup(store)
    const report = await machine.load()
    expect(report.interrupted?.id).toBe('turn-3')
    expect(machine.snapshot().turns).toBe(0)
    expect(machine.snapshot().lines.some((l) => l.role === 'system' && l.text.includes('interrupted'))).toBe(true)
    expect(machine.snapshot().pending).toBeUndefined()
  })

  it('keeps a clarification open across a reload', async () => {
    const store = new ScriptedStore()
    const first = setup(store)
    await first.machine.load()
    const asked = await first.machine.submit('pick it up')
    expect(asked.status).toBe('clarification_required')

    const second = setup(store)
    const report = await second.machine.load()
    expect(report.pending?.question).toContain('apple')
    const chosen = await second.machine.clarify(0)
    expect(chosen.status).toBe('executed')
    expect(second.engine.acts[0].target.e).toBe('i1')
  })

  it('restores the pre-turn snapshot before regenerating a mutating turn', async () => {
    const { engine, store, machine } = setup()
    await machine.load()
    const first = await machine.submit('take the apple')
    expect(engine.view().nearby.some((e) => e.id === 'i1')).toBe(false)

    const again = await machine.regenerate(first.turnId)
    expect(engine.restored).toBe(1)
    expect(again.status).toBe('executed')
    expect(engine.acts).toHaveLength(2)
    expect(machine.snapshot().turns).toBe(1)
    const saved = (await store.load('world-1', 'v1')).state
    expect(saved?.history.turns).toHaveLength(1)
    expect(saved?.snapshots).toHaveLength(1)
  })

  it('refuses to regenerate a turn that left no snapshot', async () => {
    const { machine } = setup()
    await machine.load()
    const talk = await machine.submit('hello there')
    const result = await machine.regenerate(talk.turnId)
    expect(result.status).toBe('failed')
    expect(result.errors?.join(' ')).toContain('no snapshot')
  })

  it('keeps only the last ten pre-turn snapshots', async () => {
    const { store, machine } = setup()
    await machine.load()
    for (let i = 0; i < 12; i++) await machine.submit('use Mira')
    const saved = (await store.load('world-1', 'v1')).state
    expect(saved?.snapshots).toHaveLength(10)
    expect(saved?.snapshots[0].turnId).toBe('turn-3')
  })

  it('invalidates narrative state alone when the content version changes', async () => {
    const store = new ScriptedStore()
    const first = setup(store)
    await first.machine.load()
    await first.machine.submit('take the apple')

    const changed = new NarrativeTurnMachine({ port: new FakeEngine(), provider: new MockNarrativeProvider(), store, worldId: 'world-1', contentVersion: 'v2' })
    const report = await changed.load()
    expect(report.invalidated).toBe(true)
    expect(changed.snapshot().turns).toBe(0)
    expect(changed.snapshot().lines.some((l) => l.text.includes('changed incompatibly'))).toBe(true)
  })
})

describe('memory, context and many voices', () => {
  it('records what happened and recalls it in a later context', async () => {
    const { machine } = setup()
    await machine.load()
    await machine.submit('take the apple')
    const context = machine.contextFor('what of the apple?')
    expect(context.text).toContain('Ari take apple')
  })

  it('lets each of several people speak in their own voice', async () => {
    const { machine } = setup()
    await machine.load()
    const result = await machine.submit('hello, everyone')
    expect(result.status).toBe('narrated')
    const speakers = result.output?.blocks.filter((b) => b.speaker.kind === 'character').map((b) => (b.speaker.kind === 'character' ? b.speaker.entityId : ''))
    expect(speakers).toContain('n1')
    expect(speakers).toContain('n2')
  })

  it('summarises a long conversation in the rolling record', async () => {
    const { store, machine } = setup()
    await machine.load()
    for (let i = 0; i < 12; i++) await machine.submit(`hello ${i}`)
    const saved = (await store.load('world-1', 'v1')).state
    expect(saved?.history.summary).toContain('hello 0')
    expect(saved?.history.summary).toContain('said')
  })
})
