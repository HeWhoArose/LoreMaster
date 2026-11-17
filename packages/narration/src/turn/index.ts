/**
 * The narrative turn machine: the one connected lifecycle.
 *
 *   player intent → context assembly → director → ActionProposal → validation →
 *   clarification (when ambiguous) → Engine.act → Resolution → OutcomeDigest →
 *   NarrativeOutput → NPC memory/history → persistence
 *
 * The engine stays authoritative. A turn is persisted as pending before it acts and cleared only
 * once its narrative and memory are recorded, so an interrupted turn is never called complete.
 */

import type { ActionProposal, NarrativeOutput, OutcomeDigest } from '../contracts'
import { VERBS } from '../contracts'
import { mapProposal } from '../act'
import { assembleContext, DEFAULT_BUDGET, type ContextBudget, type ContextPackage } from '../context'
import { NarrativeDirector } from '../director'
import { buildTurnDigest } from '../digest'
import type { EngineAction, EnginePort, NarrativeWorldView } from '../engine/port'
import { NarrativeHistory, type TranscriptLine, type TurnOutcome } from '../history'
import { NpcMemoryBook } from '../memory'
import type { NarrativeProvider } from '../provider'
import type { NarrativeStore, PendingTurn, SnapshotRecord } from '../persistence'
import { SNAPSHOT_LIMIT } from '../persistence'

export interface TurnMachineOptions {
  port: EnginePort
  provider: NarrativeProvider
  store: NarrativeStore
  worldId: string
  contentVersion?: string
  budget?: ContextBudget
  /** The verbs this world offers (defaults to the engine's seven). */
  verbs?: readonly ('use' | 'put' | 'take' | 'hands' | 'move' | 'craft' | 'learn')[]
}

export interface TurnChoice {
  index: number
  label: string
}

/** The result of one turn, in the states the UI must show. */
export interface TurnResult {
  status: 'executed' | 'narrated' | 'clarification_required' | 'rejected' | 'failed'
  turnId: string
  output?: NarrativeOutput
  digest?: OutcomeDigest
  question?: string
  choices?: TurnChoice[]
  errors?: string[]
  /** The engine actually changed the world. */
  committed: boolean
  /** The completed turn reached the store. */
  persisted: boolean
  /** The lines this turn added to the transcript. */
  lines: TranscriptLine[]
}

export interface LoadReport {
  interrupted?: PendingTurn
  invalidated: boolean
  pending?: { question: string; choices: TurnChoice[] }
}

export interface NarrativeSnapshotView {
  lines: TranscriptLine[]
  chapter: string
  summary: string
  turns: number
  memories: number
  pending?: { question: string; choices: TurnChoice[] }
}

export class NarrativeTurnMachine {
  private history = new NarrativeHistory()
  private memory = new NpcMemoryBook()
  private snapshots: SnapshotRecord[] = []
  private pending?: PendingTurn
  private nextTurn = 1
  private ready = false
  /** Where this turn's transcript lines begin. */
  private mark = 0

  constructor(private readonly options: TurnMachineOptions) {}

  private get port(): EnginePort {
    return this.options.port
  }

  private get director(): NarrativeDirector {
    return new NarrativeDirector(this.options.provider)
  }

  /** Load this world's narrative state; report an interrupted turn rather than assuming it finished. */
  async load(): Promise<LoadReport> {
    const loaded = await this.options.store.load(this.options.worldId, this.options.contentVersion)
    this.history = new NarrativeHistory()
    this.memory = new NpcMemoryBook()
    this.snapshots = []
    this.pending = undefined
    this.nextTurn = 1
    this.ready = true

    if (loaded.invalidated) {
      // §9.1: incompatible content invalidates narrative state only; the world save is untouched
      this.history.append({ role: 'system', text: 'This world changed incompatibly; the story begins again here.', tick: 0 })
      return { invalidated: true, ...(await this.persist().then(() => ({}), () => ({}))) }
    }

    if (loaded.state) {
      this.history = NarrativeHistory.from(loaded.state.history)
      this.memory = NpcMemoryBook.from(loaded.state.memory)
      this.snapshots = loaded.state.snapshots ?? []
      this.nextTurn = loaded.state.nextTurn ?? this.history.turns.length + 1
      if (loaded.state.pending?.phase === 'clarifying') this.pending = loaded.state.pending
    }

    if (loaded.interrupted) {
      // the engine may or may not have acted: record it plainly and let the player go on
      this.history.append({
        role: 'system',
        text: 'A turn was interrupted before its outcome was recorded. Nothing is claimed about what happened.',
        tick: loaded.interrupted.tick,
      })
      this.pending = undefined
      await this.persist()
      return { invalidated: false, interrupted: loaded.interrupted }
    }

    return {
      invalidated: false,
      ...(this.pending
        ? { pending: { ...this.pending, question: this.pending.question, choices: this.pending.candidates } }
        : {}),
    }
  }

  /** The player says something: the whole pipeline runs. */
  async submit(intent: string): Promise<TurnResult> {
    this.assertReady()
    const text = intent.trim()
    this.mark = this.history.lines.length
    const view = this.port.view()
    const turnId = `turn-${this.nextTurn++}`

    if (!text) {
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['Say what you mean to do.'],
      })
    }

    let pendingSaved = true
    try {
      await this.persistPending({ id: turnId, intent: text, proposal: null, question: '', candidates: [], phase: 'planning', tick: view.tick, chapter: view.chapter })
    } catch {
      pendingSaved = false
    }
    if (!pendingSaved) {
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['The turn could not be recorded, so it was not started.'],
      })
    }

    const context = assembleContext(view, this.memory, this.history, text, this.options.budget ?? DEFAULT_BUDGET)

    let proposal: ActionProposal
    try {
      proposal = await this.director.propose({ turnId, intent: text, context, view, seat: view.playerId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.recordTurn(
        { id: turnId, tick: view.tick, intent: text, outcome: 'failed', chapter: view.chapter },
        [{ role: 'system', text: `The narrator could not answer: ${message}`, tick: view.tick, turnId }],
      )
      this.pending = undefined
      const persisted = await this.persist().then(() => true, () => false)
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted, lines: this.linesSinceMark(),
        errors: [`The narrator could not answer: ${message}`],
      })
    }

    return this.runProposal(turnId, text, proposal, view, context)
  }

  private async runProposal(
    turnId: string,
    intent: string,
    proposal: ActionProposal,
    view: NarrativeWorldView,
    context: ContextPackage,
  ): Promise<TurnResult> {
    this.upsertCards(view)
    const mapping = mapProposal(proposal, {
      seat: view.playerId,
      visible: (id) => this.port.visible(id),
      verbs: this.options.verbs ?? VERBS,
      talkVerbs: (id) => this.port.talkVerbs(id),
    })

    if (mapping.status === 'clarification_required') {
      const choices = mapping.candidates.map((candidate, index) => ({
        index,
        label: describeProposal(candidate, view),
      }))
      this.pending = {
        id: turnId,
        intent,
        proposal,
        question: mapping.question,
        candidates: choices,
        phase: 'clarifying',
        tick: view.tick,
        chapter: view.chapter,
      }
      let persisted = true
      try {
        await this.persist()
      } catch {
        persisted = false
      }
      this.history.append({ role: 'narrator', text: mapping.question, tick: view.tick })
      return this.finish(turnId, {
        status: 'clarification_required',
        question: mapping.question,
        choices,
        committed: false,
        persisted,
        lines: this.linesSinceMark(),
      })
    }

    if (mapping.status === 'invalid') {
      return this.narrateAndRecord(turnId, intent, view, context, {
        rejection: mapping.errors.join('; '),
        outcome: 'rejected',
        status: 'rejected',
        errors: mapping.errors,
      })
    }

    if (mapping.status === 'no_action') {
      return this.narrateAndRecord(turnId, intent, view, context, { outcome: 'narrated', status: 'narrated' })
    }

    return this.execute(turnId, intent, view, context, mapping.action)
  }

  /** A validated act: snapshot, mark the turn executing, ask the engine, then describe the truth. */
  private async execute(
    turnId: string,
    intent: string,
    view: NarrativeWorldView,
    context: ContextPackage,
    action: EngineAction,
  ): Promise<TurnResult> {
    const pending = this.pending ?? {
      id: turnId, intent, proposal: null, question: '', candidates: [],
      phase: 'executing' as const, tick: view.tick, chapter: view.chapter,
    }
    pending.phase = 'executing'
    this.pending = pending

    // the pending marker must be written before the world changes: a torn turn is then visible
    try {
      await this.persist()
    } catch {
      this.pending = undefined
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['The turn could not be recorded, so the world was not touched.'],
      })
    }

    const token = this.port.snapshot()
    let outcome
    try {
      outcome = this.port.act(action)
    } catch (error) {
      this.pending = undefined
      const message = error instanceof Error ? error.message : String(error)
      this.recordTurn(
        { id: turnId, tick: view.tick, intent, outcome: 'failed', chapter: view.chapter },
        [{ role: 'system', text: `The action failed: ${message}`, tick: view.tick }],
      )
      const persisted = await this.persist().then(() => true, () => false)
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted, lines: this.linesSinceMark(),
        errors: [message],
      })
    }

    this.snapshots.push({ turnId, tick: view.tick, chapter: view.chapter, token })
    if (this.snapshots.length > SNAPSHOT_LIMIT) this.snapshots.splice(0, this.snapshots.length - SNAPSHOT_LIMIT)

    const digest = buildTurnDigest(
      turnId,
      outcome.revision,
      outcome.resolution,
      outcome.fx,
      outcome.before,
      outcome.after,
      {
        verb: action.verb,
        target: action.target.e,
        params: action.params,
        accepted: true,
      },
    )

    const narration = await this.director.narrate(
      { turnId, intent, context, view, digest, ...(this.pending?.candidates.length ? { clarification: { question: this.pending.question, choice: this.pending.intent } } : {}) },
      view,
    )

    this.remember(view, intent, digest)
    this.recordTurn(
      {
        id: turnId,
        tick: view.tick,
        intent,
        outcome: digest.resolution.defined ? 'executed' : 'failed',
        chapter: view.chapter,
        digest,
        text: narration.output.blocks.map((b) => b.text).join(' '),
      },
      outputLines(narration.output, view.tick, turnId),
    )

    this.pending = undefined
    const persisted = await this.persist().then(() => true, () => false)
    return this.finish(turnId, {
      status: digest.resolution.defined ? 'executed' : 'failed',
      output: narration.output,
      digest,
      committed: digest.mutated,
      persisted,
      lines: this.linesSinceMark(),
      ...(digest.resolution.defined ? {} : { errors: ['The world had no answer for that action.'] }),
    })
  }

  /** A turn with no engine act: talk, a question, or a refusal. */
  private async narrateAndRecord(
    turnId: string,
    intent: string,
    view: NarrativeWorldView,
    context: ContextPackage,
    extra: { rejection?: string; outcome: TurnOutcome; status: 'narrated' | 'rejected'; errors?: string[] },
  ): Promise<TurnResult> {
    const narration = await this.director.narrate(
      { turnId, intent, context, view, ...(extra.rejection ? { rejection: extra.rejection } : {}) },
      view,
    )
    this.recordTurn(
      {
        id: turnId,
        tick: view.tick,
        intent,
        outcome: extra.outcome,
        chapter: view.chapter,
        text: narration.output.blocks.map((b) => b.text).join(' '),
      },
      outputLines(narration.output, view.tick, turnId),
    )
    this.pending = undefined
    const persisted = await this.persist().then(() => true, () => false)
    return this.finish(turnId, {
      status: extra.status,
      output: narration.output,
      committed: false,
      persisted,
      lines: this.linesSinceMark(),
      ...(extra.errors ? { errors: extra.errors } : {}),
    })
  }

  /** The player answers a clarification: the chosen alternative is validated and run. */
  async clarify(index: number): Promise<TurnResult> {
    this.assertReady()
    const pending = this.pending
    if (!pending || pending.phase !== 'clarifying') {
      return this.finish(`turn-${this.nextTurn}`, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['There is no question waiting for an answer.'],
      })
    }
    this.mark = this.history.lines.length
    const choice = pending.candidates[index]
    const proposal = pending.proposal as ActionProposal | null
    if (!choice || !proposal || proposal.kind !== 'ambiguous' || !proposal.candidates[index]) {
      return this.finish(pending.id, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['That is not one of the offered choices.'],
      })
    }

    const view = this.port.view()
    const context = assembleContext(view, this.memory, this.history, `${pending.intent} ${choice.label}`, this.options.budget ?? DEFAULT_BUDGET)
    const mapping = mapProposal(proposal.candidates[index], this.validationCtx(view))

    // the question is answered; what follows is the chosen turn
    this.pending = { ...pending, intent: `${pending.intent} — ${choice.label}`, candidates: [choice], phase: 'clarifying' }

    if (mapping.status === 'invalid') {
      return this.narrateAndRecord(pending.id, this.pending.intent, view, context, {
        rejection: mapping.errors.join('; '),
        outcome: 'rejected',
        status: 'rejected',
        errors: mapping.errors,
      })
    }
    if (mapping.status !== 'ready') {
      this.pending = undefined
      return this.narrateAndRecord(pending.id, pending.intent, view, context, {
        rejection: 'the clarification did not settle on an action',
        outcome: 'rejected',
        status: 'rejected',
        errors: ['the clarification did not settle on an action'],
      })
    }
    return this.execute(pending.id, this.pending.intent, view, context, mapping.action)
  }

  /**
   * Regenerate a turn: restore the pre-turn snapshot first (§9.2), then run the same intent again.
   * A turn with no snapshot (nothing to restore) is refused rather than replayed over a changed world.
   */
  async regenerate(turnId: string): Promise<TurnResult> {
    this.assertReady()
    const snapshot = this.snapshots.find((s) => s.turnId === turnId)
    const turn = this.history.turns.find((t) => t.id === turnId)
    if (!turn) {
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['There is no such turn to regenerate.'],
      })
    }
    if (!snapshot) {
      return this.finish(turnId, {
        status: 'failed', committed: false, persisted: false, lines: [],
        errors: ['That turn left no snapshot to restore; it is not replayed over a changed world.'],
      })
    }

    this.port.restore(snapshot.token)
    this.snapshots = this.snapshots.filter((s) => s.turnId !== turnId)
    this.history.lines = this.history.lines.filter((line) => line.turnId !== turnId)
    this.history.turns = this.history.turns.filter((t) => t.id !== turnId)
    this.mark = this.history.lines.length
    this.nextTurn = Math.max(1, this.nextTurn - 1)

    const result = await this.submit(turn.intent)
    return result
  }

  /** What the UI shows: the transcript, the chapter, and any open question. */
  snapshot(): NarrativeSnapshotView {
    return {
      lines: this.history.lines.slice(-60),
      chapter: this.history.chapter,
      summary: this.history.summary,
      turns: this.history.turns.length,
      memories: this.memory.size,
      ...(this.pending
        ? { pending: { question: this.pending.question, choices: this.pending.candidates } }
        : {}),
    }
  }

  /** Everything a narrator may see this turn (the UI's "what the model saw" view). */
  contextFor(intent: string): ContextPackage {
    const view = this.port.view()
    return assembleContext(view, this.memory, this.history, intent, this.options.budget ?? DEFAULT_BUDGET)
  }

  private validationCtx(view: NarrativeWorldView) {
    return {
      seat: view.playerId,
      visible: (id: string) => this.port.visible(id),
      verbs: this.options.verbs ?? VERBS,
      talkVerbs: (id: string) => this.port.talkVerbs(id),
    }
  }

  private assertReady(): void {
    if (!this.ready) throw new Error('the narrative turn machine was not loaded')
  }

  private upsertCards(view: NarrativeWorldView): void {
    for (const npc of view.npcs) {
      this.memory.upsertCard({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        temperament: npc.temperament,
        regard: npc.regard ?? 0,
        map: view.mapId,
      })
    }
  }

  /** What the people here take from this turn. Only relevant things are kept. */
  private remember(view: NarrativeWorldView, intent: string, digest: OutcomeDigest): void {
    if (!digest.mutated) return
    const target = digest.proposal ? view.nearby.find((e) => e.id === digest.proposal?.target) ?? view.npcs.find((n) => n.id === digest.proposal?.target) : undefined
    const what = target ? `${view.playerName} ${digest.proposal?.verb ?? 'acted on'} ${target.name}` : `${view.playerName} acted`
    const changes = digest.changes.map((c) => c.summary).join('; ')
    for (const npc of view.npcs) {
      this.memory.record(npc.id, changes ? `${what}: ${changes}` : what, {
        tick: view.tick,
        kind: 'event',
        salience: 0.6,
      })
      // a thing said to them is remembered more sharply than a thing done near them
      if (digest.facts.some((f) => f.who === npc.id && f.text) || intent.toLowerCase().includes(npc.name.toLowerCase())) {
        this.memory.record(npc.id, `“${intent}”`, { tick: view.tick, kind: 'interaction', salience: 0.85 })
      }
    }
  }

  private recordTurn(turn: { id: string; tick: number; intent: string; outcome: TurnOutcome; chapter: string; digest?: OutcomeDigest; text?: string }, lines: TranscriptLine[]): void {
    this.history.turns.push(turn)
    this.history.append({ role: 'player', text: turn.intent, tick: turn.tick, turnId: turn.id })
    for (const line of lines) this.history.append(line)
    this.history.maybeSummarize(turn.tick)
  }

  private linesSinceMark(): TranscriptLine[] {
    return this.history.lines.slice(this.mark)
  }

  private finish(turnId: string, result: Omit<TurnResult, 'turnId'>): TurnResult {
    return { turnId, ...result }
  }

  private async persistPending(pending: PendingTurn): Promise<void> {
    this.pending = pending
    await this.persist()
  }

  private async persist(): Promise<void> {
    await this.options.store.save({
      version: 1,
      worldId: this.options.worldId,
      contentVersion: this.options.contentVersion,
      history: this.history.toJSON(),
      memory: this.memory.toJSON(),
      ...(this.pending ? { pending: this.pending } : {}),
      snapshots: this.snapshots,
      nextTurn: this.nextTurn,
    })
  }
}

/** A choice's words, built from the proposal alone. */
export function describeProposal(proposal: ActionProposal, view: NarrativeWorldView): string {
  if (proposal.kind !== 'action') return proposal.kind === 'no-action' ? proposal.reason : 'something else'
  const name = proposal.target.e === view.playerId
    ? 'yourself'
    : [...view.npcs, ...view.nearby].find((e) => e.id === proposal.target.e)?.name ?? proposal.target.e
  return `${proposal.verb} ${name}`
}

function outputLines(output: NarrativeOutput, tick: number, turnId: string): TranscriptLine[] {
  return output.blocks.map((block) =>
    block.speaker.kind === 'character'
      ? { role: 'character' as const, text: block.text, speakerId: block.speaker.entityId, tick, turnId }
      : { role: 'narrator' as const, text: block.text, tick, turnId },
  )
}
