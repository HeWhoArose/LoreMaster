# REVISION 2 — Corrected World-State Architecture

**Corrections in this document:** C-03 (contradictory lifecycle), C-07 (persistence attribution),
C-08 (invented narrative types), plus the state half of C-10.
**Evidence:** clean clone at `e3cadf3`; nothing executed.

---

## 1. What was wrong

Three reports describe three different execution orders, and two of them contradict themselves.

| Original | Claim | Problem |
|---|---|---|
| Report 05 §2.2 | `Engine.act(...) attempt → engine resolves → … → narration port receives the resolved outcome → generates prose` | **Correct order**, but the diagram then feeds `gm_update (player, characters, worldState, summary)` back into an SSE stream as though the GM call had produced the state (Report 05 §2.3), and Report 12 §5.1 narrates before the engine. |
| Report 06 §2.1 | `Corvus-style GM output → validatePatch → Engine EffectRunner applies the change → WorldState updated → narration port generates prose` | Wrong on both halves: `validatePatch` cannot accept a GM output (C-01), and a validated patch is never "applied" as a state change (C-10). The order *is* engine-then-prose here, but the engine step is fictitious. |
| Report 10 §2.1, §2.3 | Narration port "receives a resolved engine outcome"; but the same document's component table has the GM call producing "structured state changes" that are validated by `validatePatch`, and puts `narrativeProse`/`narrativeScene`/`narrativeTurnId` **inside `WorldState`** | Mixed order + state pollution (C-08). |
| Report 12 §5.1 | `save user msg → assemble context → narrator pass → GM call → … → player reads gm_update → world state updated` | Prose first, state after. This is Corvus's order transplanted onto an engine that owns the state. |

No report reconciles them, so an implementer following Report 12 would build Corvus's inverted
authority with an OpenWorld engine attached.

---

## 2. The one canonical lifecycle

### 2.1 Why this order (source-verified, not preference)

1. **`act` is synchronous.** `Engine.act` dispatches and returns a `Resolution`
   (`engine.ts:646-690`). It does not return a promise, and it does not stream. There is nothing to
   narrate until it returns.
2. **The engine may hold the act while the AI answers.** If the outcome is undefined, `dispatch`
   calls `undefinedSink.raise(ev, res)`; when the mod port holds it, the leaf's default does **not**
   run (`engine.ts:427-431`). The player's own question may block up to `AI_WAIT_MS = 20_000`
   (`quality.ts:37`). So an act can end in one of three states: defined (rule exists), undefined-and-
   answered (a learned rule now exists), or undefined-and-defaulted (nobody answered).
3. **Prose has no authority.** The engine never reads prose. Nothing in `WorldState`, the rule
   library or the save loader consults text. Therefore narrating first changes nothing — it can only
   produce a description that the engine may contradict one call later.
4. **Only the engine knows the outcome.** The outcome digest (see §2.3) is the engine's own record of
   what the run did: `Resolution` fields plus the effects' `fx` entries (`say`, `log`, `emote`, `vfx`)
   and the touched entities' before/after values.

### 2.2 The turn (canonical, numbered)

```
T0  Turn opened. turnId minted. Pre-turn snapshot of WorldState captured into the narrative store
    (needed only for regeneration; see §5.4).

T1  Input received: player text, or a structured control invocation from the HUD
    (talk verb, trade, gift, take, use, craft, learn, move).

T2  Deterministic fast path. If the input is already a structured control (a clicked talk verb, a
    trade button), no model is called. The control's own `Controls` method runs at T4 with its
    parameters. (Verbatim player text skips to T3.)

T3  Intent interpretation. One model call, JSON mode, temperature ~0, purpose 'intent'.
    Output: ActionProposal | {kind:'no-action'} | {kind:'ambiguous', candidates[]}.
    The prompt receives: the player's text, the active map, the entities in reach, the verbs the
    engine supports, and the allow-listed params per verb. It does NOT receive write access.

T4  Proposal validation (no model). Schema, referents, verb, params, authority, posture.
    A rejected proposal does not fall through to narration-as-action: it becomes a failed action
    (T7 with `outcome: rejected`) or, for a malformed proposal, an 'ambiguous' re-ask with a repair
    prompt (bounded to one retry). See R2-02 §4.4.

T5  Engine execution. Exactly one call shape, chosen by the proposal kind:
      act(verb, actorId, target, { instrument, params })          — the general path
      Controls.talk/trade/gift/pocket/…                           — the guard-railed wrappers
    The engine resolves synchronously and may block on ModPort (T5a).

T5a Undefined outcome (optional, inside T5).
      Resolution.hole / .open present → ModPort.buildRequest → model proposes a Patch → validatePatch
      → sandbox replay (buildSandbox + derived expectations) → accepted into the rule library →
      the event is re-resolved with the new rule → T6. If refused, timed out, or no model is
      available, the leaf's default runs → T6 with `filled:false`.

T6  Outcome digest built from engine data only:
      resolution: {defined, filledHole, ruleId?, fault?}
      narrative facts: the fx entries the run pushed (say/log/emote/vfx), ordered
      deltas: for each touched entity, the props/statuses/place that actually changed
      reach/refusals: 'busy', 'out of reach', 'frozen', 'protected', 'no answer'
    A limited summary (bounded counts) is what the narrator sees. The full digest is persisted.

T7  Authoritative save. The engine's state is written to its slot (one IndexedDB write), together
    with the turn record's engine section. This happens BEFORE prose, so a crash between T7 and T8
    loses prose but never state.

T8  Narration. One model call, streaming, purpose 'narration', temperature > 0. Input: the digest,
    the scene context, the NPC cards for speakers, the recent prose window, and the standing rule
    "describe only what the digest says happened". Output: NarrativeOutput (speaker-tagged blocks).

T9  NarrativeOutput validation (no model): speakers known, block count and length within limits, no
    player impersonation, no invented entity ids. Invalid → one repair retry, then a degraded
    template line composed *from the digest* by code (not by a second model).

T10 Narrative store write (one write per turn, keyed by turnId), then client delivery (prose + HUD
    facts). Memory entries derived from the digest's events are written here, idempotently by turnId.

T11 Chapter summary when the threshold is crossed; messages below the cut are marked summarised.
```

### 2.3 Why T7 (save) precedes T8 (prose)

Because they fail differently. A lost save is unrecoverable; a lost paragraph is a retry. Writing
state first also makes regeneration cheap (the state is already durable and the narrative is the only
thing to redo) and makes the provenance relationship one-directional: `narrative.turnId →
state.revision`, never the reverse. See §5.4.

### 2.4 The ten required interaction classes, mapped

| Interaction | Path | Engine call | What the narrator may say |
|---|---|---|---|
| Ordinary conversation | T1 → T2 (talk panel verb) or T3 (`say`) | `act('hands', …, {instrument:null, params:{say, choice?}})` | Only the lines the outcome produced (`say`/`emote` fx) plus environment; it may not grant information the world did not emit |
| Question | as above; engine may answer via `say` with a keyed line or a `@chat` line | same | Same; if the engine emitted nothing, the narrator may describe the silence, not invent an answer |
| Player intention ("I want to buy the sword") | T3 → ActionProposal `say:'buy'` **or** no-action + talk | `act('hands', …, {params:{say:'buy', item}})` | The price the outcome produced; if refused (no such good, no funds), the refusal |
| Purchase / transaction | T2 trade panel → `trade()`; or T3 proposal | `act('hands', …)` buy / `act('hands', …, {instrument:{e:item}, params:{say:'sell'}})` sell | Item and price from the digest; never a price the engine did not compute |
| NPC dialogue | outcome `say` fx (authored lines, `people.ts` keys) then narration | no extra call | The authored line verbatim or paraphrased **only when the digest marks it paraphrased-allowed**; voices per speaker block |
| NPC reaction | engine emits `emote`, status, regard change, or `say` | outcome of the act (e.g. `impulse/strike`, `taken`) | Reaction consistent with the status/regard delta |
| Combat | `act('use', actor, target, {instrument})`; hits resolve as `impulse/strike`/`element` | same | Blows, damage, death **as resolved** (`hurt`, `breakdown`, hp deltas) |
| Quest interaction | `talk(who, 'quest:<ref>:<topic>')` → `act('hands', …, {params:{say:'quest', quest, topic}})`, or `startQuest`/`advance`/`stage` effects | same | Offer/stage/hand-in exactly as the quest moved; never a quest state the engine did not reach |
| Failed action | `act` returns `{defined:false}` (busy, out of reach, frozen, protected) or the proposal is rejected at T4, or the hole defaults | same | Failure, with the reason class from the digest. This is the case the old design could not express |
| Action requiring new rules | T5a hole → ModPort → RulePatch → validate + sandbox | the same original act, re-resolved | The outcome the new rule produced, plus (optionally) a hint that the world learned something |

### 2.5 Prohibitions that follow from the order

- The narrator is never given a tool that mutates, and never runs before T6.
- The narrator's output is never parsed for state. There is no "GM extraction" pass over prose
  (this is the removed Corvus mechanism).
- No model call ever receives `WorldState` or a write-capable API. The intent model sees a
  *projection*; the narrator sees a *digest*.
- If T5 fails (engine error), the turn ends as a failed turn. It does not "continue narratively".

---

## 3. Why the old state-change flow cannot work (C-10)

Report 06 §2.1 drew this:

```
GM output (validatePatch schema) → validatePatch → EffectRunner applies → Writer guard → WorldState
```

Three independent reasons it is impossible:

1. `validatePatch`'s `patch` parameter is typed `Patch` = `{artifacts: Artifact[]}` with
   `Artifact = {kind:'rule'|'type'|'status'}` (`mod.ts:22,29`). `statChanges`, `newItems`,
   `currencyChanges`, `relationshipUpdates`, `newCharacters` are not artefacts; `check()` would
   reject them at the first `artifact[i]: unknown artifact kind`.
2. A validated patch is placed into a rule library at a hole key (`placeKey`/`patchKey`,
   `rules.ts:477,480`) and consulted only when the event falls into an *undefined* leaf. It cannot
   change a defined outcome, so it is not a mechanism for "apply this state change".
3. `EffectRunner` runs an outcome's effects inside `run(effects, ev, ruleId)`
   (`engine.ts:482-495`), under the `Writer` guard, with a rule id. There is no API that applies an
   arbitrary effect array from outside a resolution — by design.

**Corrected decision:** state changes can only arise from (a) an engine-resolved event, (b) an
engine-resolved event whose undefined leaf was answered by a validated rule, or (c) authored content
events (story/quest/world rules). There is no fourth path, and no model payload is a state change.

---

## 4. What narrative state is, and where it lives (C-08)

### 4.1 The original error

Report 06 §2.3 declared OpenWorld's "`WorldStateEvent` (`types.ts:293-338`)" the unified event format
and gave it `sourceMessageIds`; Report 06 §3 added a `narrativeSnapshot` field to OpenWorld's save;
Report 10 §2.3 added `narrativeProse`, `narrativeScene`, `narrativeTurnId` to `WorldState`. **None of
these types or fields exist in OpenWorld** (verified: no `WorldStateEvent`, `ChatMessage`,
`sourceMessageIds`, `NPCMemoryEntry` or `narrativeSnapshot` anywhere in `packages/` or `games/`; the
only `ChatMessage` is the model-layer message union in `ai/src/models/model.ts`). OpenWorld has **no
narrative store at all** — no messages, no prose, no chapter, no per-NPC memory of talk beyond
`NpcData.memory` (lines said, last line, day last talked — `types.ts:788`).

### 4.2 Corrected decision: a separate narrative store

Narrative state is a **peer store**, not a `WorldState` field:

| Property | Authoritative world | Narrative store |
|---|---|---|
| Owner | `packages/engine` (`WorldState`) | new module (`packages/narration`, R2-06 §4) |
| Contents | entities, places, statuses, props, rules, RNG, chunks | turns, prose blocks, summaries, NPC memory entries, digests |
| Determinism | required; replayable from `WorldState.rng` | not required; text is not replayable |
| Save unit | one `SaveData` object per slot (`game.ts:195`) | one turn record per `turnId`, plus summary/memory keys |
| Consumed by engine | yes | **no** |
| Deleted on content-version change | yes (version gate, `game.ts:70`) | policy decision, see R2-09 Q4 |
| Provenance | none needed | `turnId → worldRevision`, `block.sourceTurnIds` |

The linkage is one-directional and immutable: a narrative record names the world revision it was
written against. Nothing in the world ever names a narrative record, so the engine's determinism and
its save format are untouched, and a save without narrative state (or narrative state without a save)
is a detectable, recoverable condition rather than a corruption.

`NpcData.memory` (engine-owned) stays as it is: it is gameplay state (which lines were said, so they
are not repeated). Narrative memory (what a character remembers of *conversations*, with provenance)
is a separate narrative-side structure keyed by entity id — it must never be merged into
`NpcData`, or it becomes authoritative state that the model indirectly writes.

---

## 5. Persistence, concurrency, crash recovery, regeneration (C-07)

### 5.1 What each repository actually provides

| Property | OpenWorld (verified) | Corvus (Report 03) |
|---|---|---|
| Write mechanism | `indexedDB` key/value, one write per slot (`storage.ts:28-38`) | JSON files, `tmp + fsync + rename` (`fileManager.ts:182,223`) |
| Atomic per write | yes — a single IDB transaction per key | yes — rename is atomic |
| Transactional across keys | **no** (slot write, then `lastSlot` write: two keys) | **no** (player, each character, world state written separately) |
| Per-game lock | **none** (`withGameLock`, `navigator.locks`, `BroadcastChannel` all absent) | yes, per-game promise chain (`fileManager.ts:411`) |
| Multi-writer protection | none; two tabs would each own a worker and race on the same IDB key | one process, serialised by the lock |
| Save versioning | content-version gate; a save of another `world` version is discarded (`game.ts:70`) | none |
| Schema version | `version: 1` field, no migration framework | none |
| Rollback | none (3 slots are user-chosen backups, not transactions) | none |
| Idempotency | none | none |
| Crash journal | none | none (`cleanupTempFiles` only sweeps orphaned temp files) |
| Open questions across a crash | saved; their defaults run on load (`saves.ts:6-42`) | n/a |
| Checksum / anti-tamper | none | none |

**Correction:** Report 04 §1 and Report 11 #57 credited OpenWorld with "`fileManager.ts:411`" and
"same pattern as both". OpenWorld has neither a file manager nor a lock. Its durability is simpler
than Corvus's: an atomic single-key browser write, and no protection whatsoever against two writers.

### 5.2 The concurrency decision

- **Single writer:** one engine worker per page owns `WorldState`. All turns for a save slot are
  serialised through a per-slot turn queue in the page (new code; not present in either repository).
- **Single tab, enforced:** a lease key in IndexedDB (`narration:lease:<slot>` with a heartbeat) plus
  `navigator.locks` where available. Two live tabs on one slot is a data-loss bug; it must be
  detected and refused, not hoped against. This is new work and belongs in Phase 3 (R2-08).
- **No cross-process lock is possible** in the current architecture, because there is no process: the
  authoritative state lives in a browser worker. Corvus's `withGameLock` is therefore *not portable*
  as-is; its idea (serialise turns per game id) maps to the turn queue, not to a file lock.

### 5.3 Crash, interruption and re-entrancy

| Failure point | State | Prose | Recovery |
|---|---|---|---|
| Crash before T5 returns | unchanged | none | turn simply never happened; the pre-turn snapshot is discarded |
| Crash during T5a (mod port waiting) | unchanged; a pending question may be in memory | none | on load, the question is not persisted → defaults do not run → the act is simply lost. Acceptable, but note it: unlike the save-time case, an in-flight question dies with the page |
| Crash after T5, before T7 | mutated in memory only | none | lost; the last durable save is the state before the turn |
| Crash after T7, before T10 | **saved** with mutation | none | the turn exists in the world with no prose. Detected by `state.revision` ahead of the last narrative `turnId`. Repair options: (a) leave it and continue (state is authoritative), (b) re-run only the narrator from the persisted digest. (b) is safe because the digest is engine-derived |
| Crash mid-narrative write | saved; prose partially written | partial | one record per turn means no partial record; a torn write is impossible at the IDB transaction level. An interrupted *stream* leaves no record (record is written at T10, after validation) |
| Regen of a turn that mutated state | saved | replaced | restore pre-turn snapshot (bounded, §5.4), re-run from T5 |

The invariant that makes this tractable: **state is the durable truth, prose is a durable but
disposable annotation, and the digest is the bridge.** Nothing is ever reconstructed by asking a model
what happened.

### 5.4 Regeneration

Corvus regenerates by rewriting prose and cascading stale marks over derived records. That works
there because prose *is* the outcome. Here it does not: a turn may have mutated the world, and the
engine has no undo (no transaction log, no inverse effects).

Corrected rule:

1. A turn whose digest says `mutated: false` regenerates freely: re-run T8 only, replace blocks under
   the same `turnId`, keep `sourceTurnIds` stable.
2. A turn whose digest says `mutated: true` regenerates by **restoring the pre-turn snapshot** kept
   for that turn (T0), then re-running T5–T10. Snapshots are bounded (design target: last 10 turns;
   a sparse save is small — Report 02's ~89 KB figure is `DOC`-only, so measure before promising).
3. Turns older than the snapshot window are not regenerable. The UI must say so. Editing the player's
   input of such a turn must be refused, not silently applied.
4. Deleting a message marks derived narrative records `stale` (Corvus's useful pattern) and never
   re-runs effects. Stale prose stays visible with a marker; it is not deleted silently.

---

## 6. Migration of Corvus's world-state gesture

| Corvus mechanism | Correction |
|---|---|
| `WorldInfo` + `PlayerCharacter` + `NPCCharacter[]` + `ChatMessage[]` + `WorldState{events, locationStates}` | Not adopted. OpenWorld's `WorldState` is the world. Narrative types are new and minimal (§4.2). |
| `worldStateUpdates[{event, location, timestamp}]` as "recent events" for context | Replaced by the narrative store's turn digests (engine-derived), not model-authored event strings |
| `locationStates: Record<loc, string>` free-form location prose | Replaced by the engine's map/region data plus narrative scene description attached to the turn |
| `statChanges` / `currencyChanges` / `newItems` / `removedItems` | Not adopted as an input format. The engine's effects are the only mutation vocabulary; a model that wants an item spawned must have a *rule* that spawns it when its host's undefined event occurs |
| `relationshipUpdates[{id, disposition, notes}]` | Regard is engine state (`modules/society`); the model cannot set it. Narrative "notes" about a person belong to the narrative memory store |
| `newCharacters[{…NPCCharacter}]` | Creating an entity is a `spawn` effect inside a rule outcome, or authored content. Never a model payload |

This is the deepest change from Report 01's framing: there is **no model→state channel at all**, not
even a validated one. There are only rules (which the engine consults) and proposals (which the
engine resolves).
