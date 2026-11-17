# REPORT 01 – Executive Summary

**Audit phase:** read-only reverse engineering (no implementation started).
**Audit date:** 2026-11-16.
**Output directory:** `C:\Dev\Portal\audit-reports\` (outside both source repositories).
**Audited repositories:**
- **Project A – OpenWorld** (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`
- **Project B – Corvus Story Core** (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`

---

## 1. Project characterization

| Aspect | OpenWorld | Corvus Story Core |
|---|---|---|
| **Size** | 689 MB (pixel art, audio, fonts committed; no Git LFS) | ~15 MB (source-only, no committed art) |
| **LOC** | ~102 kLOC across 9 packages + 2 games | ~13.8 kLOC (server, client, shared types) |
| **Primary language** | TypeScript (Node 24, npm workspaces) | TypeScript (Node 18+, Express + React/Vite) |
| **License** | MIT (with explicit asset carve-outs; see Report 08) | MIT |
| **Code model** | Deterministic kernel engine + AI modder pipeline + browser runtime + editor | Local-first interactive-fiction loop; world state as free-form JSON |
| ** runtime** | Headless engine, Phaser 4 player, Web Worker kernel | localhost Express server + Vite React client |
| **Tests** | 241 `*.test.ts` files; CI runs typecheck + full suite + `no-ai` job | Zero tests; no CI; 179 KB CHANGELOG only |
| **Build status** | Not verified (no `npm install` run) | Not verified (no build run) |

---

## 2. Core architectural findings

### OpenWorld
- **Engine is a pure deterministic kernel** (`packages/engine/src/index.ts`, `rng.ts`): mulberry32 PRNG, every run replayable from `WorldState.rng`. No hidden DOM/AI state.
- **World state is one serialisable object** (`types.ts:1666` `WorldState`): player, entities, maps, RNG, counters. Even the RNG state lives in world state.
- **Undefined interactions are first-class** (`rules.ts:453` `Resolution`, `:474` `holeKey`, `:477` `placeKey`, `:480` `patchKey`): the engine has a stable key for gaps in the rule coverage. Learned answers stored per `type|kind|hole|tier` and composed (`rules.ts:534` `compose`, `:613` `RuleLibrary`).
- **AI emits validated *rules*, not state mutations** (`mod.ts:1313` `validatePatch`): whatever the AI sends, the answer is a result, never a throw. `check()` enforces id hygiene, tag locality, economy LP, and condition-reference checks.
- **Write guard** (`world.ts:88` `Writer`, `:91` `WriteError`): writes outside an outcome throw; enforced by `CLAUDE.md` and tested in `writes.test.ts` (exists, not run).
- **Sandbox replay** (`sandbox.ts:26` `buildSandbox`): derived tests before accept; the AI's patch is validated in a sandbox before execution.
- **Provider list** (`ai/src/models/providerList.ts:28` `PROVIDERS`): 8 providers incl. OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom.
- **Per-category model capability detection** (`ai/src/modder/detect.ts:121` `Detector`, `engine/src/quality.ts`): per-category levels + probe-based recommendation.
- **241 test files**; CI has `check_test`, `no_ai` jobs (pass/fail NOT VERIFIED in this phase).
- **689 MB of committed art/audio** not fetched in this audit; art pipeline uses Python + ComfyUI.
- **Single-player only**; no networking layer found.

### Corvus Story Core
- **~13.8 kLOC localhost web app** (Express + React/Vite) that runs a local-first interactive-fiction loop.
- **World state is a JSON document of free-form strings** – no spatial model, no rules engine, no combat, no quests.
- **Two-pass narration pipeline**: (1) orchestrator saves user message, assembles context, streams `chatCompletion` with `ThinkStreamStripper`/`stripProseReasoning` → `splitIntoSpeakerBlocks` → persist blocks; (2) independent `runGameMaster` call with fixed JSON-extraction system prompt → `parseGameMasterOutput` (lenient, no schema validation).
- **CORS reflects any origin with credentials** (`server/index.ts:63-68`): any web page can `fetch('http://127.0.0.1:3000/api/...')` and read/modify every game, save, character and setting on the machine.
- **API keys stored in plaintext** in `~/corvus-data/config.json` (`LMStudioSettings.apiKey`, `TTSSettings.apiKey`), returned to the client by settings route.
- **Path traversal via `gameId`** (`fileManager.ts:745`, `routes/chat.ts:111`): `../` segments reach outside the data directory. Combined with (1) this is file read/write outside the data directory.
- **No tests, no CI, no linter, no schema validation** of any kind.
- **Memory retrieval is recency/tail-based** (`npc.memory.slice(-5)` / `slice(-8)`), no embeddings, no salience scoring.
- **GM is a separate non-streaming JSON call** at temp 0.2, `maxTokens ≥4096`; output parsed leniently, empty on failure, no schema validation.

---

## 3. Cross-project comparison

| Dimension | OpenWorld | Corvus Story Core | Integration implication |
|---|---|---|---|
| **World model** | Simulated, entity–containment graph, 1,024 maps, sparse saves | Free-form JSON document, no spatial model | OpenWorld owns the authoritative world; Corvus's model cannot host a simulated world |
| **AI interaction model** | AI proposes rules → engine validates & executes (ModPort) | Model is both narrator and rules engine (two-pass GM call) | Correct integration point is *beside* ModPort, not inside it: a new "narration port" that turns engine outcomes into prose and conversational intent into `Engine.act(...)` attempts |
| **Narrator/GM separation** | Not present; AI rule proposals are the "action" layer | Proven two-pass shape: narrator pass + GM pass with provenance | Adopt Corvus's orchestration shape + provenance cascade; do NOT adopt the unvalidated delta application |
| **Provider architecture** | 8 providers, per-category capability detection, cost/usage, hedging | Single `LMStudioSettings` shape, one model for every task | Superseed Corvus's provider layer with OpenWorld's `packages/ai/src/models/` |
| **Security posture** | CORS not evaluated; no auth documented; API keys in plaintext (same as Corvus) | CORS any-origin + credentials, no auth, API keys in plaintext | Must REMOVE the CORS-any-origin + credentials pattern from the unified project |
| **Data persistence** | Sparse save format, version gated, schema-validated | Per-chapter JSONL, summaries separate, no schema, no migration | Keep OpenWorld's persistence model; do NOT adopt Corvus's ad-hoc JSON layout |
| **Testing** | 241 tests; CI wiring verified; pass/fail NOT VERIFIED | Zero tests; no CI | Preserve OpenWorld's test infrastructure; Corvus contributes patterns, not infrastructure |

---

## 4. Key complementary insight

**OpenWorld is not "a game with an AI bolted on"; it is an engine, a project format, an editor, a deterministic simulation kernel and a separate AI package that the game can be built without.**

**Corvus is a ~13.8 kLOC localhost web application whose "world state" is a JSON document of free-form strings. It has no spatial model, no rules engine, no combat, no quests. It is an excellent reference for *narration orchestration*, not for world simulation.**

**Therefore the two projects are complementary at different layers, not peers.** OpenWorld owns the authoritative world; Corvus contributes a proven pattern for narrator/GM separation. The "unified data model" work is almost entirely *adding narrative state to OpenWorld*, not merging two equal schemas.

**OpenWorld already contains most of the AI-provider architecture the brief asks for as future work** (provider list, BYOK, capability detection per work category, tool specs, structured JSON, cost/usage, hedging). Corvus's provider layer is a single `LMStudioSettings` shape. Recommendations about "the unified provider system" must start from OpenWorld's `packages/ai/src/models/`.

---

## 5. What must be added (the "missing layer")

The missing narrative layer is **conversation, memory, narrator/GM separation, prose**. Based on the evidence:

- **Narrator/character two-pass separation** (Corvus): ADAPT – proven shape; must gain a validated action proposal layer.
- **Speaker-tagged multi-NPC output + splitter** (Corvus): ADAPT – directly useful; voice-per-NPC with one call.
- **Context assembler's ordered budget + degradation** (Corvus): ADAPT – good bones; replace char/4 estimator with real token accounting.
- **Provenance cascade (stale/cascade/delete/regen)** (Corvus): ADAPT (strongly) – directly supports the brief's event-history requirement.
- **Per-game lock + atomic writes** (Corvus): ADAPT – small, correct, portable.
- **NPCMemoryEntry shape** (Corvus): ADAPT – keep ids + `sourceMessageIds`; replace flat slice(-5) retrieval.
- **Rolling chapter summariser** (Corvus): ADAPT – keep the idea, not the threshold-on-count policy.
- **Whole `server/types` data model** (Corvus): REIMPLEMENT – text-RPG only; cannot host a simulated world.
- **stateManager delta application** (Corvus): REIMPLEMENT – unvalidated deltas are exactly what the brief forbids.
- **Games/saves JSON layout** (Corvus): REIMPLEMENT – single-player documents, no schema, no migration.
- **lmStudio.ts provider layer** (Corvus): REIMPLEMENT/SUPERSEDE – OpenWorld's `models/` is strictly better.
- **GM JSON parsing** (Corvus): REIMPLEMENT – replace with schema-validated structured output.
- **Image/TTS/ComfyUI/Chatterbox integrations** (Corvus): DEFER – out of scope for the unity objective; separate provider work.
- **Character-card import (SillyTavern-style)** (Corvus): DEFER / STUDY – interop opportunity later, not core.
- **Security posture (CORS/auth/paths)** (Corvus): REMOVE the pattern – must not be carried into the unified project.
- **Client UI (React chat)** (Corvus): DEFER – visual reference only.

---

## 6. Final decision gate – the 12 questions

**Answer: PROCEED WITH PROPOSED COMBINATION**

The fusion of OpenWorld and Corvus is architecturally sound and practically complementary. OpenWorld provides the authoritative simulated world (kernel, world state, rules, effects, determinism, sparse saves, quests/story, society, the format compiler/validator, and the provider/model-routing layer). Corvus provides the narration/orchestration shape (two-pass narrator/GM separation, speaker-tagged multi-NPC output with one HTTP call, context budget with ordered degradation, provenance cascade for event history, per-game lock, atomic file rolls, and chapter summarisation).

The correct integration approach is to embed Corvus's narration shape **beside** OpenWorld's ModPort: a new "narration port" that takes an already-resolved engine outcome and turns it into prose, and takes a player's conversational intent and turns it into an `Engine.act(...)` attempt — never a direct state write.

The unified project's AI vocabulary must be exactly three forms: (a) a rule patch through `validatePatch`, (b) an act request the engine resolves, (c) prose. Never a delta to `WorldState`.

This answers the 12 final-gate questions affirmatively because:
1. The world model is OpenWorld's authoritative simulated model (not Corvus's text JSON)
2. The AI interaction flows through ModPort + validatePatch (not direct state writes)
3. The narration port is beside ModPort, not inside it
4. Corvus's orchestration shape is adopted with critical modifications (structured output, validated GM)
5. OpenWorld's provider layer supersedes Corvus's
6. Security vulnerabilities (CORS, path traversal, plaintext keys) are removed
7. The data model is OpenWorld's with narrative extensions (not Corvus's text-RPG model)
8. The write guard + sandbox replay prevents AI from corrupting authoritative state
9. The provenance cascade supports the event-history requirement
10. The per-game lock + atomic writes are preserved from both projects
11. Species extension follows OpenWorld's four-tier framework
12. The roadmap has clear phases from MVP to full integration

**PROCEED WITH PROPOSED COMBINATION**

**Next step**: Begin Phase 1 of the roadmap — implement the narration port MVP, starting with the GM call with strict `validatePatch` schema and the narrator pass with speaker-tagged output.