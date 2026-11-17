# REPORT 10 – Unified Project Architecture Spec

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. Overall architecture shape

The unified project is **OpenWorld-centric with Corvus's narration shape embedded beside it**. OpenWorld provides the authoritative kernel, world state, rules, effects, determinism, format, compiler, and provider layer. Corvus provides the two-pass narrator/GM orchestration shape, speaker-tagged multi-NPC output, provenance cascade, per-game lock, and chapter summarisation.

The unified project does **not** merge two equal schemas. It extends OpenWorld with narrative capabilities while preserving all existing engine functionality.

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED PROJECT                            │
│                                                             │
│  +----------------------+    +----------------------------+│
│  |   OpenWorld Engine   |    |   Narration Port (new)    ││
│  |   (kernel, world     |    |   - prose output         ││
│  |    state, rules,     |    |   - speaker blocks      ││
│  |    effects,         |    |   - think-stream stripper││
│  |    determinism)     |    |   - provenance cascade  ││
│  +----------+------------+    +-----------+--------------││
│              │                       │     ^              ││
│              ▼                       ▼     |              ││
│  +----------+------------+    +-----------+--------------││
│  |   ModPort   |    --->---  |  GM Call  |  prose       ││
│  |   (validate)|         Rule  | (structured)| (narration)  ││
│  +----------+------------+    +-----------+--------------││
│              │                       │              ││
│              ▼                       ▼              ││
│  +----------+------------+    +-----------+--------------││
│  |  WorldState   |    Data   |  ChatMessage|  SSE stream   ││
│  |   (authoritative)│ <------>| (type:narrator| type:character)││
│  +---------------------+    +-------------+--------------││
│                                (prose is NOT authoritative)│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component specification

### 2.1 Engine kernel (preserved from OpenWorld)

| Sub-component | Description | Key files |
|---|---|---|
| **WorldState** | The single serialisable state object; even RNG state lives here (`WorldState.rng`); every run is replayable from `WorldState.rng` | `packages/engine/src/types.ts:1666` |
| **Entity–containment graph** | `Entity` with `place: Place` (union `on|in|held|in-region`); `REVERSE: {on:'under', in:'contains', held:'holds', 'in-region':'encloses'}`; cells as pseudo-entities | `types.ts:468`, `world.ts:50` |
| **Rule engine** | First-class rule language: host selector + condition tree, leaves are `{ do: Effect[] }` or `{ undefined: true, default?: Effect[] }`; `walk` evaluation, `ROLES` = host/actor/target/instrument/other/item/source; `Resolution` = `{defined, rule?, leaf?, hole?, open?, fault?}`; specificity ordering (`specOf`, `compareSpec`, `rulesTie`) | `rules.ts:53,240,453,474,613` |
| **Effect primitives** | `PRIMITIVES` (`effects.ts:26`): `topic, scene, lightning, fallback, appear, begin, startQuest, facts, advance, stage, accept, decline, failQuest`; `EffectRunner` (`:90`); role-restricted sets (`RESIDENT_ONLY`, `QUEST_ONLY`); `REFUSAL`/`refusalLine` (`:87-88`) | `effects.ts:26,82,87-90` |
| **Write guard** | `Writer` (`world.ts:88`); writes outside an outcome throw `WriteError` (`:91`); enforced by `CLAUDE.md`; tested in `writes.test.ts` (exists, not run) | `world.ts:88,91` |
| **Sandbox replay** | `buildSandbox` (`sandbox.ts:26`): derived tests before accept; the AI's patch is validated in a sandbox before execution | `sandbox.ts:26` |
| **Calendar / time** | `TICKS_PER_MINUTE = 10`, `TICKS_PER_HOUR = 600`, `TICKS_PER_DAY = 14400`; start hour 6; weather `sun|cloud|rain|storm|fog`; deterministic weather from `(day, hour, seed, plan)` | `calendar.ts:7-63` |
| **RNG** | mulberry32 PRNG; `WorldState.rng` state; `seedOf(...parts)` (FNV-1a, `rng.ts`); per-occasion streams so adding content doesn't reshuffle unrelated draws | `rng.ts:1-25`, `types.ts:1666 (rng)` |
| **Quest engine** | `quests.ts:177,200,268`; steps with triggers; scenes/beats; writes story props only; radiant offers; objectives, stages, news | `quests.ts`, `story.ts:20,51` |
| **Society / factions** | `modules/society`: deeds, regard, gossip, watches, prices, law; `types.ts:855,890,920,964,443` | `modules/society`, `types.ts` |
| **Inventory & items** | Physical stacks keep identity (`stacks.ts`); affixes/sets (`affixes.ts`); crafted items via `controls.ts` craft path; economy LP (`ai/src/checks/economy.ts`); `slots?`, `slotItems?` on Entity | `controls.ts:43 (SLOT_COUNT=30)`, `stacks.ts`, `affixes.ts` |
| **Render player** | Phaser 4 scene, HUD, audio director, UI, figures/portraits; `BASE_W = 24`, `BASE_H = 36` hand-drawn ASCII pixel grids; three facings, five walk frames + idle | `packages/runtime/src/render/*`, `ui/*`, `audio/*`, `assets/figure/*` |
| **Editor** | Browser + Electron app with modes: map, people, database, rules, story, holes, locale, assets; undo/store model (`CLAUDE.md`); local HTTP service (`editor/src/server/`); folder/asset import/export | `packages/editor/src/app/`, `src/server/` |
| **Format / compiler** | `FORMAT = 1`; file list (`game.json`, `ontology/`, `rules/`, `maps/`, `people/`, `quests/`, `story/`, `catalog.json`, `client/`, `learned/`, `locales/`, `extra.json`, `assets/`); `compile()` → `{bundle.json, world/, assets/}`; `mergeOntology`/`mergeRules`; `checkProject()` returns `Problem[]` (references, sizes, portals, anchors, ties); `ruleProblems`/`ties` | `format/src/project.ts:37`, `compile.ts:141`, `check.ts:26,178,199` |
| **Provider layer** | 8 providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom + 2 others); `Model` shape (`ai/src/models/model.ts`); `PROVIDERS` (`providerList.ts:28`); per-category capability detection (`modder/detect.ts:121` `Detector`; `engine/src/quality.ts` `AI_LEVELS`, `AI_WAIT_MS = 20_000`); cost/usage/hedging; BYOK in browser (`runtime/src/ownModel.ts`) | `ai/src/models/`, `providerList.ts:28`, `quality.ts:1-40`, `ownModel.ts` |

### 2.2 Narration port (new component)

The narration port is the **bridge between OpenWorld's engine outcomes and Corvus's two-pass orchestration shape**. It sits beside ModPort, never inside it.

| Sub-component | Description | Key design |
|---|---|---|
| **Narrator pass** | One `chatCompletionStream` SSE call that produces tagged prose: `[Narrator]` and `[Character: Name]` blocks; block budget 1-3; asterisk/quote format; "do not speak for the player"; group/single-speaker lockdown; continuation framing for empty input | Adapted from Corvus `buildNarratorSystemPrompt` (`narrator.ts:38-225`) + OpenWorld's provider/token budgeting |
| **Speaker block splitter** | Splits on `[Narrator]` / `[Character: Name]` TAG_LINE_RE; case-insensitive name matching with first-name fallback (`matchNpc`); coalesce consecutive same-speaker blocks; when `narratorEnabled:false` fold `[Narrator]` into a character block | Adapted from Corvus `speakerSplitter.ts:38-167` |
| **ThinkStreamStripper** | Live streaming stripper of thinking tags; after stream: `stripThinkingTags` then `stripProseReasoning`; real-model hygiene necessity | From Corvus `thinkStripper.ts`; used at `orchestrator.ts:203-234` |
| **GM call (structured)** | Separate non-streaming JSON call with strict `validatePatch` schema; temperature 0.2, `maxTokens ≥max(4096, cfg.maxTokens)`; output parsed strictly (any failure → reject and retry, NOT lenient fallback); context: `WORLD: setting | Tone | Currency | PLAYER: name | Stats: {json} | Currencies: ... | KNOW NPCs | NAMES IN USE` | Replaces Corvus's lenient `parseGameMasterOutput` with OpenWorld's `validatePatch` |
| **Provenance cascade** | `stale`-marking on message edit (`stateManager: stale` flag); cascade-delete on message deletion (drops entries whose entire source-id set vanished); regen invalidation (invalidate memories/world state for edited/deleted messages) | Adapted from Corvus `stateManager.ts:397-566`; applied to OpenWorld ChatMessage records |
| **Context assembler (unified)** | Priority order: (1) system prompt; (2) `# WORLD` block (setting, era, tone, currency, rules, custom instructions); (3) `# PLAYER CHARACTER` (name, appearance, stats as k=v, money, extra currencies, abilities, inventory, relationships); (4) up to 6 relevant NPC cards (heuristic scoring: active +100, mentioned +50, recency); (5) `# WORLD STATE (recent events)` (last 10 events, oldest first, with `[UNRELIABLE]` on stale events); (6) all chapter summaries; (7) recent chat messages (newest-first until budget exhausted); budget: `availableForPrompt = max(512, contextWindowBudget - reservedResponseTokens)`; token estimate: real token counter preferred, `ceil(chars/4)` fallback; ordered degradation: drop summaries oldest-first, then NPCs from least relevant end | Keeps Corvus's priority order + OpenWorld's token estimate; replaces char/4 estimator with real token accounting when possible |
| **Chapter summariser** | Threshold-based oldest-half: mark oldest summaries first, keep newest; marks messages `summarized`; same policy as Corvus but with OpenWorld's version-gated save compatibility | Keeps Corvus's idea; not the threshold-on-count policy; keep OpenWorld's version-gated approach |
| **NPC memory** | `NPCMemoryEntry` shape: `{id, chapter, event, sourceMessageIds?, stale?, createdAt?}`; relevance-aware retrieval (salience scoring, decay curve); replace flat `slice(-5)` / `slice(-8)`; `sourceMessageIds` threads provenance from ChatMessage to NPC memory | Keeps Corvus's `sourceMessageIds` + `stale` pattern; replaces flat tail retrieval with relevance-based |
| **Per-game lock** | Per-game promise chain keyed by `gameId`; two turns of one game cannot interleave; used for both engine writes and narrative file persistence | Same pattern as both OpenWorld `fileManager.ts:411` and Corvus `orchestrator.ts:118` |
| **Atomic file writes** | `writeJson`/`writeFileAtomic`: `.<pid>-<ts>-<rand>.tmp`, `fsync`, `rename`; `cleanupTempFiles` sweeps orphaned temp files; startup sweep all (`index.ts:54-58`) | Same pattern as both projects; keep both |

### 2.3 Data model (unified)

The unified data model **uses OpenWorld's types as the base** and adds narrative annotations as optional extensions.

| Type | Unified extension |
|---|---|
| `WorldState` | Keep OpenWorld's base; add optional fields: `narrativeProse?: string`, `narrativeScene?: string`, `narrativeTurnId?: string` (written by narration port, read by UI, ignored by engine) |
| `Entity` | Keep OpenWorld's base; no narrative extensions needed — narrative state is in ChatMessage and WorldState optional fields |
| `ChatMessage` | Keep OpenWorld's base; add `type: 'narrator' | 'character' | 'mixed' | 'user' | 'system'` (already exists); `modelParams?` retained for cost/usage tracking |
| `NPCCharacter` | Narrative projection of `Entity`; keep `id`, `name`, `revealedName`, `status: active|pending|disabled`, `memory[]` (with `sourceMessageIds` + `stale`), `voiceStyle`, `chatColor`, `actionColor`, `image` (with `basePrompt`, `coreAppearance`, `defaultOutfit`, `baseNegative`, `identitySeed`, `portraitPath` as narrative annotations) |
| `PlayerCharacter` | Keep OpenWorld's base; `name`, `backstory`, `appearance`, `stats: Record<string, number>`, `money`, `extraCurrencies`, `abilities[]`, `inventory[{name,description,quantity}]`, `relationships: Record<id, {name,disposition,notes>>` |
| `GameMasterOutput` | Replace Corvus's lenient schema with `validatePatch` schema (see Report 05, §2.2); output: `{statChanges, newItems, removedItems, relationshipUpdates, newCharacters, worldStateUpdates, characterUpdates, currencyChanges}` — strictly validated |
| `Summary` | Keep threshold-based oldest-half; marks messages `summarized`; chapter summaries as before |
| `GameConfig` / `WorldInfo` / `LMStudioSettings` / `GlobalConfig` | Corvus types kept as narrative configuration; not used by engine logic |

---

## 3. API surface (unified)

The unified project's HTTP API routes, adapted from both OpenWorld and Corvus:

| Route | Method | Description | Status |
|---|---|---|---|
| `GET /api/games/:gameId/messages` | SSE stream | Long-poll SSE: streams tokens `{type:'token'|'done'|'stream_end'|'gm_update'|'error'}`, paged messages, edit (+stale cascade), delete (+cascade), regenerate, alternative swap | Preserved from Corvus; narration port output integrated |
| `POST /api/games/:gameId/messages` | POST + SSE | Creates ChatMessage, saves user msg, assembles context (narrator/character/group via `resolveMode`), runs orchestration (narrator pass + GM call), streams result, persists blocks, emits SSE events | Adapted from Corvus `routes/chat.ts:110-193`; narration port inserted between orchestration and SSE |
| `PATCH /api/games/:gameId/messages/:messageId` | PATCH | Edit message, cascade: mark memories/world events `stale`, regen invalidation | Preserved from Corvus; apply to OpenWorld ChatMessage |
| `DELETE /api/games/:gameId/messages/:messageId` | DELETE | Delete message, cascade: drop entries whose entire source-id set vanished | Preserved from Corvus; apply to OpenWorld ChatMessage |
| `POST /api/games/:gameId/regenerate` | POST | Regenerate from a previous message; cascade invalidation (invalidate memories/world state for edited/deleted messages) | Preserved from Corvus; apply to OpenWorld |
| `GET /api/games` | GET | List games, paged | Preserved from Corvus |
| `GET /api/settings` | GET | Return settings (NO API keys ever returned) | Modified from Corvus; plaintext API keys removed; env vars only |
| `POST /api/settings` | POST | Write settings (no API key fields) | Modified from Corvus; no plaintext key storage |
| `POST /api/games/:gameId/narrate` | POST | Trigger narrator pass only (prose output, no GM delta) | New route, narration port |
| `POST /api/games/:gameId/act` | POST | Trigger Engine.act(...) attempt; resolve via rule engine + effects + write guard | New route, engine integration |
| `GET /api/games/:gameId/world-state` | GET | Return current `WorldState` (version-gated) | Preserved from OpenWorld |
| `POST /api/games/:gameId/save` | POST | Save game (version-gated format with optional narrativeSnapshot) | Preserved from OpenWorld |
| `POST /api/games/:gameId/load` | POST | Load game (version gate refuses foreign content version) | Preserved from OpenWorld |

**Security requirements for all routes:**
- CORS must be origin-locked (not any-origin + credentials)
- No API keys in response bodies
- All user-supplied IDs validated (reject `\`, `/`, `.`, `..`)
- Write guard surrounds all state mutations
- Model output schema-validated against `validatePatch` format

---

## 4. Deployment configuration

The unified project is designed for **Cloudflare Sites** deployment, inheriting OpenWorld's workspaces layout:

| Environment | Bindings | Notes |
|---|---|---|
| **Preview** | `env.DB` (D1 SQLite), `env.FILES` (R2) | Isolated preview DB/bucket; seeded framework cache; development auth variables for sign-in tests |
| **Production** | `env.DB` (D1 SQLite), `env.FILES` (R2) | Production DB/bucket; separate from preview; same code, different bindings |
| **Worker entry** | `index.js` (ES module) | Handles API routes then `env.ASSETS.fetch(request)`; compatibility date set to current year |
| **Compatibility date** | `2026-11-16` (audit date) | Set via `Wrangler`; ensures compatibility with current Cloudflare platform |
| **Assets directory** | `./dist` (prebuilt Worker code + static assets) | OpenNext adapter builds Next.js + packages; packages bundled; public assets included |
| **Realtime** | `env.REALTIME` (Durable Object) | If `realtime:true` in manifest; managed room broadcast/presence; first use requires `sites_prepare_realtime` |
| **Secrets** | `OPENAI_API_KEY` (owner's key), any provider-specific keys | In `.env` (not `.dev.vars`); presence stops Wrangler reading `.env`; key stays in browser (BYOK) for player-side only |
| **CORS** | Origin-locked only (never `origin: true, credentials: true`) | Critical security requirement from Report 08 |
| **Auth** | `Sign in with Freebuff` via `env.FREEBUFF_CLIENT_ID`, `env.FREEBUFF_ISSUER`, `env.APP_ORIGIN` | Optional; if enabled, `createFreebuffAuth` wraps handlers; development has separate client; production shares OIDC client with preview callbacks |

---

## 5. Migration from Corvus to unified

| Corvus component | Unified equivalent | Migration effort |
|---|---|---|
| Narrator/GM two-pass separation | Narration port beside ModPort | **ADAPT**: keep shape, replace GM with structured-output call, replace delta application with validatePatch |
| Speaker-tagged multi-NPC output | Speaker block splitter + narrator pass | **ADAPT**: keep splitter, adapt prompts to OpenWorld's block budget |
| Context assembler + budget | Unified context assembler | **ADAPT**: keep priority order, replace token estimator with real accounting |
| Provenance cascade (stale/cascade/delete/regen) | Provenance cascade on OpenWorld ChatMessage | **ADAPT**: keep patterns, apply to OpenWorld data model |
| Per-game lock + atomic writes | Same patterns, OpenWorld files | **PRESERVE**: both have correct implementations |
| NPCMemoryEntry shape | Keep `sourceMessageIds` + `stale`; replace `slice(-5)` | **REIMPLEMENT**: replace flat tail retrieval with relevance-aware |
| Chapter summariser | Keep oldest-half policy | **PRESERVE**: same idea, OpenWorld version-gated |
| `server/types` data model | REIMPLEMENT (text-RPG only → unified) | **REIMPLEMENT**: keep usable parts, replace text-rpg-only parts with OpenWorld types |
| stateManager delta application | REIMPLEMENT (unvalidated → validated) | **REIMPLEMENT**: replace with OpenWorld's `validatePatch` + effect pipeline |
| Games/saves JSON layout | REIMPLEMENT (single-player docs → OpenWorld format) | **REIMPLEMENT**: conversion script for existing user data (deferred) |
| lmStudio.ts provider layer | SUPERSEDE with OpenWorld's `models/` | **REIMPLEMENT/SUPERSEDE**: OpenWorld's is strictly better |
| GM JSON parsing | REPLACE with schema-validated `validatePatch` | **REIMPLEMENT**: strict validation, no lenient fallback |
| Image/TTS/ComfyUI/Chatterbox | DEFER | Out of scope for unity objective; separate provider work |
| Character-card import (SillyTavern-style) | DEFER / STUDY | Interop opportunity later, not core |
| CORS any-origin + credentials, no auth | REMOVE the pattern | **REMOVE**: must not be carried into unified project |
| Path traversal via gameId | FIX: validate all inputs | **FIX**: sanitize before `path.join` |
| API keys in plaintext, returned to client | REMOVE; use env vars | **REMOVE**: security critical |
| Zero tests / no CI | PRESERVE OpenWorld's test infrastructure | **DO NOT ADOPT**: Corvus's vacuum is a liability |

---

## 6. Open questions and outstanding work

| Question | Status | Next step |
|---|---|---|
| Real token counter vs `ceil(chars/4)` | Not verified; depends on provider | Implement real counter when provider supports it; otherwise keep `ceil(chars/4)` |
| Jailbreak prompt impact on structured output | Not verified; can silently corrupt JSON output | Test with and without jailbreak prompt; if corrupting, strip from GM/narrator requests |
| NPC relevance scoring: heuristic vs embeddings | Not verified; Corvus uses heuristic, OpenWorld has none | Start with heuristic (inherit from Corvus); embeddings are a future enhancement |
| Non-humanoid species: whole-sheet `Entity.look` vs part-composed look | OpenWorld already anticipates both; no decision needed yet | Whole-sheet is lower-effort path; adopt as default for non-biped creatures |
| Conversion script for existing Corvus user data | Not started; Corvus has no schema, OpenWorld has strict format | Defer (Report 08: F defer); one-time migration per user |
| Agent/RSI harness integration | Deferred to later phase | Not core to unified AI architecture; defer |
| BNIB (build, npm install, install build) verification | Not executed in this phase | Run `npm install`, `npm run build`, test play in isolated disposable environment |

---