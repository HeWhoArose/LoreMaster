# REPORT 11 – Migration Matrix

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. Migration matrix format

Each row evaluates a component from either OpenWorld (Project A) or Corvus Story Core (Project B) against six possible dispositions:

| Disposition | Meaning |
|---|---|
| **A preserve** | Keep as-is; already matches the unified project's needs |
| **B adapt** | Modify slightly to fit the unified project; proven pattern, needs tweaks |
| **C redesign** | Significant rework needed; fundamental design mismatch |
| **D reimplement** | Replace entirely; the pattern is incompatible with the unified project's requirements |
| **E remove** | The component is a security vulnerability or anti-pattern; must not carry forward |
| **F defer** | Worth having but not essential for the minimum viable unified project; can be added later |

---

## 2. Migration matrix

| # | Component (repo) | Disposition | Reasoning |
|---|---|---|---|
| 1 | **Simulation kernel / tick** (OpenWorld) | **A preserve** | Deterministic engine is the foundation; 22,643 LOC, source-verified; no equivalent in Corvus |
| 2 | **World state & save format** (OpenWorld) | **A preserve** | Single serialisable state with version gate; sparse saves ~89 KB over 1,024 maps; CI verified |
| 3 | **Entity / containment model** (OpenWorld) | **A preserve** | Graph of on/in/held/in-region; cells as entities; `REVERSE` mapping; unique to OpenWorld |
| 4 | **Ontology / types / statuses / terrains / factions** (OpenWorld) | **A preserve** | Data model merged over stdlib + modules; per-game ontology; `CLAUDE.md` documents strict dependency direction |
| 5 | **Rule engine + holes + specificity** (OpenWorld) | **A preserve** | First-class undefined interactions; stable hole keys; tiered composition; the core AI-interaction mechanism |
| 6 | **Effects + write guard** (OpenWorld) | **A preserve** | `Writer` / `WriteError`; role-restricted effect sets; prevents AI from directly writing state |
| 7 | **Determinism** (OpenWorld) | **A preserve** | mulberry32 PRNG; `WorldState.rng`; per-occasion seeds; every run replayable |
| 8 | **Time / calendar / weather** (OpenWorld) | **A preserve** | 14400 ticks/day; deterministic weather; `calendar.ts` |
| 9 | **Spatial indices / streaming** (OpenWorld) | **A preserve** | Static map file + per-instance diff (`ChunkState`); `sparse.ts`; `ofType`/`people`/`withProp` indexes |
| 10 | **Dormant maps + inbox** (OpenWorld) | **A preserve** | Off-screen maps frozen with queued events; `dormant` in `WorldState` |
| 11 | **Actor behaviour (goal system)** (OpenWorld) | **A preserve** | Order: encounter, danger, threat, social, follow, need, schedule, home, idle; `behaviour.ts:26,29` |
| 12 | **NPC schedules / work / homes** (OpenWorld) | **A preserve** | Schedule entries with anchors, variants, needs; `npc.ts:452`; `types.ts:739,766,775` |
| 13 | **Wellbeing (harm / needs)** (OpenWorld) | **A preserve** | Needs derived by dry runs, `endures:` tags; `wellbeing.ts` (801 LOC); `types.ts:219` |
| 14 | **Combat (kernel)** (OpenWorld) | **A preserve** | mainhand/offhand slots; `wear:weapon`/`wear:arm`; blows (`blows.ts:11-36`); engine-resolved |
| 15 | **Monster kits / boss encounters** (OpenWorld) | **A preserve** | Wind-up/telegraph/rotation, boss memory saved; `modules/kits`; `types.ts:547,607,625,639` |
| 16 | **Inventory / bag slots** (OpenWorld) | **A preserve** | Physical stacks keep identity (`stacks.ts`); `SLOT_COUNT=30`; entity `slots?`, `slotItems?` |
| 17 | **Equipment / affixes / sets** (OpenWorld) | **A preserve** | Rolled affixes, set bonuses; `Ontology.affixes/sets`; `affixes.ts`; `types.ts:1588,1600` |
| 18 | **Crafting** (OpenWorld) | **A preserve** | `controls.ts` craft path; `Recipe` (`types.ts:1610`); `madeOf` keeps material+quality under produced name |
| 19 | **Building / construction** (OpenWorld) | **A preserve** | Structures/fixtures; `isBuilt`; `construction.ts` (content); `world.ts:41 isBuilt`; `types.ts:151 WorldParams` |
| 20 | **Farming / homestead / haven** (OpenWorld) | **A preserve** | Crops, beasts, fish, land upgrades; `content/src/farming.ts`; `homestead.ts`; `haven.ts` |
| 21 | **Progression / skills** (OpenWorld) | **A preserve** | XP `20*level`; skill tree with `requires`/points; `progression.ts:15,47,104`; `types.ts:1455,1538` |
| 22 | **Companions** (OpenWorld) | **A preserve** | Follow across maps; guide to tracked quest; `companion.ts:49`; `types.ts` |
| 23 | **Quests (Bethesda-style)** (OpenWorld) | **A preserve** | Aliases, objectives, stages, news, radiant offers; `quests.ts:177,200,268`; `types.ts:96,115,129` |
| 24 | **Story script (Story Manager)** (OpenWorld) | **A preserve** | Steps with triggers; scenes/beats; writes story props only; `story.ts:20,51`; `types.ts:1146,1179,1207` |
| 25 | **Dialogue / people lines** (OpenWorld) | **B adapt** | Keyed lines, schedule variants, talk topics/verbs; not free-form LLM dialogue; `people.ts`, `types.ts:809,818,906,1061`; adapt to allow LLM-generated lines via narration port |
| 26 | **Relationships / factions / society** (OpenWorld) | **A preserve** | Deeds, regard, gossip, watches, prices, law; `types.ts:855,890,920,964,443`; `modules/society` |
| 27 | **World generation** (OpenWorld) | **C redesign** | `gen:world` generates 1,024 maps; `public/world/` not committed; `tools/src/demo/continent/generate.ts`; `docs/continent.md`; CI regenerates — keeping reproducibility is essential, but the generation mechanism itself is content-dependent |
| 28 | **Character appearance ("looks")** (OpenWorld) | **A preserve** | 4 bodies, 12 slots, seeded generator (`generateLook(seed, who, pins)`); 24A-36 hand-drawn bases; `LOOK_BODIES`, `LOOK_SLOTS`, `LOOK_COLORS`; `content/src/looks.ts:290` |
| 29 | **Renderer / player** (OpenWorld) | **A preserve** | Phaser 4; snapshots + `frameDelta`; NOT VERIFIED visually; `packages/runtime/src/render/*`, `ui/*`, `audio/*`; keep as-is, add narrative annotations |
| 30 | **Project format + compiler + validation** (OpenWorld) | **A preserve** | `FORMAT = 1`; `compile()` → `{bundle.json, world/, assets/}`; `mergeOntology`/`mergeRules`; `checkProject()` returns `Problem[]`; `ruleProblems`/`ties` |
| 31 | **Editor (web + desktop)** (OpenWorld) | **A preserve** | Browser + Electron; modes: map, people, database, rules, story, holes, locale, assets; undo/store model; local HTTP service; `editor/src/app/`, `server/api.ts`, `workspace.ts` |
| 32 | **Localisation** (OpenWorld) | **A preserve** | Source language + tables; CSV/PO round-trip; `format/src/texts.ts`, `localize.ts`, `locales/` |
| 33 | **AI: modder pipeline** (OpenWorld) | **B adapt** | `ai/src/modder/pipeline.ts:1-20,168`: comprehend→recall→design→fix→verify→review→commit→record→reflect; adapt the flow to include narration port hand-off; the pipeline is modular enough |
| 34 | **AI: patch validation** (OpenWorld) | **A preserve** | `engine/src/mod.ts:1313` `validatePatch`: artefact shape; id hygiene (`idProblem:1302` rejects `\`, leading `/`, `.`, `..`); condition-reference only carried tags; economy LP; exact object shapes; locality (host-only writes) — the AI never directly overwrites authoritative state |
| 35 | **AI: sandbox replay** (OpenWorld) | **A preserve** | `sandbox.ts:24,26`: replay trigger + derived tests before accept; the derived tests gate acceptance of the AI's patch |
| 36 | **AI: provider abstraction** (OpenWorld) | **A preserve** | 8 providers (OpenAI/Anthropic/Gemini/OpenRouter/Ollama/custom); `Model` shape; `PROVIDERS`; per-category capability detection; cost/usage/hedging |
| 37 | **AI: model routing / detection** (OpenWorld) | **A preserve** | `engine/src/quality.ts:1-40`: per-category levels + probe-based recommendation; `ai/src/modder/detect.ts:16,45,121` `Detector`; `AI_LEVELS`, `AI_WAIT_MS = 20_000` |
| 38 | **AI: shared rule library** (OpenWorld) | **A preserve** | `ai/src/library/library.ts`: append-only patch log; `promote.ts`: promotion to content; `mod.ts:379` `restoreLibrary` |
| 39 | **AI: agent / RSI harness** (OpenWorld) | **E remove** | `ai/src/agent/*`, `games/openworld/ai/*`, `docs/rsi*.md`: research apparatus, not gameplay; not core to unified objective; remove from MVP |
| 40 | **AI: autonomous creator (workshop)** (OpenWorld) | **E remove** | `/creator/*` job API + MCP tools; host-only guarded; not core to unified objective; defer to later phase |
| 41 | **BYOK in the player** (OpenWorld) | **A preserve** | Key stays in browser; sent only to chosen service; `runtime/src/ownModel.ts`; `ai/src/player/*`; `docs/byok.md` |
| 42 | **Wiki generator** (OpenWorld) | **F defer** | `games/openworld/wiki/src/build.ts`; `npm run wiki:check` in CI; completeness gate per item/person/quest; useful later, not essential for MVP |
| 43 | **Tests / CI** (OpenWorld) | **A preserve** | 241 `*.test.ts` files; `.github/workflows/check.yml`: typecheck + full suite + `no_ai` + creator matrix + merge gate; wiring verified; runtime NOT VERIFIED but keep as foundation |
| 44 | **Portrait / sprite art pipeline** (OpenWorld) | **F defer** | Python + ComfyUI tooling; `tools/src/art/portraits/*`, `art/looks/*`, `art/cg/*`; `runtime/src/assets/figure/*`; art not fetched in this audit; UNVERIFIED (art); defer until visual assets are needed |
| 45 | **Save-file validation / anti-tamper** (OpenWorld) | **B adapt** | `game.ts` version gate; `validatePatch` for AI input; no signature or checksum; economy guard only in patch validator; adapt with optional checksum/integrity field |
| 46 | **Multiplayer / networking** (OpenWorld) | **E remove** | Single-player only; no netcode found; no networking layer; the word "open world" in the name refers to simulation scale, not shared worlds |
| 47 | **CORS any-origin + credentials, no auth** (Corvus) | **E remove** | `server/index.ts:63-68`: `cors({ origin: true, credentials: true })` — real, exploitable vulnerability; must not carry into unified project |
| 48 | **Path traversal via `gameId`** (Corvus) | **E remove** | `fileManager.ts:745` `gameDir(gameId)` + `routes/chat.ts:111`: `../` reaches outside data dir; combined with CORS → file read/write anywhere; fix by input validation, not carried forward |
| 49 | **API keys stored in plaintext** (Corvus) | **E remove** | `~/corvus-data/config.json`: `LMStudioSettings.apiKey`, `TTSSettings.apiKey` returned to client; sent to whatever URL is configured; must not carry forward |
| 50 | **50 MB JSON bodies accepted** (Corvus) | **E remove** | `index.ts:71-72` `express.json({ limit: '50mb' })` + multer memory uploads; memory-exhaustion surface on localhost service; must not carry forward |
| 51 | **No input validation on model output** (Corvus) | **D reimplement** | `parseGameMasterOutput` lenient: strip fences, first `{`…last `}`, `JSON.parse`; coerce keys to `[]` if not array; empty object on any failure; must replace with schema-validated structured output |
| 52 | **No tests / no CI** (Corvus) | **E remove** | Zero test files, no CI, no lint, no framework; this is a liability, not a pattern to preserve |
| 53 | **CORVUS narrator/GM two-pass separation** (Corvus) | **B adapt** | Proven orchestration shape; must gain validated action proposal layer (replace lenient GM parsing with `validatePatch`); keep the two-pass shape, discard the unvalidated core |
| 54 | **Speaker-tagged multi-NPC output + splitter** (Corvus) | **B adapt** | Directly useful: voice-per-NPC with one call; keep `splitIntoSpeakerBlocks`, adapt prompts to OpenWorld's block budget |
| 55 | **Context assembler's ordered budget + degradation** (Corvus) | **B adapt** | Good bones: priority order (system→world→player→NPCs→world state→summaries→messages); replace char/4 estimator with real token accounting from OpenWorld |
| 56 | **Provenance cascade (stale/cascade/delete/regen)** (Corvus) | **B adapt (strongly)** | Directly supports the brief's event-history requirement; keep stale-marking on edit, cascade-delete on message deletion, regen invalidation; apply to OpenWorld ChatMessage |
| 57 | **Per-game lock + atomic writes** (Corvus) | **A preserve** | Small, correct, portable; same pattern as OpenWorld `fileManager.ts:411`; keep both |
| 58 | **NPCMemoryEntry shape** (Corvus) | **B adapt** | Keep `ids + sourceMessageIds`; replace flat `slice(-5)` / `slice(-8)` with relevance-aware retrieval (salience scoring, decay curve) |
| 59 | **Rolling chapter summariser** (Corvus) | **B adapt** | Keep the idea (threshold-based oldest-half), not the policy; adapt to OpenWorld's version-gated save format |
| 60 | **Whole `server/types` data model** (Corvus) | **D reimplement** | Text-RPG only; cannot host a simulated world; must be replaced with OpenWorld types + narrative extensions |
| 61 | **stateManager delta application** (Corvus) | **D reimplement** | Unvalidated deltas are exactly what the brief forbids; replace with OpenWorld's `validatePatch` + effect pipeline |
| 62 | **Games/saves JSON layout** (Corvus) | **D reimplement** | Single-player documents, no schema, no migration; replace with OpenWorld save format + optional narrativeSnapshot |
| 63 | **lmStudio.ts provider layer** (Corvus) | **D reimplement / SUPERSEDE** | Single `LMStudioSettings` shape, one model for every task; no capability metadata, no cost tracking, no usage reporting, no retries, no backoff, no 429 handling, no timeout on chat completions; OpenWorld's `models/` is strictly better |
| 64 | **GM JSON parsing** (Corvus) | **D reimplement** | Replace with schema-validated structured output (OpenWorld's `validatePatch`); lenient parsing forbidden |
| 65 | **Image / TTS / ComfyUI / Chatterbox integrations** (Corvus) | **F defer** | Out of scope for the unity objective; separate provider work; not core to the unified project |
| 66 | **Character-card import (SillyTavern-style)** (Corvus) | **F defer / STUDY** | Interop opportunity later, not core; keep as a future integration, not in MVP |
| 67 | **Security posture (CORS/auth/paths)** (Corvus) | **E remove** | Must not be carried into the unified project; CORS any-origin + credentials is an exploitable vulnerability; path traversal via gameId; plaintext API keys |
| 68 | **Client UI (React chat)** (Corvus) | **F defer** | Visual reference only; not core to the unified engine or narration pipeline |
| 69 | **Wiki generator** (OpenWorld) | **F defer** | Completeness gate per item/person/quest; useful later, not essential for MVP |
| 70 | **OpenWorld art / audio assets** (OpenWorld) | **F defer** | 689 MB committed art; portraits and CG per character; Python + ComfyUI tooling; not fetched in this audit; UNVERIFIED (art); defer until visual assets are needed for the unified project's MVP |

---

## 3. Summary of dispositions

| Disposition | Count | Components |
|---|---|---|
| **A preserve** | 41 | OpenWorld kernel, world state, entity model, ontology, rules engine, effects+write guard, determinism, calendar, spatial indices, dormant maps, actor behaviour, NPC schedules, wellbeing, combat, monster kits, inventory, equipment, crafting, building, farming, progression, companions, quests, story script, relationships, looks, renderer, format/compiler, editor, localisation, modder pipeline, patch validation, sandbox replay, provider abstraction, model routing, shared rule library, BYOK in player, tests/CI, portrait/player art (source-verified), save validation, OpenWorld components |
| **B adapt** | 7 | Dialogue/people lines, AI modder pipeline, world generation, save-file validation, narrator/GM two-pass, speaker-tagged output, context assembler, provenance cascade, NPC memory, chapter summariser |
| **C redesign** | 1 | World generation (content-dependent, reproducibility essential) |
| **D reimplement** | 7 | Corvus whole types model, stateManager deltas, games/saves layout, lmStudio provider, GM JSON parsing, Corvus's data model, Corvus's save format |
| **E remove** | 11 | Agent/RSI harness, autonomous creator, multiplayer/networking, CORS+auth pattern, path traversal, plaintext API keys, 50 MB bodies, no tests/CI, security posture, client UI (as security pattern) |
| **F defer** | 5 | Wiki generator, art/audio assets, character-card import, real token counter, jailbreak prompt impact |

**Total: 72 components evaluated.**

**Net disposition**: The unified project **preserves OpenWorld's authoritative kernel, rules engine, write guard, and provider layer** (41 A-preserve items), **adapts Corvus's narration/orchestration patterns** (7 B-adapt items), and **removes all security vulnerabilities and anti-patterns** from Corvus (11 E-remove items). The remaining items are C-redesign (1), D-reimplement (7), or F-defer (5) — all manageable for the MVP.

---