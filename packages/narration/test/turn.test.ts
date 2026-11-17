import { describe, expect, it } from 'vitest'
import { NarrativeTurnMachine } from '../src/turn'
import { MockNarrativeProvider } from '../src/provider/mock'
import { FakeEngine, ScriptedStore } from './helpers'

function setup(store = new ScriptedStore(), contentVersion = 'v1') {
  const engine = new FakeEngine()
  const provider = new MockNarrativeProvider()
  const machine = new NarrativeTurnMachine({ port: engine, provider, store, worldId: 'world-1', contentVersion })
  return { engine, store, provider, machine }
}

describe('the narrative turn lifecycle', () => {
  it('answers dialogue without touching the engine', async () => {
    const { engine, machine } = setup()
    await machine.load()
    const result = await machine.submit('hello there')
    expect(result.status).toBe('narrated')
    expect(result.committed).toBe(false)
    expect(engine.acts).toHaveLength(0)
    expect(result.output?.blocks.some((b) => b.speaker.kind === 'character' && b.speaker.entityId === 'n1')).toBe(true)
    expect(machine.snapshot().lines.some((l) => l.role === 'player' && l.text === 'hello there')).toBe(true)
  })

  it('runs a valid action through the engine and describes the engine outcome', async () => {
    const { engine, store, machine } = setup()
    await machine.load()
    const result = await machine.submit('take the apple')
    expect(result.status).toBe('executed')
    expect(result.committed).toBe(true)
    expect(result.persisted).toBe(true)
    expect(engine.acts).toHaveLength(1)
    expect(engine.acts[0]).toMatchObject({ verb: 'take', actorId: 'p1', target: { e: 'i1' } })
    expect(result.digest?.facts.some((f) => f.text === 'Mind the seeds.')).toBe(true)
    expect(machine.snapshot().memories).toBeGreaterThan(0)
    const saved = (await store.load('world-1', 'v1')).state
    expect(saved?.history.turns).toHaveLength(1)
    expect(saved?.history.turns[0].outcome).toBe('executed')
  })

  it('refuses an action whose referent is not in view, without acting', async () => {
    const { engine, machine } = setup()
    await machine.load()
    const result = await machine.submit('summon a dragon')
    expect(result.status).toBe('rejected')
    expect(result.committed).toBe(false)
    expect(engine.acts).toHaveLength(0)
    expect(result.errors?.join(' ')).toContain('dragon:1')
  })

  it('asks the player to clarify an ambiguous intent, never choosing for them', async () => {
    const { engine, machine } = setup()
    await machine.load()
    const asked = await machine.submit('pick it up')
    expect(asked.status).toBe('clarification_required')
    expect(asked.choices?.map((c) => c.label)).toEqual(['take apple', 'take stone'])
    expect(engine.acts).toHaveLength(0)

    const chosen = await machine.clarify(1)
    expect(chosen.status).toBe('executed')
    expect(engine.acts).toHaveLength(1)
    expect(engine.acts[0].target.e).toBe('i2')
    expect(machine.snapshot().pending).toBeUndefined()
  })

  it('reports an undefined engine outcome as a failure that changed nothing', async () => {
    const { engine, machine } = setup()
    await machine.load()
    engine.undefineNext = true
    const result = await machine.submit('use Mira')
    expect(result.status).toBe('failed')
    expect(result.committed).toBe(false)
    expect(result.errors?.join(' ')).toContain('no answer')
  })

  it('reports a provider failure instead of inventing a turn', async () => {
    const { engine, machine } = setup()
    await machine.load()
    const result = await machine.submit('please fail')
    expect(result.status).toBe('failed')
    expect(result.committed).toBe(false)
    expect(engine.acts).toHaveLength(0)
    expect(result.errors?.join(' ')).toContain('unavailable')
  })

  it('replaces invalid narration with a digest-built line', async () => {
    const { machine } = setup()
    await machine.load()
    const result = await machine.submit('glitch at Mira')
    expect(result.status).toBe('executed')
    expect(result.output?.meta.model).toBe('mock:deterministic:fallback')
    expect(result.output?.blocks.every((b) => b.speaker.kind !== 'character' || b.speaker.entityId !== 'ghost:none')).toBe(true)
  })
})
