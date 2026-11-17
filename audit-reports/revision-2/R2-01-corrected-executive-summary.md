# REVISION 2 — Corrected Executive Summary

**Status:** architecture correction only. No implementation, no repository modification, no merge.
**Supersedes:** nothing. Reports 00–12 are preserved unmodified in `audit-reports/`. This is a parallel,
corrected set; every correction names the original report, section and claim it replaces.
**Date:** 2026-11-16.
**Evidence base:** a clean shallow clone of `SihanXU/openworld` at commit
`e3cadf35e655f370963181b387fba60e139b692a` (same commit Report 00 audited), read directly for this
revision. Corvus findings are carried from Report 03 **unchanged** and are not re-litigated here; the
Corvus clone was not re-read, so Corvus facts in this set are marked `REPORT 03` rather than `SRC`.
**Runtime execution:** none. Nothing in this revision was installed, built, typechecked or run. All
build/test claims are `NOT RUN` — see R2-09.

---

## 1. What this revision changes, in one paragraph

Report 05 and Report 10 built the fused AI around a single claim: that Corvus's `GameMasterOutput` is
"validated using OpenWorld's `validatePatch`". **That claim is false and it invalidated the central
mechanism of the design.** `validatePatch` validates a `Patch` — a container of *rule, type and status
definitions* that fill a gap in OpenWorld's rule coverage. It has no concept of stats, items,
currency, relationships, characters or prose. The corrected design replaces that single mis-used gate
with **three separate validated contracts** (RulePatch, ActionProposal, NarrativeOutput), establishes
**one** narration lifecycle in which the engine always resolves before the narrator writes, removes the
Cloudflare/Next.js/Freebuff deployment architecture that was introduced without justification, and
fixes the credential, species, persistence and migration-matrix errors listed in §3.

---

## 2. Verified system facts this revision rests on

All `SRC` facts below were re-read in the clone at the audited commit.

| # | Fact | Evidence |
|---|---|---|
| V1 | A `Patch` is `{ artifacts: Artifact[]; scope?; note?; author?; trigger? }` where an artifact is a **rule, type or status definition**. | `packages/engine/src/mod.ts:29` (`interface Patch`), `:22` (`type Artifact`) |
| V2 | `validatePatch(patch: Patch, ctx: ValidateCtx): ValidationResult` is total (never throws), and checks artefact kind/id hygiene, new type/status problems, rule schema, tag locality, selector/role shapes, effect locality and economy LP. | `mod.ts:1313`, `check()` at `:1319`, `ValidationResult` at `:203`, `idProblem` at `:1302` |
| V3 | The engine's action entry point is `act(verb, actorId, target, opts): Resolution` with `opts = { instrument?, params?, reach? }`; `verb` is exactly `'use' \| 'put' \| 'take' \| 'hands' \| 'move' \| 'craft' \| 'learn'`. | `engine.ts:646`, `types.ts:1762` |
| V4 | `act` builds an event of kind `act/<verb>` (`actEvent`, `engine.ts:622`), resolves it **synchronously**, and returns a `Resolution` `{defined, rule?, leaf?, hole?, open?, fault?}`. | `engine.ts:646`, `rules.ts:453` |
| V5 | Dialogue, trade, gifts, theft and quest talk are **all acts of existing verbs with parameters**, not separate APIs: `talk()` → `act('hands', …, {instrument:null, params:{say, choice}})`, `trade(buy)` → `act('hands', …, {params:{say:'buy', item}})`, `gift` → `act('put', …)`, `pocket(take)` → `act('take', …)`. | `controls.ts:1357` (`talk`), `:1379` (`trade`), `:1392` (`gift`), `:1408` (`pocket`) |
| V6 | An undefined outcome is *held* while the mod port works it out (`UndefinedSink.raise`), otherwise the leaf's default runs. | `engine.ts:35` (`UndefinedSink`), `:396` (`dispatch`), `:427-431` |
| V7 | Effects are ~50 primitives (`spawn, destroy, transform, move, step, addStatus, setProp, hurt, wear, say, log, emote, restyle, quest, emit, …`), plus role-restricted sets for story/quest rules. | `effects.ts:26` (`PRIMITIVES`), `:82` (`RESIDENT_ONLY`), `:84` (`QUEST_ONLY`) |
| V8 | A look is `{body, parts, colors, own?}`; four bodies (`woman, man, girl, boy`), twelve slots, `WORN_SLOTS = {armour, cloak}`; the runtime's body union is **hardcoded code**, not only content data. | `types.ts:1229` (`Look`), `runtime/src/assets/figure/bases.ts:1239` (`BaseBody`), `games/openworld/content/src/looks.ts:17,21,24` |
| V9 | A **string** `look` is a key into the baked **catalog** (`catalog().characters`), resolved by `personLook`; an unknown key silently falls back to a role look. It is not an arbitrary sprite file. | `runtime/src/assets/looks.ts:9`, `render/scene.ts:1296`, `.gitignore:3-4` |
| V10 | Sprites are composed, not fetched: 24×36 frames, 4 facings, 9 rows (5 drawn: walk + idle), anchor row 35. Portraits are 768×1536 composites of 13 ordered layers with per-body bases and per-mood faces. | `figure/sprite.ts:14-33`, `figure/index.ts:14-25`, `docs/looks.md §3` |
| V11 | Persistence is three **IndexedDB** save slots holding one `SaveData` object each (`{version:1, world, state, library, savedAt, codex}`), plus a shared rule-library key. Open questions are saved and their defaults run on load. | `runtime/src/storage.ts`, `runtime/src/saves.ts:6-45`, `engine/src/game.ts:195-200` |
| V12 | Cloud game is `static client + one API service`; the client builds to a static site. The API service is a **loopback-only Node HTTP modder service**, and the editor is Vite/Electron. | `docs/design.md:38`, `:1518`, `packages/ai/src/service/server.ts:1-22` |
| V13 | BYOK: the key is typed in options, sent once to the in-page modder worker, optionally kept in IndexedDB, never sent over the engine port, never into a save or the library, and scrubbed from errors. | `docs/byok.md §2`, `runtime/src/ownModel.ts` |
| V14 | The model interface already supports tool specs, JSON mode, reasoning budget, hedging, deadlines, retries and per-call usage cost. | `ai/src/models/model.ts:22-56` |
| V15 | `241` `*.test.ts` files exist; root scripts are `typecheck`, `test`, `check`, `play`, `build:player`, `gen:world`, `wiki:check`. Node 24, npm 11, `package-lock.json` committed. | root `package.json`, `find` count |

### 2.1 Things Report 04/06/10/11 attributed to OpenWorld that do not exist there

Verified absent by file search and symbol grep across `packages/` and `games/`:

`fileManager.ts` · `withGameLock` · `contextAssembler.ts` · `summarizer.ts` · `stateManager.ts` ·
`orchestrator.ts` · `speakerSplitter.ts` · `WorldStateEvent` · `NPCMemoryEntry` · `sourceMessageIds` ·
`narrativeSnapshot`.

These are **Corvus** files and types (Report 03). Every table in Reports 04, 06, 10 and 11 that gave
OpenWorld a column for "per-game lock", "atomic writes", "context assembler", "chapter summariser",
"provenance cascade" or "`WorldStateEvent`" was wrong. Corrected in R2-03 §6 and R2-07.

---

## 3. Correction index

Each item is worked out in the document named. "Original" quotes the claim being replaced.

| ID | Original claim | Correction | Worked out in |
|---|---|---|---|
| **C-01** | Report 05 §2.1/§2.3, Report 10 §2.3, Report 08 §4.4, Report 12 §2.2: the GM call's output is validated by `validatePatch`. | `Patch` contains rule/type/status artifacts only. It cannot express stat, item, currency, relationship, character or prose changes. Three contracts replace the one. | R2-02 §2 |
| **C-02** | Report 05 §2.1: permitted vocabulary `(b) an Engine.act(...) attempt`, `(engine.ts:622 actEvent)`, with no defined request object. | `act`/`actEvent` are verified (`V3`), but what the model emits must be a **strict ActionProposal** translated to exactly the calls `controls.ts` makes (`V5`). No invented signature. | R2-02 §4 |
| **C-03** | Report 05 §2.2 puts `Engine.act` before prose; Report 06 §2.1 and Report 10 §2.1 put the GM/prose before state; Report 12 §5.1 narrates before the engine. | One canonical lifecycle: engine resolves, authoritative outcome exists, then prose. The narrator never runs first. | R2-03 §2 |
| **C-04** | Report 10 §4: Cloudflare Sites, D1, R2, Durable Objects, OpenNext, Next.js, Freebuff auth, `compatibility_date`, preview/production bindings. | Not established requirements and incompatible with the actual runtime (static client + optional loopback Node service, IndexedDB saves). Removed from the approved design; hosting listed as undecided. | R2-05 §2, R2-06 §6 |
| **C-05** | Report 08 §2.3/§4.2: "API keys must never be stored … use environment variables" while Report 05 §1 keeps browser BYOK. | Four credential classes with distinct lifetimes and transport; one provider abstraction with role routing. No global "env vars only" rule. | R2-05 §3–4 |
| **C-06** | Report 07 §2: four species tiers; Tier 3 (different skeleton) and Tier 4 (non-humanoid) overlap; non-humanoids "use whole-sheet `Entity.look`"; arbitrary sheets implied. | Three mechanical classes defined by skeleton/parts/equipment/portrait compatibility. Tier 3+4 merged. Whole sheets are catalog keys, not arbitrary art. Slot and body additions are **code** changes. | R2-04 |
| **C-07** | Report 04 §1, Report 06 §1, Report 10 §2.2, Report 11 #57: OpenWorld has `fileManager`, `withGameLock`, tmp+fsync+rename atomic writes. | None exist in OpenWorld. OpenWorld's durability is "one IndexedDB write per slot". Corvus's lock and atomic-rename belong to Corvus. | R2-03 §6 |
| **C-08** | Report 06 §2.3/§3: OpenWorld's `WorldStateEvent` (`types.ts:293-338`) with `sourceMessageIds`; `ChatMessage` in OpenWorld; a `narrativeSnapshot` save field. | None exist. OpenWorld has no narrative store at all. Narrative state is a **new** store with a defined relationship to saves. | R2-03 §4–5 |
| **C-09** | Report 11 §3: "A preserve 41 / B adapt 7 / C 1 / D 7 / E 11 / F 5 / Total 72"; the table has 70 rows with 38 A, 9 B, 1 C, 6 D, 9 E, 7 F. | Counts recounted from the table and corrected; duplicate rows merged; "remove" misused for infrastructure, creator, multiplayer, absent items and "no tests". | R2-07 |
| **C-10** | Report 06 §2.1: a "Corvus-style GM output" is validated by `validatePatch`, "then `EffectRunner` applies the change via ordinary rules" with the effect primitives listed. | A validated `Patch` never "applies a change": it installs a rule consulted only at an undefined leaf. `EffectRunner` runs outcomes of *rules*, not of model payloads. | R2-02 §3, R2-03 §3 |
| **C-11** | Report 02 §2.4/§4.2 lists 13 effect primitives (`RESIDENT_ONLY`) as "`PRIMITIVES`". | `PRIMITIVES` has ~50 entries; `RESIDENT_ONLY` is the story/world restriction set. | R2-06 §3.2 |
| **C-12** | Report 08 §2.1: "Retries/backoff/429 … Not verified"; Report 05 §1: "no runtime tool calling in this phase". | `ChatOptions` carries `tools`, `json`, `reasoning`, `hedgeMs`, `deadlineMs`, `retries`; `ModelReply` carries `usage.cost` and `hedged`. | R2-05 §4.3 |
| **C-13** | Report 01 §5 / Report 04 §2 list Corvus's assembler, summariser, lock and atomic writes under "both" projects. | Attribution corrected; only the patterns Corvus actually has are described as Corvus's. | R2-07 §2 |
| **C-14** | Report 09 §2.1: per-directory test counts (engine 7, modules 6, `games/openworld/ai` 17). | Actual: engine 6, modules 0, `games/openworld/ai` 19. Total 241 reproduces. | R2-09 §2 |
| **C-15** | Report 05 §1: "8 providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom + 2 others)". | Exactly eight, enumerated: OpenRouter, Anthropic, OpenAI, DeepSeek, Moonshot, Gemini, Ollama, custom. | R2-05 §4.1 |

---

## 4. The three AI contracts (the corrected core)

Full specification in R2-02. Summary:

**(A) RulePatch** — OpenWorld's own `Patch` (V1). Used **only** when the engine reports an undefined
outcome (`Resolution.hole`/`.open`) and the mod port asks. Validated by `validatePatch` (V2), replayed
in the sandbox against a derived scenario, then installed into the rule library. It changes *rules*,
never a character's state, and it is consulted only where the world says "undefined".

**(B) ActionProposal** — a new, strict, model-emitted object describing *what someone tries to do*
(`actorId`, `verb` from the seven, `target`, `instrument`, an allow-listed `params` bag, `intentText`).
Checked against live world state (actors exist, target exists, verb supported, params legal for that
verb, actor is the seat that owns the turn), then translated to exactly one verified engine call —
`Engine.act(verb, actorId, target, {instrument, params})` or one of the `Controls` wrappers that make
the same call (V5). It **cannot** write `WorldState`; the engine either resolves it, or returns
`{defined:false}`, which the narration layer must report as a failure.

**(C) NarrativeOutput** — speaker-tagged prose (`narrator` or a known entity id), structurally
validated (known speakers only, block/size limits, no player impersonation), stored in the narrative
store, never in `WorldState`, and never consulted by the engine.

**The AI's entire vocabulary is these three.** No deltas to `WorldState`; no prose-shaped state
changes; no "GM output" validated against a rules schema.

---

## 5. One canonical lifecycle

Full detail and the ten required interaction classes in R2-03 §2.

```
input → (deterministic control, if one exists)
      → intent interpretation → ActionProposal (strict JSON)
      → validation against world state
      → Engine.act(...)  [synchronous; may hold up to AI_WAIT_MS while ModPort answers]
           ↳ undefined outcome → ModPort → RulePatch → validatePatch → sandbox → library → outcome
      → Resolution + outcome digest (fx/log/say/emote, touched entities before/after)
      → authoritative save
      → narrator (prose from the digest only; forbidden to add outcomes)
      → NarrativeOutput validation → narrative store
      → client → memory/provenance → summary
```

Why this order and not Corvus's: Corvus has no resolver, so its prose *is* the outcome and a second
call infers deltas from it. OpenWorld's `act` is synchronous and authoritative (V4), so there is
nothing to narrate until it returns, and a narrator that ran first would be describing an outcome the
engine had not yet produced. The engine-first order is also the only order in which "the narrator
cannot invent a successful outcome" is structurally true rather than merely instructed.

---

## 6. What is removed, deferred and kept

| Item | Decision | Reason |
|---|---|---|
| Cloudflare Sites / D1 / R2 / Durable Objects / OpenNext / Next.js / Freebuff auth | **REMOVED** from the approved design | Never a requirement; no D1/R2/DO/Next.js anywhere in either repository; the real runtime is a static client with browser storage (V11, V12) |
| Corvus's `GameMasterOutput` delta application | **REJECTED** | Unvalidated state deltas; forbidden by the objective |
| `validatePatch` as a narrative/state gate | **REJECTED** (C-01) | Wrong contract |
| Prose written into `WorldState` fields (`narrativeProse`, `narrativeScene`, `narrativeTurnId` — Report 10 §2.3) | **REJECTED** | Pollutes the deterministic state object and its save format; replaced by a separate narrative store (R2-03 §5) |
| Species Tiers 1–4 | **REPLACED** by three mechanical classes (R2-04) | Tier 3/4 overlapped and ignored that a new body needs code changes plus every part redrawn for it |
| OpenWorld kernel, rules/holes, effects, write guard, sandbox, determinism, format/compiler, editor, 241 tests, provider layer | **KEEP** | Verified present and load-bearing |
| Corvus's narration *shape* (two-pass idea, speaker tags, context budget, stale/cascade provenance, per-game lock, atomic file writes) | **KEEP AS REFERENCE PATTERN**, re-implemented against OpenWorld types | Its data model and delta application are not adopted |
| Autonomous creator, agent/RSI harness, wiki generator, committed art/audio assets, TTS/image providers | **DEFER** (not remove) | Useful functionality outside the initial scope (C-09). The art *pipeline* itself is preserved — species work is impossible without it |

---

## 7. Final decision

**PROCEED WITH MODIFICATIONS.**

The combination is sound *and* the original proposal was wrong in its central mechanism. Specifically:

1. **Proceed** with OpenWorld as the authoritative simulation kernel and the only writer of world
   state. Nothing found in this revision weakens that; the write guard, sandbox, hole system and
   determinism are exactly the properties the objective needs.
2. **Proceed** with Corvus as a *reference for narration orchestration only* — speaker-tagged output,
   context budgeting with ordered degradation, provenance/staleness on edits, and the per-turn lock
   idea. Its data model, its GM delta application and its security posture are not adopted.
3. **Do not proceed** with the single-contract design of Reports 05/06/10/12. It is replaced by
   RulePatch / ActionProposal / NarrativeOutput.
4. **Do not proceed** with the Cloudflare/Next.js/Freebuff deployment architecture.
5. **Do not begin implementation** until the gates in R2-09 pass in a disposable clone and the open
   questions in R2-09 §5 are answered by a human. The first three of those questions (narrative store
   ownership, regeneration semantics, action-proposal ambiguity policy) change the shape of the code.

**Why not "reconsider Corvus":** the narration patterns worth taking are small, well-identified and
independently re-implementable; but nothing in Corvus is *required*. If every Corvus-derived pattern
were dropped, the project would still be coherent — OpenWorld plus a new narration layer. Corvus is a
reference, not a dependency. That is a weaker relationship than Reports 01 and 12 implied, and it is
the honest one.

**Why not "stop pending further investigation":** the blocking unknowns are now enumerated and
testable (R2-09), not architectural mysteries. The one genuinely unresolved design risk — that
model-emitted action proposals will frequently be ambiguous or unsupported — is bounded by a fallback
that already exists in the design: an unsupported proposal becomes a *failed action* narrated as
failure, not a fiction.

---

## 8. How to read this set

| Document | Answers |
|---|---|
| `R2-02-corrected-unified-ai-architecture.md` | The three contracts, their schemas, their validators, their translation to verified engine calls |
| `R2-03-corrected-world-state-architecture.md` | The single lifecycle, narrative state storage, persistence/concurrency/regeneration truth |
| `R2-04-corrected-character-species-architecture.md` | Species compatibility matrix grounded in the real look/sprite/portrait pipeline |
| `R2-05-corrected-security-credential-architecture.md` | Threat model, four credential classes, role-based model routing, deployment trust boundaries |
| `R2-06-corrected-unified-project-architecture-spec.md` | The system as it would be built: packages, interfaces, processes, hosting options (undecided) |
| `R2-07-corrected-migration-matrix.md` | Component-by-component dispositions, recounted and de-duplicated |
| `R2-08-corrected-phased-roadmap.md` | Phases with entry/exit gates, corrected from Report 12 |
| `R2-09-outstanding-questions-and-verification-gates.md` | The verification plan, its current status (`NOT RUN`), and the questions a human must answer |

Reports 00–12 remain in place and unedited. Where this set and the originals disagree, this set is
corrected against source and the originals are the record of what was believed before.
