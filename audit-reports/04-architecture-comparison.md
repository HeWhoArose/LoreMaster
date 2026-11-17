# REPORT 04 – Architecture Comparison

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. High-level architecture shapes

| Dimension | OpenWorld | Corvus Story Core |
|---|---|---|
| **Application type** | Multi-package npm workspace: engine + ai + runtime + editor + modules + format + bridge + stdlib; games/openworld + starter | Node/Express + React/Vite single-process localhost app |
| **Process model** | Headless engine (Node TS, runs in Web Worker), browser player (Phaser 4), optional editor (Electron) | Single Express server + Vite dev server; client renders in browser |
| **Data ownership** | Engine is the *authoritative* kernel; all mutations flow through validated rule patches (`mod.ts:1313` `validatePatch`) | No single authoritative source; world state is a free-form JSON document persisted to disk |
| **Mutation model** | AI never emits state deltas directly. AI proposes `Patch` → `validatePatch` checks id hygiene, tag locality, economy LP → engine applies in sandbox (`sandbox.ts:26`) → `Resolution` resolves the rule → engine writes via `Writer` guard (`world.ts:88`) | Model (narrator + GM) emits JSON deltas → `stateManager.applyGameMasterOutput` mutates in-memory state and writes files (not transactional, no schema validation) |
| **World model** | Entity–containment graph (`types.ts:468` `Entity`, `Place` union `on|in|held|in-region`); cells as pseudo-entities (`cells.ts:15`); maps split into static file data + per-instance diff (`sparse.ts`); 1,024-map world; sparse save ~89 KB | World state is `WorldInfo` + `PlayerCharacter` + `NPCCharacter[]` + `ChatMessage[]` + `WorldState{events, locationStates}` – all free-text keys and values; no containment, no cells, no map structure |
| **Simulation** | Deterministic tick-based simulation (`engine.ts:103` `class Engine`): queue/offer/flush/dispatch/resolveEvent/run/replay/settle; 10 Hz tick; weather, RNG, deterministic calendar | No simulation loop; turn-based interactive fiction; state changes only via GM JSON output |
| **Rules engine** | First-class rule language (`rules.ts:318-319` `isDo`/`isHole` tree, `walk` evaluation, `ROLES` = host/actor/target/instrument/other/item/source); `Resolution` = `{defined, rule?, leaf?, hole?, open?, fault?}`; specificity ordering (`specOf:432`, `compareSpec:442`, `rulesTie:1926`); hole-based "undefined" is a stable key | No rules engine; GM is asked to "emit structured JSON describing state changes" with prompt "Only emit changes that are CLEARLY implied by what happened" (`gameMaster.ts:61`) |
| **AI interaction protocol** | `ModPort` (`mod.ts:471` implements `UndefinedSink`): `ModRequest` built from **one hole and one class of event**; `AGAIN_AFTER = 3` / `AGAIN_WITHIN = 1200`; per-class question, not per-turn | Two-pass per turn: (1) orchestrator → narrator/character prose stream; (2) `runGameMaster` separate non-streaming JSON call; no notion of "ask again" |
| **Provider layer** | 8 providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom); `Model` shape (`ai/src/models/model.ts`); per-category capability detection (`ai/src/modder/detect.ts:121`); cost/usage/hedging | Single `LMStudioSettings` shape: `url`, `model`, `apiKey`, `temperature`, `topP`, `maxTokens`; one model for every task; no capability metadata, no cost tracking, no usage reporting |
| **Token budgeting** | `estimateTokens` = `ceil(chars/4)`; budget-based assembly with ordered degradation (`contextAssembler.ts:124-145`); drop summaries oldest-first, then NPCs from least relevant end | Same `ceil(chars/4)` estimate; budget-based assembly same priority order; drop summaries oldest-first, then NPCs from least relevant end |
| **Save format** | `game.ts:202` writes `{version:1, world: worldVersion, state, library: learnedJSON() (or whole), savedAt, codex}`; version gate on load; sparse saves ~89 KB over 1,024 maps | Per-chapter JSONL messages; separate summary files; `world-state.json` with events; no version gate; no sparse optimization |
| **Editor** | Real browser + Electron app with modes: map, people, database, rules, story, holes, locale, assets; undo/store model (`CLAUDE.md`); local HTTP service (`editor/src/server/`) | No dedicated editor; client is a React chat UI; no mode system, no undo/store |
| **Test infrastructure** | 241 `*.test.ts` files; CI `.github/workflows/check.yml` with jobs `check_test`, `no_ai`; `writes.test.ts` tests write guard (exists, not run) | Zero tests; no CI; no lint; no framework |
| **Authentication / authorization** | None documented; CORS not evaluated in audit | `cors({ origin: true, credentials: true })` – reflects any origin; no auth of any kind; API keys in plaintext `config.json` |
| **Spatial model** | Full: maps, cells, containment, chunks, dormant maps, inbox, quarantine (`world.ts:50`, `sparse.ts`, `chunk.ts`) | None; "locationStates" are free-form `Record<loc, string>` with no structural meaning |
| **Combat** | Kernel: blows (`blows.ts:11-36`), mainhand/offhand slots, `wear:weapon`/`wear:arm` (`types.ts:664`); damage resolution in engine | None; the word "quest" does not occur in server or client source |
| **Quests / story script** | `quests.ts:177,200,268`; story steps with triggers; scenes/beats; writes story props only (`story.ts:20,51`) | No quest system; the word "quest" does not occur in server or client source; no objectives, no completion conditions |
| **Relationships / factions** | `modules/society`; deeds, regard, gossip, watches, prices, law (`types.ts:855,890,920,964,443`) | `NPCCharacter.relationships: Record<id, {name,disposition,notes}>`; free-text disposition only; no mechanized effects, no faction system |
| **Inventory & economy** | Physical stacks keep identity (`stacks.ts`); affixes/sets (`affixes.ts`); crafted items via `controls.ts` craft path; economy LP in `ai/src/checks/economy.ts` | `PlayerCharacter.inventory[{name,description,quantity}]`; `PlayerCharacter.money`; no price model, no affordability check; stats can go negative; money floors at 0 |
| **Character appearance** | `LookTable` with 4 bodies (woman/man/girl/boy), 12 slots, seeded generator (`generateLook(seed, who, pins)`); 24A-36 hand-drawn bases; per-part `bodies` restriction | `NPCCharacter.image{basePrompt, coreAppearance, defaultOutfit, baseNegative, identitySeed, portraitPath}`; free-form text description; no part-composed look system |
| **Memory** | Entity-level `boss`, `script`, `script` fields; memory retrieval not tail-based in core engine | `NPCCharacter.memory[]` flat array; `slice(-5)` in narrator mode, `slice(-8)` in character mode; no salience, no decay, no relevance scoring |
| **Chapter summarisation** | Threshold-based oldest-half (`summarizer.ts:89`); marks messages `summarized` | Threshold-based oldest-half (`summarizer.ts:89`); marks messages `summarized` – same policy |
| **Two-pass narrator** | Not present | Yes: (1) narrator/character prose stream; (2) independent `runGameMaster` JSON call; `buildNarratorSystemPrompt` blocks `[Narrator]`, `[Character: Name]` |
| **Speaker-tagged output** | Not present (rule-based, not LLM-generated dialogue) | Yes: `splitIntoSpeakerBlocks` splits on `[Narrator]` / `[Character: Name]` tags; case-insensitive name matching; coalesce consecutive same-speaker blocks |
| **Provenance cascade** | Not explicitly; `sourceMessageIds` on messages | Yes: `stale`-marking on edit (`stateManager.ts:512,542`), cascade-delete on message deletion, regen invalidation |
| **Per-game lock** | `withGameLock` per-game promise chain (`orchestrator.ts:118`, `fileManager.ts:411`) | Same: per-game lock keyed by `gameId`; two turns of one game cannot interleave |
| **Atomic file writes** | `writeJson`/`writeFileAtomic`: `.<pid>-<ts>-<rand>.tmp`, `fsync`, `rename` (`fileManager.ts:182-223`) | Same: atomic writes with tmp+fsync+rename |
| **Schema validation** | `format/src/project.ts:37` `FORMAT = 1`; `compile.ts:141` `compile()`; `check.ts:26` `checkProject()` returns `Problem[]`; `ruleProblems` (`:178`); `ties` (`:199`); `validatePatch` (`mod.ts:1313`) lenient but enforced | No schema validation of GM output beyond array-shape checks; `parseGameMasterOutput` lenient: strip fences, take first `{` … last `}`, `JSON.parse`, coerce keys to `[]` if not array; empty object on any failure |
| **Versioning / migration** | Save format version gate (`game.ts:70-71` refuses foreign content version); game carries `migrate*.ts` files | No version gate, no migration framework; `readJson` returns `null` on parse error, silently resets state |
| **Security model** | CORS not evaluated; no auth documented; API key handling not inspected | `cors({ origin: true, credentials: true })`; no auth; API keys in plaintext `~/corvus-data/config.json`; path traversal via `gameId`; 50 MB JSON bodies; no input validation |
| **Extensibility surface** | `modules/` (classes, kits, loot, needs, society, boons, waypoints, fishing); `rules.ts` hole system; `lookProblems` for looks; `newTypeProblems`/`newStatusProblems` in `validatePatch` | Adding NPCs via `NPCCharacter` shape; adding messages via `ChatMessage`; no mechanism for adding rules, quests, or world-model constructs |

---

## 2. Side-by-side component comparison

| Component | OpenWorld disposition | Corvus disposition | Fusion decision |
|---|---|---|---|
| **Deterministic kernel** | C (COMPLETE) | N/A (no kernel) | PRESERVE OpenWorld kernel |
| **World-entity model** | C (22,643 LOC engine) | N/A | PRESERVE; extend with narrative tags |
| **Rules engine + holes** | C (rules.ts) | N/A | PRESERVE; Corvus's GM can query rule holes |
| **Write guard / sandbox** | C (world.ts:88, sandbox.ts:26) | N/A | PRESERVE; core safety boundary |
| **Provider abstraction** | C (8 providers, detect.ts:121, quality.ts) | X (single LMStudioSettings, no tool calling, no retries) | SUPERSEDE with OpenWorld; do not carry Corvus pattern forward |
| **Narrator/GM two-pass** | Partially (rule proposals only) | C (proven orchestration shape) | ADAPT Corvus shape; insert beside ModPort |
| **Speaker-tagged output** | N/A (authored lines) | C (splitIntoSpeakerBlocks) | ADAPT Corvus splitter; integrate with OpenWorld's rule engine |
| **Context assembler + budget** | C (contextAssembler.ts) | C (same algorithm, cruder estimator) | ADAPT both; real token accounting from OpenWorld |
| **Provenance cascade** | Partial (sourceMessageIds on messages) | C (stale/cascade/delete/regen) | ADAPT Corvus cascade; apply to OpenWorld messages |
| **Per-game lock + atomic writes** | C (fileManager.ts) | C (same patterns) | PRESERVE; both have correct implementations |
| **NPCMemoryEntry shape** | Partial (Entity.boss, Entity.script) | C (types/index.ts:77-102 with sourceMessageIds, stale) | ADAPT Corvus shape; replace flat slice(-5) with relevance-aware retrieval |
| **Chapter summariser** | C (summarizer.ts) | C (same) | PRESERVE both; keep OpenWorld's version-gated approach |
| **Game data model** | C (ontology, rules, maps, people, quests, story) | REIMPLEMENT (text-RPG only; cannot host simulated world) | REIMPLEMENT Corvus's model away; keep OpenWorld |
| **GM delta application** | N/A (validated patches) | REIMPLEMENT (unvalidated deltas forbidden by brief) | REPLACE with OpenWorld's validatePatch; do not carry Corvus pattern |
| **CORS + auth** | Not verified | REMOVE pattern (any-origin + credentials, no auth) | REMOVE; unified project must not replicate this vulnerability |
| **Path safety in game ids** | Not verified (but sparse patterns suggest care) | REMOVE pattern (path traversal via gameId) | FIX; validate all gameId/slug inputs |

---

## 3. Structural conclusion

OpenWorld and Corvus occupy **non-overlapping but complementary layers**:

- **OpenWorld** provides the **authoritative simulated world**: kernel, world state, rules, effects, determinism, sparse saves, quests/story, society, the format compiler/validator, the provider/model-routing layer, and the write guard/sandbox.
- **Corvus** provides the **narration/orchestration shape**: two-pass narrator/GM separation, speaker-tagged multi-NPC output with one HTTP call, context budget with ordered degradation, provenance cascade (stale/cascade/delete/regen), per-game lock, atomic file rolls, chapter summarisation, and NPC memory provenance.

The correct integration approach is **not to merge two equal schemas**, but to **embed Corvus's narration shape beside OpenWorld's ModPort**: a new "narration port" that takes an already-resolved engine outcome and turns it into prose, and takes a player's conversational intent and turns it into an `Engine.act(...)` attempt — never a direct state write.

The unified project's AI vocabulary must be exactly: (a) a rule patch through `validatePatch`, (b) an act request the engine resolves, (c) prose. Never a delta to `WorldState`.

---