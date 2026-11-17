# REPORT 12 – Phased Roadmap

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. Roadmap overview

The roadmap is structured in **phases**, from MVP (minimum viable unified project) to full integration. Each phase builds on the previous one, and the decision gate at the end of Report 01 determines whether proceed.

| Phase | Goal | Key deliverables | Decision point |
|---|---|---|---|
| **Phase 0** | **Setup & foundation** | - Audit complete (Reports 00–12)<br>- Migration matrix decided<br>- Project structure defined<br>- Dispositions applied | After Report 12; PROCEED WITH PROPOSED COMBINATION / PROCEED WITH MODIFICATIONS / RECONSIDER / DO NOT PROCEED |
| **Phase 1** | **Narration port MVP** | - Narration port beside ModPort (new component)<br>- GM call with strict `validatePatch` schema (replace lenient parsing)<br>- Narrator pass with `[Narrator]` / `[Character: Name]` blocks<br>- Speaker block splitter adapted from Corvus<br>- Provenance cascade on ChatMessage (stale/cascade/delete)<br>- Per-game lock + atomic writes (keep both)<br>- Context assembler with real token budgeting<br>- Chapter summariser (oldest-half, version-gated)<br>- NPC memory with `sourceMessageIds` + relevance-aware retrieval (replace `slice(-5)`)<br>- OpenWorld save format with optional `narrativeSnapshot` | End of Phase 1: verify narration port produces correct prose + structured GM output; unit tests for splitter, provenance, memory |
| **Phase 2** | **Security hardening** | - CORS origin-locked (not any-origin + credentials)<br>- No API keys in response bodies; env vars only<br>- All user-supplied IDs validated (reject `\`, `/`, `.`, `..`)<br>- Write guard surrounds all state mutations (already in OpenWorld)<br>- Model output schema-validated against `validatePatch` (critical)<br>- Retries/backoff/429 handling for all provider calls<br>- 50 MB body size limit (reduce from 50 MB)<br>- Prompt injection mitigation: delimiters, data/variable separation | End of Phase 2: security audit pass; no CORS/key/path traversal vulnerabilities; structured output gate verified |
| **Phase 3** | **Species extension framework** | - Four-tier species addition system (Tier 1–4)<br>- Tier 1: minor phenotype (share existing bodies, add part tags)<br>- Tier 2: new body, same skeleton (new body in LookTable, new frames, portrait set)<br>- Tier 3: different skeleton (new bodies, new parts, new frames, new portraits, equipment mappings)<br>- Tier 4: non-humanoid (whole-sheet `Entity.look` key; no part-composed look)<br>- Update `generateLook` with OWN_STREAM for new slots<br>- Portrait pipeline extended for new colour schemes | End of Phase 3: new species can be added without breaking existing content; test with at least 2 Tier 1 and 1 Tier 2 species |
| **Phase 4** | **Full integration test** | - End-to-end play: player talks to NPC → narrator prose → GM state changes → world state updated → prose returned to player<br>- Determinism verification: replay from saved state produces same world state<br>- Save/load round-trip with narrativeSnapshot<br>- Multiple species in same world<br>- Editor integration: new species appear in look editor<br>- CI: narration port tests + security checks + no_ai job | End of Phase 4: fully playable fusion of OpenWorld engine + Corvus narration; determinism verified; CI passes |
| **Phase 5** | **Polish & extensibility** | - Wiki generator (per-item/person/quest completeness)<br>- Art/audio assets integration (689 MB; Python + ComfyUI)<br>- Agent/RSI harness (research apparatus, not gameplay)<br>- Autonomous creator workshop<br>- Additional provider configurations<br>- Multi-player/networking feasibility study (if desired)<br>- Localization expansion (new languages for prose, UI) | Ongoing; not time-boxed; add as resources and requirements dictate |

---

## 2. Phase 1 detailed tasks

### 2.1 Narration port implementation

The narration port is a new Node.js module (likely in a new `packages/narration/` workspace package, following OpenWorld's npm workspace pattern). It does NOT modify any existing OpenWorld or Corvus files (read-only audit guarantee).

**Module structure:**
```
packages/narration/
  src/
    index.ts        export NarrationPort
    narratorPrompt.ts  buildNarratorSystemPrompt (adapted from Corvus)
    gmPrompt.ts       GM system prompt with validatePatch schema
    contextAssembler.ts unified context assembler (priority order + token budget)
    speakerSplitter.ts adapted splitIntoSpeakerBlocks
    provenanceCascade.ts stale-marking + cascade-delete + regen invalidation
    memoryManager.ts NPCMemoryEntry + relevance-aware retrieval
    types.ts shared types (NarratorBlock, GMOutput, etc.)
  test/
    narrator.test.ts
    gm.test.ts
    splitter.test.ts
    provenance.test.ts
```

**Key interfaces:**
```typescript
// NarrationPort — the single public API
interface NarrationPort {
  // Generate prose from a resolved engine outcome
  generateProse(outcome: GMOutput, context: Context): Promise<NarrativeOutput>;
  
  // Parse player intent into an Engine.act(...) attempt
  parseActIntent(content: string, context: Context): Promise<ActRequest>;
  
  // Handle a full turn: narration + GM
  handleTurn turn: TurnInput): Promise<TurnOutput>;
}

// NarrativeOutput — prose only, NOT authoritative state
interface NarrativeOutput {
  prose: string;        // raw prose with [Narrator] / [Character: Name] blocks
  speakerBlocks: SpeakerBlock[];  // split and coalesced
  summary?: string;     // optional chapter summary
}

// GMOutput — strictly validated against validatePatch schema
interface GMOutput {
  statChanges: Array<{field: string, operation: 'set'|'add'|'subtract', value: number, reason: string}>;
  newItems: Array<{name: string, description: string, quantity: number}>;
  removedItems: Array<{name: string, quantity: number}>;
  relationshipUpdates: Array<{id: string, disposition: number, notes: string, revealedName: string}>;
  newCharacters: Array<{id: string, name: string, revealedName: string, status: 'active'|'pending'|'disabled', image?: {basePrompt: string, coreAppearance: string, defaultOutfit?: string, baseNegative: string, identitySeed: string}>;
  worldStateUpdates: Array<{event: string, location?: string, timestamp: number}>;
  characterUpdates: Array<{id: string, patch: Record<string, any}>;
  currencyChanges: Array<{name: string, operation: 'set'|'add'|'subtract', value: number, reason: string}>;
}
```

### 2.2 GM call with strict validation

The GM call replaces Corvus's lenient `parseGameMasterOutput` with OpenWorld's `validatePatch` schema:

```
System prompt (see Report 05, §3.2.2): 
  "You are the hidden GAME MASTER. Read the most recent exchange between the
  player and the story response, and emit a structured JSON object describing
  any state changes that should happen.
  The JSON schema is strictly validated. Emit ONLY the JSON object, no prose,
  no fences, no extra text. See the schema definition in the documentation."

Response format: strict JSON, any failure → reject and retry (not lenient fallback).

Temperature: 0.2 (deterministic JSON).
Max tokens: max(4096, cfg.maxTokens).

Parsing: 
  1. Strip ```json``` fences if present
  2. Find first `{` and last `}` 
  3. JSON.parse
  4. Validate against validatePatch schema (openWorld/src/mod.ts:1313)
  5. If validation fails → reject and retry with different model or higher temperature
  6. If validation succeeds → return the parsed object
```

### 2.3 Context assembler (unified)

Keep Corvus's priority order with OpenWorld's token estimate:

1. System prompt
2. `# WORLD` block (setting, era, tone, currency, rules, custom instructions)
3. `# PLAYER CHARACTER` (name, appearance as look-generated k=v, stats as k=v, money, extra currencies, abilities, inventory as name+quantity, relationships as name+disposition+notes)
4. Up to 6 relevant NPC cards (heuristic scoring: active +100, mentioned +50, recency; each appearance as speaker in last 30 messages +10 + proximity; each name/revealedName substring hit in message bodies +2 + floor(proximity/5); filter score>0, sort desc, slice 6)
5. `# WORLD STATE (recent events)` (last 10 events, oldest first; with `[UNRELIABLE]` on stale events from provenance cascade)
6. All chapter summaries (threshold-based oldest-half; mark oldest first)
7. Recent chat messages (newest-first until budget exhausted)

Budget: `availableForPrompt = max(512, contextWindowBudget - reservedResponseTokens)`;
token estimate: real token counter preferred, `ceil(chars/4)` fallback.

Ordered degradation: drop summaries oldest-first, then NPCs from the least relevant end.

If the system part alone is over budget → drop summaries oldest-first, then NPCs from the least relevant end, before any other degradation.

### 2.4 NPC memory (relevance-aware)

Keep Corvus's `NPCMemoryEntry` shape: `{id, chapter, event, sourceMessageIds?, stale?, createdAt?}`; but replace flat `slice(-5)` / `slice(-8)` with relevance-aware retrieval:

- **Salience scoring**: each memory entry scored by `recency + sourceMessageId importance + event centrality`
- **Decay curve**: older memories scored lower; exponential decay based on `age_days = currentChapter - entry.chapter`
- **Top-N selection**: return top-k by salience, not by recency alone
- **Forgetting threshold**: entries below a salience threshold are omitted (simulating forgetting)

This directly supports the brief's event-history requirement and is a net improvement over Corvus's tail-based retrieval.

### 2.5 Provenance cascade (stale/cascade/delete/regen)

Adapt from Report 03, §4 and Report 08:

- **Stale-marking on edit**: when a ChatMessage is edited, mark all memories and world events that reference its UUID as `stale` (`stateManager.ts` analogue for OpenWorld)
- **Cascade-delete on message deletion**: when a ChatMessage is deleted, drop all memories and world events whose entire source-id set vanishes (`stateManager.ts:397,449` analogue)
- **Regen invalidation**: when a turn is regenerated, invalidate memories and world state produced by the previous turn; the narration port re-generates from the trigger message

This is the most mature part of Corvus's design and should be directly carried forward into the unified project.

---

## 3. Phase 2 security hardening tasks

### 3.1 CORS origin-locking

Change from `cors({ origin: true, credentials: true })` to either:
- Origin-specific CORS: `cors({ origin: 'https://allowed-origin.com', credentials: true })`
- No CORS for localhost-only: `cors({ origin: '', credentials: false })` or remove CORS middleware entirely

For the unified project's localhost single-player mode, the simplest correct configuration is:
```javascript
cors({ origin: 'http://localhost:5173', credentials: true })
```
where `http://localhost:5173` is the client dev server origin. In production, the origin must be the deployed preview/production URL.

### 3.2 No API keys in response bodies

The settings route must never return API keys. Instead:
- Store API keys in environment variables (`.env`, not `.dev.vars`)
- The `LMStudioSettings` and `TTSSettings` routes return only non-sensitive fields
- If the user needs to configure an API key, they do so via a file placed in the data directory (not through the API)

### 3.3 User-supplied ID validation

All routes that accept `gameId`, `messageId`, `characterId`, `npcId`, etc. must validate before use:
```typescript
function validateId(id: string): id is ValidId {
  return !id.includes('\\') && !id.startsWith('/') && !id.startsWith('.') && !id.includes('..');
}
```

If invalid, return 400 with a descriptive error.

### 3.4 Write guard enforcement

Ensure all state mutations go through OpenWorld's `Writer` guard (`world.ts:88`, `:91` `WriteError`). No delta from the model directly modifies `WorldState`. The GM call's `validatePatch` output is the input to the effect pipeline, which is gated by the write guard.

### 3.5 Model output schema validation

The critical security requirement: the GM call's output must be strictly validated against the `validatePatch` schema. Any failure (missing field, wrong type, unknown field name) causes the call to be rejected and retried, NOT a lenient fallback to empty object.

### 3.6 Retries/backoff/429 handling

Implement for all provider calls:
- Exponential backoff on 429 (rate limit)
- Timeout on chat completions (default 10s, configurable)
- Maximum retry count (e.g., 3 retries)
- Circuit breaker pattern after too many failures

### 3.7 Body size limit

Reduce from Corvus's 50 MB to a reasonable limit (e.g., 100 KB) for all model-request bodies. The write guard and sandbox will reject anything that would violate economy or tag locality anyway.

---

## 4. Phase 3 species extension tasks

### 4.1 Tier 1: Minor phenotype

Add new part tags and colour variants within the existing body framework:
- Add part definition with `bodies: ['woman', 'man']` (or selected bodies)
- Add colour tags under `LOOK_COLORS` with `for: ['hair'|'skin'|'eyes']`
- Update `generateLook` if new slots need OWN_STREAM
- Add natural-language description via `lookWords`

**Estimated effort**: 1–2 days per species.

### 4.2 Tier 2: New body, same skeleton

- Add new body to `LOOK_BODIES` (e.g. `'goblin'`, `'dwarf'`)
- Create 3 facing × 5 frame base frames (24 × 36 ASCII pixel art, hand-drawn)
- Define new parts with `bodies: ['goblin']` and appropriate tags
- Update `LOOK_SLOTS` if new slots needed (e.g. `'beard'` already exists, may need `'facial-markings'`)
- Create portrait layer set (cut layers repainted from look's colours)
- Update equipment mappings, especially `WORN_SLOTS = {armour, cloak}`
- Test `generateLook` with new seed stream discipline
- Add lore/flavour via `lookWords`

**Estimated effort**: 1 week per species.

### 4.3 Tier 3: Different skeleton

- Add new bodies to `LOOK_BODIES` (e.g. `'lizardfolk'`, `'dragonkin'`)
- Create 3 facing × 5 frame base frames for each new body
- Define new parts with `bodies: ['lizardfolk']` and appropriate tags
- Update `LOOK_SLOTS` — add new slots if needed (e.g. `'tail'`, `'wings'`, `'claws'`)
- Create portrait layer sets for each new body
- Update equipment mappings — especially `WORN_SLOTS` and how armour/cloak attach to new body types
- Test `generateLook` with new seed stream discipline
- Add lore/flavour via `lookWords`

**Estimated effort**: 2–3 weeks per species.

### 4.4 Tier 4: Non-humanoid

Use `Entity.look` as whole-sheet key (already anticipated in OpenWorld):
- Create sprite sheet with multiple facings and walk frames
- No part-composed look (no hair/face/slot system)
- No equipment slots (or custom slot mapping if the creature wears gear)
- `lookWords` still applies for natural-language narration

**Estimated effort**: 1–2 weeks per species (sprite art only).

---

## 5. Phase 4 full integration test

### 5.1 End-to-end flow

```
Player → POST /api/games/:gameId/messages
  ↓
SSE stream opens
  ↓
Orchestration: save user msg → assemble context → narrator pass → GM call → ThinkStreamStripper → stripThinkingTags → stripProseReasoning → splitIntoSpeakerBlocks → persist blocks → emit SSE events
  ↓
Player receives: tokens + gm_update (player, characters, worldState, summary)
  ↓
Player → reads gm_update → world state updated (deterministic, via engine effects + write guard)
  ↓
Player → next turn (can reference previous turns' prose via provenance cascade)
```

### 5.2 Determinism verification

- Load a saved game
- Play one full turn (narrator + GM)
- Save again
- Load the new save and replay the same turn
- Verify: WorldState is identical (same RNG state, same entity positions, same flags)
- If not identical, debug: check that the GM's `validatePatch` output is fully deterministic, that the effect pipeline is deterministic, and that the write guard didn't reject anything

### 5.3 Save/load round-trip with narrativeSnapshot

- Save game with `narrativeSnapshot` (last prose turn ID, summary, chapter summaries)
- Load the save
- Verify: `narrativeSnapshot` fields are present and correct; chapter summaries are preserved; `WorldState` is intact
- Verify: saves without `narrativeSnapshot` still work (backward compatibility)

### 5.4 Multiple species in same world

- Create at least 2 Tier 1 and 1 Tier 2 species
- Populate the world with NPCs of each species
- Verify: each species' look generates correctly; equipment composes correctly; no conflicts between species' look data
- Verify: the narrator can reference species-specific features in prose

### 5.4 Editor integration

- New species appear in the look editor's body/slot/colour selectors
- The editor can create/ edit NPCs of any species
- The editor does not break existing NPCs when a new species is added

---

## 6. Decision gate summary

The roadmap terminates at the final decision gate, which answers the 12 questions from the audit brief. The possible outcomes are:

### 6.1 PROCEED WITH PROPOSED COMBINATION

**Condition**: The migration matrix and roadmap are accepted as-is.

**Meaning**: OpenWorld provides the authoritative kernel; Corvus provides the narration/orchestration shape. The fusion inserts a narration port beside ModPort, replaces Corvus's unvalidated GM with OpenWorld's schema-validated `validatePatch`, supersedes Corvus's provider layer with OpenWorld's, and strips the CORS-any-origin + credentials pattern. All 12 final-gate questions are answered affirmatively.

**Next step**: Begin Phase 1 (narration port MVP).

### 6.2 PROCEED WITH MODIFICATIONS

**Condition**: Most of the proposed combination is accepted, but some critical issues need resolution before proceeding.

**Meaning**: The overall fusion strategy is sound, but specific components need redesign or reimplementation. For example:
- The structured-output GM call needs more refinement
- The CORS origin-locking strategy needs finalization
- The species tier framework needs additional constraints

**Next step**: Address the identified modifications, then re-run the decision gate.

### 6.3 RECONSIDER ONE OF THE REPOSITORIES

**Condition**: One repository has a fundamental issue that cannot be resolved without significant rework.

**Meaning**: Either OpenWorld or Corvus has a architectural limitation or security vulnerability that makes the fusion infeasible without abandoning key aspects of that repository. For example:
- If OpenWorld's write guard cannot be reconciled with the brief's requirements
- If Corvus's CORS+auth pattern cannot be removed without breaking the application

**Next step**: Either modify the problematic repository's design or abandon it in favor of a different reference.

### 6.4 DO NOT PROCEED UNTIL CRITICAL ISSUES ARE RESOLVED

**Condition**: Critical security or architectural issues remain unaddressed.

**Meaning**: The fusion as designed would introduce unacceptable risk or fundamental architectural mismatch. Specific show-stinders might include:
- The write guard cannot be implemented as specified
- The structured-output GM call cannot replace Corvus's lenient parsing without breaking functionality
- Critical security vulnerabilities (CORS, path traversal, plaintext keys) cannot be fixed

**Next step**: Stop the fusion project until the critical issues are resolved through alternative design or third-party consultation.

---