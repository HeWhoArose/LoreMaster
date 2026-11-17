# Integrated architecture

One application. OpenWorld simulates; the narration package narrates; the runtime worker joins them; the
DOM panel shows the result. There is no second server and no second app.

```
┌──────────────────────────── browser / Capacitor WebView ────────────────────────────┐
│ main.ts  (DOM)                                                                       │
│   NarrativePanel ── send({t:'narrative'…}) ──┐            ┌── {t:'narrative', view}  │
│   HUD / scene / cover                         │            │                          │
│                                               ▼            │                          │
│  ┌──────────────────────── Web Worker (worker.ts) ──────────────────────────────┐    │
│  │  Game (OpenWorld engine, authoritative)                                     │    │
│  │      ▲ Engine.act(...)                    │ Game.save({whole:true})          │    │
│  │      │                                    ▼                                 │    │
│  │  RuntimeNarrativePort (packages/runtime/src/narrative)                      │    │
│  │      │ view / snapshot / restore / visible / talkVerbs                      │    │
│  │      ▼                                                                      │    │
│  │  NarrativeTurnMachine (packages/narration)                                  │    │
│  │   director ─ context ─ act ─ digest ─ memory ─ history ─ persistence        │    │
│  │      │ provider (MockNarrativeProvider; live providers later)               │    │
│  │      ▼ KeyValueNarrativeStore (kvGet/kvSet → IndexedDB)                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. Authority boundary

* The narrative package never imports the engine's runtime. It sees the world only through `EnginePort`
  (`packages/narration/src/engine/port.ts`): `view()`, `act(action)`, `snapshot()`, `restore(id)`, `visible(id)`,
  `talkVerbs()`.
* `EngineAction` carries only `{verb, target?, params?}` where `verb` is one of the engine's seven verbs.
  There is no "set state" action.
* `RuntimeNarrativePort.act` calls `game.engine.act(...)` and returns the engine's `Resolution` wrapped as an
  `EngineOutcome`. `committed` is true only when the engine's resolution says it defined/executed.
* `NarrativeOutput` has no mutation field. `RulePatch` is a separate, validated type and is **not** applied by
  the turn machine; nothing in the pipeline calls it.
* The model cannot report success: the digest is built from the engine's `Resolution`, and the fallback prose
  (`fallbackLine`) is derived from that digest, not from model text.

## 2. The turn lifecycle (all 11 stages, one machine)

`NarrativeTurnMachine.submit(intent)` in `packages/narration/src/turn/index.ts`:

| # | Stage | Where |
| --- | --- | --- |
| 1 | Player intent + classification (`question`, `dialogue`, `movement`, `interaction`, `combat`, `other`) | `director/index.ts` `classifyIntent` |
| 2 | Context assembly (budgeted, ordered sections) | `context/index.ts` `assembleContext` |
| 3 | Director decides whether a proposal is needed and asks the provider | `director/index.ts` `NarrativeDirector.propose` |
| 4 | `ActionProposal` (validated: seat authority, visible target, closed params, known verb) | `contracts/index.ts` `validateActionProposal` |
| 5 | Validation + ambiguity → `clarification_required` with choices (never auto-picks) | `act/index.ts` `mapProposal` |
| 6 | Execution through the OpenWorld engine | `turn/index.ts` `execute` → `port.act` |
| 7 | Resolution captured verbatim (`defined`, `rule`, `leaf`, `fault`) | `engine/port.ts` `EngineOutcome` |
| 8 | Digest from the actual outcome (facts, changes, fx) | `contracts/index.ts` `buildDigest`, `digest/index.ts` |
| 9 | `NarrativeOutput` from context + digest + NPC cards; validated speaker attribution | `provider` `narrate` + `validateNarrativeOutput` |
| 10 | NPC memory + conversation history updated from the real outcome | `memory/index.ts`, `history/index.ts` |
| 11 | Persistence of the completed turn | `persistence/index.ts` `save` |

The fallback path is not a bypass: when the provider proposes nothing, the turn is `narrated` (no world
change) and still goes through context → provider → validation → history → persistence. When the provider
fails, the turn is `failed`, nothing is committed, and no transcript line claims otherwise.

### 2.1 Result states

`TurnResult.status` is one of `executed`, `narrated`, `clarification_required`, `rejected`, `failed`, and
carries `turnId`, `committed`, `persisted`, `lines`, and — where relevant — `output`, `digest`, `question`,
`choices`, `errors`. The UI reads these directly; it never infers success.

### 2.2 Ambiguity

`mapProposal` returns `{status:'clarification_required', candidates}` when the proposal does not name a target
and at least two entities in the view could be meant (the view's `nearby` list). The machine stores a
`PendingTurn` with `phase:'clarifying'` **and its question/choices**, and returns them to the UI. `clarify(index)`
re-runs the proposal with the chosen target, then the same execute/digest/narrate/persist path. An index that
does not exist, or a candidate that has since become invisible, yields `rejected` — never a silent pick.

## 3. Runtime call sites

| Concern | File |
| --- | --- |
| Create the machine for a started game | `packages/runtime/src/worker.ts` `startNarrative()` (after `ready`, fire-and-forget) |
| Project the live world | `packages/runtime/src/narrative/index.ts` `RuntimeNarrativePort.view()` |
| Execute an action | `RuntimeNarrativePort.act()` → `engine.act` |
| Snapshot / restore | `Game.save({whole:true})` deep clone; `restoreGame()` uses `Game.load` + chunk refetch |
| Player input | `packages/runtime/src/protocol.ts` `{t:'narrative', text}` handled in `worker.ts` |
| Clarification / regenerate | `{t:'narrativeClarify', index}`, `{t:'narrativeRegenerate', turnId}` |
| View for the panel | `worker.ts` `narrativeView()` → `{t:'narrative', view}` |
| Panel | `packages/runtime/src/ui/narrative.ts`, styles in `narrative.css`, instantiated in `main.ts` |

## 4. Persistence and recovery

* Narrative state is a **separate record** from the save: `KeyValueNarrativeStore` under
  `narrative:<worldId>|<contentVersion>` in the same IndexedDB database the runtime already uses (`kvGet`/`kvSet`).
* State contains: `history` (verbatim turns, rolling summary, chapters), `memory` (per-NPC entries and cards),
  `snapshots` (last 10 pre-turn snapshots), `pending`, `nextTurn`, `contentVersion`.
* A turn is written as `pending` **before** the engine acts and as completed state **after** the narrative is
  recorded. If the app dies in between, `load()` reports the interrupted turn, appends a system line saying the
  world may or may not have changed, clears it, and play continues. An interrupted turn is never shown as done.
* Regeneration (`regenerate(turnId)`) is allowed only for turns that have a pre-turn snapshot; it restores that
  snapshot through the port, drops the turn's transcript lines, and re-runs the turn from the original intent.
* `contentVersion` mismatch invalidates **narrative state only** (`load()` returns `invalidated`, writes a fresh
  empty state). The save file, inventory and world are untouched — the player keeps their game.
* Snapshots are capped at `SNAPSHOT_LIMIT = 10`; the oldest is dropped first.

## 5. Context and NPC intelligence

* `assembleContext(view, history, memory, budget)` produces ordered `ContextSection`s with a token estimate per
  section and per section caps (`DEFAULT_BUDGET`). Sections that do not fit are truncated, never concatenated
  unbounded.
* Each `NpcCard` comes from the entity's own `npc.person` (temperament, voice) and `npc.memory`
  (regard, deeds), plus that NPC's own `MemoryEntry` list. `NpcMemoryBook.recall(npc, query, tick)` scores
  entries by keyword overlap and recency.
* Speaker attribution is structural: `NarrativeOutput.blocks` may only name NPCs present in the view
  (`validateNarrativeOutput` rejects an unknown or absent speaker). A model cannot voice an NPC who is not there.
* When the place changes, `NarrativeHistory` opens a `ChapterRecord` with the old place's summary, so chapter
  memory survives location changes.

## 6. Live AI status

Only `MockNarrativeProvider` is instantiated. It implements the same `NarrativeProvider` interface a live
provider will implement (`propose`, `narrate`), and its scenarios are the ones the tests drive. No network
call, credential or configuration is required to run the game or the tests. See `LIVE_AI_ACTIVATION.md`.
