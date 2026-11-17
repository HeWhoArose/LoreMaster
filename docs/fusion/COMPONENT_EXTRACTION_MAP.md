# Component extraction map

Classification: **Reuse** (kept as-is), **Adapt** (port of the working idea into OpenWorld types),
**Replace** (an OpenWorld mechanism does it better), **Build** (absent, written for this fusion),
**Exclude** (not wanted, or unsafe).

No Corvus file is imported by the shipped code. Corvus is Node/Express/React; LoreMaster's runtime is a
browser Worker with a simulation engine. "Adapt" therefore means *the algorithm and data shape were carried
over into a dependency-free module*, not a file copy. Corvus's contribution is documented per component.

| Corvus component | Path | Class | In LoreMaster | Notes |
| --- | --- | --- | --- | --- |
| Narrative contracts (`NPCCharacter`, `WorldState`, `GameMasterOutput`, `Summary`) | `corvus-reference/server/types/index.ts` | Adapt | `packages/narration/src/contracts/index.ts`, `engine/port.ts`, `memory/index.ts` | Kept the *shape* of a character card, a turn summary and a structured model reply. Replaced free-form `GameMasterOutput` with `ActionProposal` (engine verbs only) + validated `NarrativeOutput` + separate `RulePatch`. |
| Context assembly + token budgeting (`assembleContext`, `estimateTokens`) | `corvus-reference/server/services/contextAssembler.ts` | Adapt | `packages/narration/src/context/index.ts` | Same idea (ordered, budgeted sections), but sections are OpenWorld facts: player, condition, place, nearby entities, NPC cards, recalled memories, rules, recent turns, chapter summary. Char/4 token estimate kept. |
| Narrator prompt & beat writing | `corvus-reference/server/services/narrator.ts` | Adapt | `packages/narration/src/director/index.ts`, `provider/mock.ts` | The director owns intent classification and co-ordinates narration; prompt text is deferred to a live provider (`LIVE_AI_ACTIVATION.md`). |
| Character agent / personality | `corvus-reference/server/services/character.ts` | Adapt | `packages/narration/src/memory/index.ts` (`NpcCard`), `contracts` (speaker + mood) | Personality, voice, disposition and knowledge live on `NpcCard`, built from the entity's own `npc.person`/`npc.memory`. |
| Speaker attribution (`[Narrator]`, `[Character: X]`) | `corvus-reference/server/services/speakerSplitter.ts` | Adapt | `packages/narration/src/contracts/index.ts` (`NarrativeBlock`, `speaker`), validated in `validateNarrativeOutput` | Instead of tag-parsing prose, speakers are structured fields checked against the NPCs actually present. A speaker who is not in the view is rejected. |
| Hidden game master JSON → state writes | `corvus-reference/server/services/gameMaster.ts`, `stateManager.ts` | Replace | `packages/narration/src/act/index.ts`, `turn/index.ts` (stage `act`) | Corvus lets the model mutate state. LoreMaster accepts only `ActionProposal`s over the seven engine verbs, validates them, and applies them with `Engine.act`. |
| Orchestrator (turn driver) | `corvus-reference/server/services/orchestrator.ts` | Adapt | `packages/narration/src/turn/index.ts`, `director/index.ts` | Same responsibilities (assemble → call model → apply → summarise → persist), rebuilt as an explicit 11-stage machine with discriminated results. |
| Rolling summaries / chapter memory | `corvus-reference/server/services/summarizer.ts` | Adapt | `packages/narration/src/history/index.ts` | Keep the last `VERBATIM_TURNS = 10` turns verbatim, condense older turns into a rolling summary, and open a `ChapterRecord` when the place changes. Deterministic condensation (no model call) so it works with live AI off. |
| NPC memory (relationships, known info) | `corvus-reference/server/services/stateManager.ts`, `character.ts` | Adapt | `packages/narration/src/memory/index.ts` | Per-NPC `MemoryEntry` list with kinds, relevance scoring (keyword overlap + recency), regard/deed updates, pruning. Memories are stored per NPC: one NPC's private memory is never put in another's context. |
| Provider call (LM Studio, OpenAI-compatible) | `corvus-reference/server/services/lmStudio.ts` | Adapt | `packages/narration/src/provider/index.ts`, `provider/mock.ts` | Same request shape (`messages`, JSON mode), now behind `NarrativeProvider` with two methods (`propose`, `narrate`). Only the deterministic `MockNarrativeProvider` ships active. |
| Thinks stripper | `corvus-reference/server/services/thinkStripper.ts` | Exclude | — | Live-model hygiene; not needed while no model is called. Documented for the live provider instead. |
| File manager (JSON chapters on disk, per-game lock) | `corvus-reference/server/services/fileManager.ts` | Replace | `packages/narration/src/persistence/index.ts`, `packages/runtime/src/storage.ts` | Browser/Android cannot use `fs`. Narrative state is a separate IndexedDB record (`narrative:<base>|<version>`) next to the save, with an injectable `KeyValue` so tests run in memory. |
| Express routes (`chat`, `settings`, `games`, `characters`, …) | `corvus-reference/server/routes/*`, `server/index.ts` | Exclude | — | No server is added: the mission forbids a permanent backend, and the routes carry permissive CORS, key exposure and path handling we must not reproduce. |
| React client (chat UI, hooks, TTS, image studio) | `corvus-reference/client/src/*` | Exclude | Replaced by `packages/runtime/src/ui/narrative.ts` | The game's UI is DOM + Phaser inside the runtime; a second React app would be a second application. The panel reproduces what matters: transcript, speakers, choices, status, retry. |
| Image generation / ComfyUI / TTS | `corvus-reference/server/services/{comfyui,chatterbox}.ts`, `routes/{images,tts}.ts` | Exclude | — | Out of scope for the narrative fusion; no network services are introduced. |
| Agent bridge routes | `corvus-reference/server/routes/agents.ts` | Exclude | OpenWorld already has `packages/bridge` and `AgentHost` | Duplicate system. |
| Narration contracts `ActionProposal`/`NarrativeOutput`/`RulePatch` (pre-existing LoreMaster scaffold) | `packages/narration/src/contracts/index.ts` | Build (repaired) | same | File did not compile; validators rewritten against the actual types, `VERBS` tied to the engine's verbs, speaker/param checks added. |
| Proposal → engine action (pre-existing) | `packages/narration/src/act/index.ts` | Build (repaired) | same | Highest-confidence ambiguity resolution deleted; returns `ready` / `clarification_required` / `no_action` / `invalid`. |
| Outcome digest (pre-existing `buildDigest`) | `packages/narration/src/digest/index.ts` | Build (extended) | same | Now fed from the real `EngineOutcome`/`Resolution`, plus deterministic fallback prose when no model speaks. |
| Turn machine, memory book, history, director, provider, persistence, runtime port, UI panel | — | Build | `packages/narration/src/{turn,memory,history,director,provider,persistence}`, `packages/runtime/src/narrative`, `packages/runtime/src/ui/narrative.ts` | Did not exist in either tree in this form. |

## Deliberately not carried over (security)

| Corvus behaviour | Why excluded | What LoreMaster does |
| --- | --- | --- |
| Credentialed CORS for arbitrary origins | Any page could spend the user's key | No server; the game never sees a provider key. |
| `gameId` used in filesystem paths | Traversal | Storage is a namespaced IndexedDB key built from the world base + content version. |
| Settings endpoint echoing provider config | Key disclosure | Nothing is echoed; the existing BYOK dialog keeps keys in the browser. |
| Unbounded request bodies / unbounded history in prompts | Memory and cost blow-up | `ContextBudget` caps every section; history keeps 10 verbatim turns. |
| Model output applied directly to state | Authoritative world corrupted by prose | `ActionProposal` → validation → `Engine.act`; narrative output has no mutation path. |
