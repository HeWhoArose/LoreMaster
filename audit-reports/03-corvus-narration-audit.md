# REPORT 03 — Corvus Story Core Complete AI Narration Audit (Agent 2)

**Repository:** `JustLateNightAI/Corvus-Story-Core` — branch `main`, commit
`8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Method:** full source reading of the isolated clone; no installs, no build, no run.
**Audit date:** 2026-11-16.

---

## 1. What Corvus actually is

Node/Express + React/Vite application (13,808 LOC across server, client and shared types) that runs a
local-first interactive-fiction loop and stores everything as JSON on disk under `~/corvus-data/`.
Its own README describes the loop accurately, and the code matches the description — this is one of
the rare cases where the documentation is not overselling.

Package facts (`package.json`): `corvus-story-core@1.1.46`, `"private": true`, deps
`cors ^2.8.5`, `express ^4.18.2`, `multer ^1.4.5-lts.1`, `uuid ^9.0.0`; dev deps include
`tsx`, `vite`, `typescript`, `react`. No test framework, no linter, no zod/AJV/Joi/Yup
(`grep -E "\bzod\b|\bajv\b|\bjoi\b|\byup\b"` over `package.json` and `server/` → no matches).

| Area | Files | LOC |
|---|---|---|
| Server services | `orchestrator, gameMaster, narrator, character, contextAssembler, stateManager, summarizer, fileManager, lmStudio, speakerSplitter, thinkStripper, comfyui, chatterbox, imageChatAgent, characterCardImport, logger` | ~6.6k |
| Server routes | `chat, games, agents, images, comfyui, settings, tts, characters` | ~2.6k |
| Shared types | `server/types/index.ts` | 540 |
| Client | React app, 40 components/hooks | ~4.0k |

**There are zero tests.** `find` for `*.test.*`, `*.spec.*`, `jest.config*`, `vitest.config*` returns
nothing. There is no CI configuration. There is a 179 KB `CHANGELOG.md` documenting 46 point releases.

---

## 2. Runtime architecture

`server/index.ts`:

- Express with `cors({ origin: true, credentials: true })` (`:63-68`) — **reflects any origin**.
- `express.json({ limit: '50mb' })` and `urlencoded` (`:71-72`).
- Routers mounted at `/api/games` (chat, images, games), `/api/agents`, `/api/comfyui`, `/api/settings`,
  `/api/character-card`, `/api/tts` (`:100-118`).
- Serves the built Vite client if `client/dist` exists (`:127-143`).
- Binds `127.0.0.1:3000` by default (`:21-22`, `:172`); no authentication of any kind.
- `uncaughtException`/`unhandledRejection` handlers that only log (`:165-170`).

Data directory: `DEFAULT_DATA_DIR = path.join(os.homedir(), 'corvus-data')` (`fileManager.ts:25`),
overridable by `CORVUS_DATA_DIR` (`index.ts:40-44`).

Persistence is file-based: `FileManager` (`fileManager.ts:439-1220`) with per-game folders and
**atomic writes** — `writeJson` (`:182`) writes `.<pid>-<ts>-<rand>.tmp`, `fsync`, `rename`;
`writeFileAtomic` (`:223`) the same for binaries; `cleanupTempFiles` (`:265`) sweeps orphaned temp
files; startup sweeps all (`index.ts:54-58`). Per-game serialisation via `withGameLock`
(`fileManager.ts:411`) keyed by `gameId`, so two turns of one game cannot interleave
(`orchestrator.ts:118`).

---

## 3. The narration lifecycle (the exact 12-step trace)

The brief's example: *a player approaches an NPC and says "I want to buy your sword. How much will
you sell it for?"* Traced through the audited source.

### Step 1 — Input received

Client `POST /api/games/:gameId/messages` with `{ content, mode, activeCharacterId,
groupParticipantIds, nextSpeakerId, singleSpeakerId, seed, chapter }`
(`routes/chat.ts:110-193`). The route:
- validates the game exists (`:116-120`);
- opens an SSE stream (`openSseStream` `:93-99`, `:159`);
- creates an `AbortController` aborted on client disconnect (`:160-161`);
- calls `runOrchestration(...)` (`:164-179`);
- emits `{type:'token'}`, `{type:'done', message}`, `{type:'gm_update', player, characters,
  worldState, summary}`, `{type:'stream_end'}`, `{type:'error'}` (`writeSseEvent` `:28-91`).

### Step 2 — Conversation context construction

`runOrchestration` (`orchestrator.ts:102`) takes the per-game lock (`:118`), then
`runOrchestrationLocked` (`:123`):
- empty content means a **continuation turn** (`:144`) — no user message saved;
- otherwise a `ChatMessage` is minted (uuid, role `user`, chapter) and **appended to disk**
  (`:147-158`);
- `resolveMode` (`:72-86`) picks `narrator | character | group`; with no explicit character and no
  group, it is **narrator**.

Context comes from `buildNarratorContext` (`narrator.ts:227-244`) →
`assembleContext` (`contextAssembler.ts:55`).

`assembleContext` builds **one system string** in this priority order, then walks history backwards
until the token budget is spent (`:43-53` documents the order; `:55-198` implements it):

1. the agent system prompt;
2. `# WORLD` — setting, era, tone, currency, rules, custom instructions (`buildWorldBlock` `:221`);
3. `# PLAYER CHARACTER` — name, appearance, backstory, stats as `k=v`, money, extra currencies,
   abilities, inventory, relationships (`buildPlayerBlock` `:232-273`);
4. up to **6 relevant NPC cards** (`pickRelevantNpcs` `:359-406`);
5. `# WORLD STATE (recent events)` — the last **10** events, oldest first (`buildWorldStateBlock`
   `:314-349`), with stale events marked `[UNRELIABLE — source message was edited]` (`:339`);
6. **all** chapter summaries;
7. recent chat messages, newest-first until the budget is exhausted (`:147-188`).

Budget: `availableForPrompt = max(512, contextWindowBudget − reservedResponseTokens)`
(`:58-60`); token estimate is `ceil(chars/4)` (`:16-19`). If the system part alone is over budget it
drops summaries oldest-first, then NPCs from the least relevant end (`:124-145`).

### Step 3 — NPC identity and personality retrieved

NPC relevance scoring (`pickRelevantNpcs` `:359-406`), all heuristic, **no embeddings**:
`activeCharacterId +100`; each mentioned id `+50`; each appearance as a speaker in the last 30
messages `10 + proximity`; each name/revealedName substring hit in message bodies `2 + floor(proximity/5)`;
filter `score>0`, sort desc, **slice 6**.

Each selected NPC renders via `buildNpcBlock` (`:296-312`): display name + id, "Display name",
appearance, personality, background, "What the player knows", disposition, voice style, and
**"Memories:" = the last 5 entries** (`:307`).

### Step 4 — Memory selection

**Last 5 memories in the narrator card** (`:307`), **last 8 in single-character mode**
(`character.ts:41`). Memories are a flat array on the NPC record; there is no scoring, no summary,
no decay, no retrieval by relevance. `NPCMemoryEntry` (`types/index.ts:77-102`) =
`{id, chapter, event, sourceMessageIds?, stale?, createdAt?}`.

### Step 5 — Model receives the request

`chatCompletionStream` (`lmStudio.ts:171-319`): POST `{baseUrl}/v1/chat/completions` with
`{messages, temperature, top_p, max_tokens, stream:true, model?, seed?}`, optional
`Authorization: Bearer <apiKey>` (`buildHeaders` `:26-37`), optional global "jailbreak" system
message prepended at index 0 (`applyJailbreakPrompt` `:52-59`), SSE parsing of `data:` lines,
handling of `content` / `reasoning_content` / `thinking` deltas (`:276-290`), fallback to reasoning
text if content is empty (`:253-256`, `:312-318`).

### Step 6 — NPC generates dialogue

The model is *the* dialogue generator. There is no separate NPC agent call per NPC in narrator mode:
one completion produces **tagged blocks** (`[Narrator]`, `[Character: Name]`) as instructed by
`buildNarratorSystemPrompt` (`narrator.ts:38-225`), which carries the block budget (1–3), the
asterisk/quote format, "do not speak for the player", and the group/single-speaker lockdowns.

After the stream: `ThinkStreamStripper` (live) then `stripThinkingTags` and `stripProseReasoning`
(`orchestrator.ts:203-234`), then `splitIntoSpeakerBlocks` (`speakerSplitter.ts:38-167`) splits on
tag lines (`TAG_LINE_RE` `:14`), matches names case-insensitively with a first-name fallback
(`matchNpc` `:173-198`), coalesces consecutive same-speaker blocks (`:94-109`), and — when the world
has `narratorEnabled:false` — folds `[Narrator]` blocks into a character (`:116-164`). Each block is
persisted as its own `ChatMessage` with `type: 'narrator' | 'character'` and `characterId`
(`orchestrator.ts:270-298`).

### Step 7 — Does the GM decide an action is proposed?

**No.** `runGameMaster` (`gameMaster.ts:73-168`) is a *second, independent, non-streaming* call with
a fixed JSON-extraction system prompt (`GM_SYSTEM_PROMPT` `:8-68`). It is told: "You are the hidden
GAME MASTER… read the most recent exchange between the player and the story response, and emit a
structured JSON object describing any state changes that should happen."

Its context is a small hand-built string (`:92-146`): `WORLD: setting | Tone | Currency`;
`PLAYER: name`; `Stats: {json}`; `Currencies: …`; `Inventory: …`; `KNOWN NPCs (id — name —
disposition)`; `NAMES IN USE` for pending/disabled NPCs; plus image-prompt examples and default
negative. Then:

```
PLAYER: <user content>

RESPONSE: <assembled assistant content>
```

and "Emit the JSON now." Temperature 0.2, `maxTokens = max(4096, cfg.maxTokens)` (`:160-165`).
Note it receives the *full* raw assistant turn (`orchestrator.ts:308-311`), not the per-NPC blocks.

There is **no notion of an "action proposal"** as an object: no verb, no target, no price, no
preconditions, no tool call, no confirmation. The model is simply asked to infer deltas from prose
("Only emit changes that are CLEARLY implied by what happened", `:61`).

### Step 8 — Structured changes extracted

The JSON contract (`:13-37`): `statChanges[{field, operation: set|add|subtract, value, reason}]`,
`newItems[{name, description, quantity}]`, `removedItems[{name, quantity}]`,
`relationshipUpdates[{id, disposition, notes, revealedName}]`, `newCharacters[{...NPCCharacter +
image.basePrompt/baseNegative}]`, `worldStateUpdates[{event, location, timestamp}]`,
`characterUpdates[{id, ...patch}]`, `currencyChanges[{name, operation, value, reason}]`.

Parsing (`parseGameMasterOutput` `:193-230`) is deliberately lenient: strip ```` ```json ```` fences,
take first `{` … last `}`, `JSON.parse`, coerce each key to `[]` if not an array, and **return an
empty object on any failure**. There is no schema validation, no type checking of array items, no
range checking, and no retry on parse failure.

### Step 9 — Validation

What exists (all in `stateManager.applyGameMasterOutput`, `stateManager.ts:18-244`):

- NPС re-creation guard: a `newCharacters` entry whose id already exists, or whose
  `revealedName`/`name` collides case-insensitively with any known NPC, is **dropped with a warning**
  (`:152-188`). GM-introduced NPCs always get a fresh uuid and `status:'pending'` (`:323-363`).
- `characterUpdates` are ignored for `pending`/`disabled` NPCs, and `status` can never be changed by
  the model (`:190-205`, `:201-202`).
- `relationshipUpdates` never patch `pending`/`disabled` NPC cards (`:111`).
- `removedItems` only affect an item that exists by name; a missing item is silently ignored
  (`:83-92`).
- Inventory quantity floors by splicing the stack at `<= 0` (`:88`).

What does **not** exist: no check that the player possesses an item being sold, no price or economy
model, no money-affordability check (a `subtract` floors at 0 for money at `:261` but **stats can go
negative** — `applyStatChange` subtract has no clamp, `:269`), no consistency check between narrative
and deltas, no rate limiting, no "proposal → accept" transaction, and no rejection path that tells the
model it was wrong.

### Step 10 — Persistent data modified

`applyGameMasterOutput` mutates in memory and then writes three kinds of file:

- `player.json` via `fm.savePlayer` (`:241`);
- one JSON per NPC via `fm.saveCharacter` (relationship notes append a memory entry with
  `sourceMessageIds`, `:117-132`);
- `state/world-state.json` via `fm.saveWorldState` (`:237`), each event with a fresh uuid, chapter,
  server-stamped `createdAt` offset by index within the call (`:217-236`), and `sourceMessageIds`.

Writes are individually atomic, but the **set of writes is not a transaction**: characters are saved
inside the relationship loop, player at the end, world state in the middle. A crash mid-apply leaves
the save partially mutated. There is no journal, no rollback, no idempotency key.

### Step 11 — Result returned to the player

The streamed tokens are the result; then `assistant-complete` messages, then a `gm_update` SSE event
carrying freshly re-read `player`, `characters`, `worldState` and the human-readable `StateChangeSummary`
(`routes/chat.ts:47-70`; summary strings built in `stateManager.ts:48-49, 62-64, 78, 89, 105, 186, 235`).
The client replaces its store from that payload.

### Step 12 — Stored for future recall

Messages are appended as **JSONL per chapter** (`appendMessage`, `fileManager.ts:991`); summaries are
separate files (`summarizer.ts:89`); NPC memories live on the NPC record; world events in
`world-state.json`. Editing/deleting a message cascades: editing marks memories and world events
`stale` (`stateManager.ts:512,542`), deleting drops entries whose **entire** source-id set vanished
(`:397,449`). That cascade design is genuinely good and worth copying.

### Deterministic vs model — the honest split

| Concern | Who does it |
|---|---|
| Decide what happens in the fiction | **Model** (prose, unconstrained) |
| Decide *whether* an action occurred | **Model** (inferred from prose by the GM call) |
| Decide the magnitude of any change | **Model** (numbers in JSON) |
| Decide legality / preconditions | **Nobody** |
| Apply the change to files | Deterministic code (`stateManager`) |
| Guard NPC identity/status | Deterministic code |
| Context selection, budgeting | Deterministic heuristics |
| Memory write | Deterministic, but content is model-authored |
| Memory retrieval | Deterministic (last N) |

This is the central architectural finding for Corvus: **the model is both narrator and rules engine.**

---

## 4. Nine-scenario traceability

| Scenario | Traceable in source? | Path / gap |
|---|---|---|
| Normal conversation | **Yes, fully** | Steps 1–6, 11–12 above |
| NPC remembering a previous interaction | **Partial** | Memories only appear if the GM emitted `relationshipUpdates.notes` (`stateManager.ts:117-131`); retrieval is `slice(-5)` (`contextAssembler.ts:307`). No salience, no recall by relevance, no forgetting curve |
| Player making a promise | **Not representable** | No promise/obligation/debt type anywhere in `server/types/index.ts`; at best a free-text memory line. Nothing can later check it |
| NPC refusing a request | **Narrative only** | The model can write a refusal; nothing prevents the GM from applying deltas anyway (no link between prose and deltas) |
| Player accepting a quest | **Not representable** | The word `quest` does not occur in `server/` or `client/src/` (0 matches). No quest entity, no objectives, no completion |
| Impossible action | **No enforcement** | `removedItems` silently no-ops if absent (`stateManager.ts:85-91`); `statChanges` accepts any field name and creates it (`:265-270`); no inventory/space/price checks |
| Character acquiring an item | **Yes, mechanically** | `newItems` merges by case-insensitive name and sums quantity (`:70-80`) — but instance identity, provenance and uniqueness are lost |
| NPC reacting to a world event | **Partial** | `worldStateUpdates` are append-only prose (`:207-238`); only the narrator sees the last 10 (`contextAssembler.ts:323-332`). NPC cards are not notified, and there is no event→NPC propagation |
| Consequential action persisting across sessions | **Yes, but not transactionally** | Files persist (step 10), atomic per file, no cross-file transaction, no schema version, no migration, no integrity check on load (`readJson` returns `null` on parse error, `fileManager.ts:159-172`) |

---

## 5. Data model

`server/types/index.ts` (540 lines) is the whole schema:

- `GameConfig` (`:5`) — id, name, genre, description, timestamps, settings overrides.
- `WorldInfo` (`:15`) — setting, tone, rules, customInstructions, currencyName, era,
  `narratorEnabled?`. **All free text.** No locations, no map, no factions, no time.
- `PlayerCharacter` (`:49`) — name, backstory, appearance, `stats: Record<string, number>`,
  `money {currencyName, amount}`, `extraCurrencies?`, `abilities[]`, `inventory[{name,description,quantity}]`,
  `relationships: Record<id, {name,disposition,notes}>`.
- `NPCCharacter` (`:163`) — id, name, revealedName, `status: active|pending|disabled`,
  appearance/personality/background/knownInfo/dispositionTowardPlayer (strings), `memory[]`,
  voiceStyle, `tts?`, `chatColor?`, `actionColor?`, `image {basePrompt, coreAppearance,
  defaultOutfit?, baseNegative, lastPrompt, lastSeed, identitySeed, portraitPath}`.
- `ChatMessage` (`:211`) — id, role, `type: narrator|character|mixed|user|system`, content, timestamp,
  characterId?, modelParams?, alternatives?, chapter?, summarized?.
- `WorldState` (`:340`) — `events: WorldStateEvent[]` + `locationStates: Record<loc, string>`.
- `Summary` (`:533`), `GameMasterOutput` (`:276`) and its parts, `LMStudioSettings` (`:371`),
  `ComfyUISettings` (`:418`), `TTSSettings` (`:449`), `EngineSettings` (`:426`),
  `AppearanceSettings` (`:436`), `GlobalConfig` (`:479`).

**This is a text-RPG state model.** It cannot express: position, distance, containment, terrain,
time of day, combat state, item instances, ownership, prices, quests, obligations, factions, laws, or
causal chains. The brief's suspicion is confirmed at schema level: Corvus's state model **cannot**
represent OpenWorld's simulated world. Adopting it wholesale would be a regression from a
1,024-map/1,654-person simulation to a few JSON documents of strings.

What *is* transferable: the shape of `NPCMemoryEntry` (`:77`) with `sourceMessageIds` + `stale`, the
`WorldStateEvent` provenance pattern (`:293-338`), the per-turn `StateChangeSummary` for UI feedback,
and the `Alternatives` mechanism on messages (`:205-209`).

---

## 6. Prompt and context engineering (what is genuinely good here)

- **Speaker-tagged multi-NPC output with block budget**: one completion voices narrator + several
  NPCs, split deterministically into per-speaker messages (`narrator.ts:105-213`,
  `speakerSplitter.ts:38`). This preserves voice while keeping one HTTP call — a real cost insight.
- **Single-speaker lockdown** for "prompt this NPC to speak" (`narrator.ts:82-92`) and group scenes
  restricted to explicit participants (`:53-56`) — prevents the model inventing speakers.
- **Continuation framing** for empty input (`:77`) — supports "advance the scene" without saving
  empty bubbles (`orchestrator.ts:139-158, 315-324`).
- **Thinking-model hygiene**: streaming stripper, tag stripper, prose-reasoning stripper
  (`thinkStripper.ts`, used at `orchestrator.ts:203-234`) — a real-world necessity with local models.
- **Provenance cascade**: stale-marking on edit, cascade-delete on message deletion, regen
  invalidation (`stateManager.ts:397-566`, `orchestrator.ts:491-512`). This is more mature than most
  hobby projects and directly relevant to our event-history requirement.
- **Per-game lock** and atomic file writes (`fileManager.ts:182-263, 411`).
- **Context budget with ordered degradation** (`contextAssembler.ts:124-145`).

---

## 7. Provider coupling and orchestration limits

- The provider layer is one shape: `LMStudioSettings` (`types/index.ts:371`) — url, model,
  temperature, topP, maxTokens, apiKey?, model?, jailbreakPrompt?. One endpoint per installation,
  one model for **every** task (narrator, GM, summarizer, design chat, image prompts), one sampling
  setting. No roles, no per-task routing, no capability metadata, no cost tracking, no usage
  reporting, no token counting from the provider, no retries, no backoff, no rate-limit handling, no
  timeout on chat completions (only `testConnection` has a 10 s abort, `lmStudio.ts:331-342`).
- `buildUrl` (`:76-83`) handles a trailing `/v1`; `providerLabel` (`:62-68`) is cosmetic only.
- No tool calling: `grep -rinE "tool_call|tools:"` over `server/` → 0 matches.
- No structured output mode: JSON is obtained by *asking politely* plus lenient parsing
  (`gameMaster.ts:11, 193`). This is the weakest link in the whole pipeline.
- No streaming abort when the upstream is slow; only client-disconnect abort
  (`routes/chat.ts:160-161`).
- The "jailbreak prompt" is prepended to **every** request including the GM and the summariser
  (`lmStudio.ts:52-59`) — a configuration that can silently corrupt structured output.

---

## 8. Security and privacy findings (for Report 08, recorded here with evidence)

1. **CORS reflects any origin with credentials** (`server/index.ts:63-68`). Combined with **no
   authentication**, any web page the user visits can `fetch('http://127.0.0.1:3000/api/...')` and
   read or modify every game, save, character and setting on the machine. This is a real,
   exploitable local-service vulnerability, not a theoretical one.
2. **Path traversal in game ids**: `gameDir(gameId) = path.join(this.gamesDir(), gameId)`
   (`fileManager.ts:745`) with route params used verbatim (`routes/chat.ts:111`, `routes/games.ts:116`).
   Express URL-decodes `%2e%2e%2f`, so `../` segments reach `path.join`. Combined with (1) this is
   file read/write outside the data directory.
3. **API keys stored in plaintext** in `~/corvus-data/config.json` (`LMStudioSettings.apiKey`,
   `TTSSettings.apiKey`), returned to the client by the settings route, and sent to whatever URL is
   configured (`lmStudio.ts:34-36`). Key exfiltration is one settings write away.
4. **50 MB JSON bodies** accepted (`index.ts:71-72`) plus 50 MB multer memory uploads
   (`routes/images.ts:24`, `routes/comfyui.ts:22`) — memory-exhaustion surface on a localhost service.
5. **No input validation** on model output, saves or settings shapes; `readJson` swallows parse
   errors to `null` (`fileManager.ts:159-172`), which silently resets state rather than failing.
6. **Prompt injection** is unmitigated: world text, NPC cards, memories and player input are
   concatenated into one system/user prompt (`contextAssembler.ts:76-148`), with no delimiters the
   model is told to treat as data, and the GM is a second model pass over the same untrusted prose.
   There is no allow-list on effect names, no "output must be one of these actions", no sandbox.
7. **Tool/file execution**: none in the server (no shell, no plugin loading). The model cannot run
   code — the only blast radius is the JSON it persuades `stateManager` to write, plus (1)+(2).

---

## 9. Disposition of Corvus components

| Component | Disposition | Reasoning |
|---|---|---|
| Narrator/GM two-pass separation | **ADAPT** | Proven shape; must gain a validated action proposal layer |
| Speaker-tagged multi-NPC output + splitter | **ADAPT** | Directly useful; voice-per-NPC with one call |
| Context assembler's ordered budget + degradation | **ADAPT** | Good bones; replace char/4 estimator with real token accounting |
| Provenance cascade (stale/cascade/delete/regen) | **ADAPT (strongly)** | Directly supports the brief's §7 event-history requirement |
| Per-game lock + atomic writes | **ADAPT** | Small, correct, portable |
| `NPCMemoryEntry` shape | **ADAPT** | Keep ids + `sourceMessageIds`; replace flat slice(-5) retrieval |
| Rolling chapter summariser | **ADAPT** | Keep the idea, not the threshold-on-count policy |
| Whole `server/types` data model | **REIMPLEMENT** | Text-RPG only; cannot host a simulated world |
| `stateManager` delta application | **REIMPLEMENT** | Unvalidated deltas are exactly what the brief forbids |
| Games/saves JSON layout | **REIMPLEMENT** | Single-player documents, no schema, no migration |
| `lmStudio.ts` provider layer | **REIMPLEMENT / SUPERSEDE** | OpenWorld's `models/` is strictly better |
| GM JSON parsing | **REIMPLEMENT** | Replace with schema-validated structured output |
| Image/TTS/ComfyUI/Chatterbox integrations | **DEFER** | Out of scope for the unity objective; separate provider work |
| Character-card import (SillyTavern-style) | **DEFER / STUDY** | Interop opportunity later, not core |
| Security posture (CORS/auth/paths) | **REMOVE the pattern** | Must not be carried into the unified project |
| Client UI (React chat) | **DEFER** | Visual reference only |

---

## 10. Verification matrix

| # | Claim | File:line | Method | Confidence |
|---|---|---|---|---|
| 1 | Per-turn flow: save → context → stream → split → GM → apply → summarise | `orchestrator.ts:89-100,123-349` | SRC | High |
| 2 | Three passes per turn | `orchestrator.ts:205,325,335` + `summarizer.ts:24` | SRC | High |
| 3 | Context priority order and budget | `contextAssembler.ts:43-60,124-188` | SRC | High |
| 4 | NPC relevance = heuristic scoring, top 6 | `contextAssembler.ts:359-406` | SRC | High |
| 5 | Memories = last 5 (narrator) / last 8 (character) | `contextAssembler.ts:307`, `character.ts:41` | SRC | High |
| 6 | GM is a separate non-streaming JSON call at temp 0.2 | `gameMaster.ts:8-68,150-167` | SRC | High |
| 7 | GM output parsed leniently, empty on failure, no schema validation | `gameMaster.ts:193-230` | SRC | High |
| 8 | No tool calling anywhere | `grep -rinE "tool_call\|tools:"` server/ → 0 | SRC | High |
| 9 | No embedding/vector retrieval | `grep -rinE "embedding\|vector\|cosine\|similarity"` server/ → 0 | SRC | High |
| 10 | No retries/backoff/429 handling | `grep -rinE "retry\|backoff\|429"` server/ → 0 | SRC | High |
| 11 | No quest system | `grep -rinE "\bquest(s\|ing)?\b"` server/ client/ → 0 | SRC | High |
| 12 | No tests / no CI | `find` for test/spec/config → none | SRC | High |
| 13 | Stats can go negative; money floors at 0 | `stateManager.ts:257-270` | SRC | High |
| 14 | Not transactional across files | `stateManager.ts:117-241` | SRC | High |
| 15 | CORS any-origin + credentials, no auth | `server/index.ts:63-68` | SRC | High |
| 16 | Path traversal via `gameId` | `fileManager.ts:745`, `routes/chat.ts:111` | SRC (reasoned, not exploited) | High — confirm by test later |
| 17 | "Rolling memory keeps long campaigns coherent" (README) | `summarizer.ts:9-18,24-99` | SRC | High — but only chapter text, no per-NPC memory |
| 18 | Works with LM Studio/vLLM/OpenAI/OpenRouter | `lmStudio.ts:11-18,76-83` | SRC | High (OpenAI-compatible only) |
| 19 | Project builds and runs | `package.json` scripts | — | **NOT VERIFIED** |
| 20 | UI behaviour (chat, group mode, TTS dock) | `client/src/**` | SRC only | **NOT VERIFIED** (not run) |

---

## 11. Agent 2's conclusion

Corvus is a **well-shaped narration pipeline with an unvalidated core and no world model**. Its
single most valuable contribution is the *separation*: a narrator/character pass that produces prose,
and a separate hidden pass that turns prose into structured change, with provenance threaded through
so edits and regenerations can invalidate what they produced. Its most dangerous contribution is the
implication that a language model may decide the numbers and the code may merely write them.

Adopt the orchestration *shape* and the provenance model. Do not adopt the data model, the delta
application, the provider layer, or the security posture.

**Report 03 status: first pass complete.** Still owed: `imageChatAgent.ts` (1,096 lines) and
`fileManager.ts` snapshot/backup paths; `characterCardImport.ts` interop; the TTS/image routes;
and a hands-on run of the pipeline against a local model (requires an isolated disposable environment
and the user's approval, per the audit's restrictions).
