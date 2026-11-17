# Implementation manual

Everything lives in two packages. `packages/narration` is pure TypeScript (no DOM, no engine import at runtime,
no network); `packages/runtime` is the browser/Worker shell that supplies the world and the DOM.

## 1. Package layout

```
packages/narration/src
  contracts/   ActionProposal, NarrativeOutput, RulePatch, validators, OutcomeDigest + buildDigest
  engine/      EnginePort + the view/outcome/action types the narration layer is allowed to see
  act/         proposal → EngineAction, ambiguity detection (ProposalMapping)
  director/    intent classification, provider calls, output validation + fallback
  context/     budgeted, ordered context assembly
  memory/      NpcCard, MemoryEntry, NpcMemoryBook (recall, remember, prune)
  history/     transcript, TurnRecord, rolling summary, chapters, VERBATIM_TURNS = 10
  digest/      digest → fallback prose, digest facts
  provider/    NarrativeProvider interface + deterministic MockNarrativeProvider
  persistence/ NarrativeStore, MemoryNarrativeStore, KeyValueNarrativeStore, SNAPSHOT_LIMIT = 10
  turn/        NarrativeTurnMachine (the 11-stage lifecycle), TurnResult, clarify/regenerate/load
  index.ts     public exports
packages/runtime/src
  narrative/   RuntimeNarrativePort (real Game) + createNarrativeRuntime
  ui/narrative.ts, ui/narrative.css   the Story panel
  worker.ts    startNarrative(), message handling, narrativeView()
  protocol.ts  wire types for the narrative messages
```

## 2. Key APIs

| API | Purpose |
| --- | --- |
| `new NarrativeTurnMachine({ port, provider, store, worldId, contentVersion?, budget?, verbs? })` | One per loaded game. |
| `machine.load(): Promise<LoadReport>` | Restore this world's narrative state. `{interrupted, invalidated, pending}`. |
| `machine.submit(intent): Promise<TurnResult>` | Run a full turn from typed player input. |
| `machine.clarify(index): Promise<TurnResult>` | Resolve a pending ambiguous proposal. |
| `machine.regenerate(turnId): Promise<TurnResult>` | Restore the pre-turn snapshot and re-run. |
| `machine.view(): NarrativeSnapshotView` | Transcript, chapter, summary, turn count, pending question. |
| `assembleContext(view, memory, history, query, budget?)` | Build the ordered context package. |
| `validateActionProposal(p, ctx)` / `validateNarrativeOutput(o, ctx)` / `validateRulePatch(p, ctx)` | Structural validation before anything is used. |
| `mapProposal(proposal, ctx)` | `ready` / `clarification_required` / `no_action` / `invalid`. |
| `buildDigest(outcome, view)` | Facts and changes from the engine's own resolution. |
| `NpcMemoryBook.remember(npc, entry)` / `.recall(npc, query, tick)` | Per-NPC memory. |
| `KeyValueNarrativeStore(kv, prefix)` | Persists under `prefix:<worldId>|<contentVersion>` using `{get,set,del}`. |
| `createNarrativeRuntime({game, worldId, contentVersion, kv, snapshot, restore})` | Wires the machine to a live `Game`. |

## 3. Adding a live provider

Implement two methods and pass the instance where `createNarrativeRuntime` builds `MockNarrativeProvider`:

```ts
export interface NarrativeProvider {
  readonly name: string
  propose(request: ProposalRequest): Promise<ActionProposal>
  narrate(request: NarrativeRequest): Promise<NarrativeOutput>
}
```

`ProposalRequest` carries the intent, the world view, the assembled context and the pending clarification (if
any). `NarrativeRequest` carries the intent, view, context and the `OutcomeDigest` of the executed action.
Return values are **untrusted**: the machine validates both. See `LIVE_AI_ACTIVATION.md`.

## 4. Changing what the narrator sees

`context/index.ts` pushes `ContextSection`s in priority order. Add a section with an `id`, `priority`,
`title` and `text`, and it will be budgeted like the others. `DEFAULT_BUDGET` caps tokens per section and in
total; `ContextBudget` can be overridden per machine via `TurnMachineOptions.budget`.

## 5. Changing what the engine can be asked to do

`VERBS` mirrors the engine's seven verbs. If the engine gains a verb, add it to `VERBS` and to
`proposalToAct` (which maps a proposal onto `{verb, target, params}`), and add a test in
`packages/narration/test/conformance.test.ts`. Validation reads `ctx.visible` and `ctx.talkVerbs` from the port,
so nothing else changes.

## 6. The UI

`NarrativePanel` (constructed in `main.ts` right after `send`) owns:

* the floating **Story** button (shows a turn count),
* the transcript with speaker names (narrator / player / NPC),
* clarification buttons (one per candidate, plus a "none of these" rejection),
* Retry (regenerate the last turn) and the status line (`The world changed and the turn was kept.`,
  `The world refused that.`, errors),
* Escape to close, and a dev handle at `window.lsw.narrative`.

Messages the panel sends: `{t:'narrative', text}`, `{t:'narrativeClarify', index}`, `{t:'narrativeRegenerate', turnId}`.
Messages it receives: `{t:'narrative', view}`.

## 7. Runtime startup order (important)

`worker.ts` posts `{t:'ready'}` first and only then calls `startNarrative()` (fire-and-forget). Narrative
loading must never delay the game: an early implementation awaited it before `ready`, which stranded the client
behind the title backdrop when the story store was slow. Keep it after `ready`.

The narrative record is per world base + content version. `restoreGame()` (used by regeneration) reloads the save
and re-fetches the chunks the save refers to, then applies it; the port's `restore` delegates to it.

## 8. Testing

```
npx vitest run packages/narration/test       # 37 unit/integration tests
npx tsc -p packages/narration                # package type check
npx tsc -p packages/runtime                  # runtime type check
npm run typecheck:game                       # all 14 game projects
npm run build                                # web bundle
```

Tests use `FakeEngine` (`packages/narration/test/helpers.ts`) and `ScriptedStore`; no browser, network or
credentials are needed. Add a scenario in `provider/mock.ts` + a test in `turn.test.ts` when a new behaviour
must be exercised through the real orchestration.

## 9. Extension points that are deliberately closed

* No API on the narrative layer writes world state.
* `RulePatch` is validated but not applied; wiring it would require a content-versioned rule workflow and its
  own permission check (mission §4.2).
* Species/looks are untouched: MVP scope is Class A only (mission §9.5).
