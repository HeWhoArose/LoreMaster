# REPORT 06 – Unified World-State Architecture

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. World-state comparison

| Dimension | OpenWorld | Corvus Story Core | Unified design |
|---|---|---|---|
| **Core state object** | `WorldState` (`types.ts:1666`): `tick, seed, rng, player, entities: Record<Id,Entity>, maps: Record<string,MapData>, loadedMaps, counter, spawn, reported?, quarantine?, question?, paces?, dormant?, relations?, legacyTiles?, reseed?, chunks?` | `WorldState` (`types/index.ts:340`): `events: WorldStateEvent[]` + `locationStates: Record<loc, string>` | OpenWorld's `WorldState` is the authoritative kernel; Corvus's is a flat JSON document |
| **Simulation model** | Entity–containment graph: `Entity` has `place: Place`, `Place` is union `on|in|held|in-region`; `REVERSE: {on:'under', in:'contains', held:'holds', 'in-region':'encloses'}`; cells as pseudo-entities; `WorldState.chunks` (`ChunkState`) keeps per-map diff from file | No simulation model; world state is free-form JSON of strings; `locationStates` are arbitrary `Record<loc, string>` with no structural meaning | OpenWorld's entity-containment graph is the base; add narrative tags (e.g. `narrative: string`, `scene?: string`) as optional extensions, not replacements |
| **Entity model** (`types.ts:468`) | `id, type, name?, tags?, props?, statuses?, statusBy?, place: Place, facing?, contents?: Id[], held?: Id, npc?: NpcData, residentWork?, ai?: AiData, combat?: CombatState, script?: SceneState, boss?: BossState, frozenBy?, dropped?, slots?, slotItems?, skillbar?, selected?, look?: string | Look, from?` | `NPCCharacter` (id, name, revealedName, status, appearance/personality/background/knownInfo/dispositionTowardPlayer, memory[], voiceStyle, tts?, chatColor?, actionColor?, image); `PlayerCharacter` (name, backstory, appearance, stats, money, extraCurrencies, abilities, inventory, relationships); `ChatMessage` (id, role, type, content, timestamp, characterId?, modelParams?, alternatives?, chapter?, summarized?) | OpenWorld's entity model is the base; Corvus's character types become **narrative projections** of entities, not replacements |
| **Maps & spatial indexing** | `MapData` per static file; `WorldState.chunks` keeps diff (`sparse.ts`); `ofType`, `people`, `withProp` indexes (`world.ts`); dormant maps with queued events; cells as addressable pseudo-entities | None; no maps, no cells, no containment | Keep OpenWorld's map/spatial model; narrative events can attach to map locations via `worldStateUpdates[{event, location, timestamp}]` |
| **RNG & determinism** | mulberry32 PRNG; `WorldState.rng` state; `seedOf(...parts)` (FNV-1a, `rng.ts`); per-occasion seeds so adding content doesn't reshuffle unrelated draws; every run replayable from `WorldState.rng` | No RNG; no determinism model | Keep OpenWorld's determinism; narrative content (prose) is inherently non-deterministic – flag as such |
| **Save format** (`game.ts:202`) | `{version:1, world: worldVersion, state, library: learnedJSON() (or whole), savedAt, codex}`; version gate on load (`game.ts:70-71` refuses foreign content version); `library: learnedJSON()` stores rule library learned from AI patches | Per-chapter JSONL messages; separate summary files; `world-state.json` with events; **no version gate**; `readJson` returns `null` on parse error, silently resets state | Keep OpenWorld's save format with version gate; add optional narrative snapshot (prose summary) as a field, not the whole state |
| **Entity state changes** | via `EffectRunner` (`effects.ts:90`); primitives: `topic, scene, lightning, fallback, appear, begin, startQuest, facts, advance, stage, accept, decline, failQuest`; writes gated by `Writer` (`world.ts:88`); `WriteError` outside outcomes | via `stateManager.applyGameMasterOutput`; JSON deltas: `statChanges`, `newItems`, `removedItems`, `relationshipUpdates`, `newCharacters`, `worldStateUpdates`, `characterUpdates`, `currencyChanges`; **no write guard, no sandbox, no schema validation** | Keep OpenWorld's effect pipeline + write guard; Corvus's delta format becomes the **input format** for the narration port, validated before application |
| **Tick / calendar** (`calendar.ts:7-63`) | `TICKS_PER_MINUTE = 10`, `TICKS_PER_HOUR = 600`, `TICKS_PER_DAY = 14400`; start hour 6; weather `sun|cloud|rain|storm|fog`; deterministic weather from `(day, hour, seed, plan)` | None | Keep OpenWorld's calendar; narrative events can have timestamps from calendar, but prose itself is not tick-driven |
| **Quests / story script** (`quests.ts:177,200,268`, `story.ts:20,51`) | Steps with triggers; scenes/beats; writes story props only; radiant offers; objectives, stages, news | None; the word "quest" does not occur in server or client source | Keep OpenWorld's quest system; GM `worldStateUpdates` can include quest-state changes, but prose narration does not depend on quest engine |
| **Society / factions** (`modules/society`; `types.ts:855,890,920,964,443`) | Deeds, regard, gossip, watches, prices, law | `NPCCharacter.relationships: Record<id, {name,disposition,notes}>`; free-text disposition only; no mechanized effects | Keep OpenWorld's society model; Corvus's relationshipUpdates format maps to `disposition` changes, but full society simulation remains OpenWorld |
| **Inventory & items** | Physical stacks keep identity (`stacks.ts`); affixes/sets (`affixes.ts`); crafted items; economy LP (`ai/src/checks/economy.ts`); `slots?`, `slotItems?` on Entity | `PlayerCharacter.inventory[{name,description,quantity}]`; `PlayerCharacter.money`; no price model, no affordability check; stats can go negative; money floors at 0 | Keep OpenWorld's inventory; Corvus's `newItems`/`removedItems` map to OpenWorld's item creation/deletion, but instance identity and provenance are preserved by OpenWorld's system |
| **Relationships** | `relations?` on Entity; `modules/society` deeds/regard/gossip/watches/prices/law | `NPCCharacter.relationships: Record<id, {name,disposition,notes>}`; disposition is a number | Map Corvus's disposition to OpenWorld's relation system; extend OpenWorld's relation model with narrative notes |
| **Memory** | Entity-level `boss`, `script`, `script` fields; no tail-based retrieval in core | `NPCCharacter.memory[]` flat array; `slice(-5)` in narrator mode, `slice(-8)` in character mode; no salience, no decay, no relevance scoring | Keep OpenWorld's entity memory fields; adopt Corvus's `sourceMessageIds` + `stale` pattern for narrative memory; replace flat slice(-5) with relevance-aware retrieval (see Report 07) |
| **Events** | `WorldStateEvent` (`types.ts:293-338`); provenance pattern with `sourceMessageIds`; fresh uuid, chapter, server-stamped `createdAt` | `WorldState.events: WorldStateEvent[]`; same provenance pattern (uuid, chapter, createdAt) but fewer fields | Keep OpenWorld's event model; Corvus's event format is a subset; add `sourceMessageIds` if missing |
| **Location model** | `Entity.place: Place` (union `on|in|held|in-region`); `MapData` per map; chunks track diff; `WorldState.locationStates` is `Record<loc, string>` free-form | `WorldState.locationStates: Record<loc, string>`; free-form keys/values; no spatial meaning | Keep OpenWorld's place/containment model for engine; Corvus's `locationStates` can annotate locations with free-form prose, but engine spatial logic is unchanged |
| ** save transactionality** | Writes are individually atomic (tmp+fsync+rename) but **not a transaction** across files; crash mid-apply leaves partial mutation; no journal, no rollback, no idempotency key | Same: individually atomic, not transactional; no journal, no rollback | Keep OpenWorld's atomic writes; document that cross-file writes are not transactional; add optional journaling in future |

---

## 2. Unified world-state design

The unified world state **uses OpenWorld's `WorldState` as the authoritative kernel**, with narrative annotations added as optional extensions. The Corvus-style delta format (statChanges, newItems, etc.) is the **input** that gets validated by `validatePatch` and applied by the engine's existing effect pipeline.

### 2.1 State change flow in the unified system

```
Corvus-style GM output (validatePatch schema)
    ↓
validatePatch (mod.ts:1313) — checks: artefact shape, id hygiene,
  condition-reference only carried tags, economy LP, exact object shapes,
  locality (host-only writes)
    ↓
If valid: Engine EffectRunner applies the change via ordinary rules
    ↓
Effect primitives (effects.ts:26): topic, scene, lightning, fallback,
  appear, begin, startQuest, facts, advance, stage, accept, decline, failQuest
    ↓
Writer guard (world.ts:88) — writes outside an outcome throw WriteError
    ↓
WorldState updated deterministically (RNG state preserved)
    ↓
Narration port generates prose from the resolved outcome
    ↓
Prose persisted as ChatMessage (type: narrator|character)
    ↓
SSE stream returns gm_update with freshly re-read player, characters,
  worldState and StateChangeSummary
```

### 2.2 Narrative annotations on WorldState

Optional fields added to `WorldState` for narrative purposes (not used by engine logic):

- `narrativeProse?: string` — last narrator prose block (for UI display, not engine)
- `narrativeScene?: string` — current scene name/tag
- `narrativeTurnId?: string` — UUID of the turn that produced the prose

These fields are **written by the narration port**, **read by the UI**, and **ignored by the engine**. They do not affect determinism or save compatibility.

### 2.3 Event model unification

OpenWorld's `WorldStateEvent` (`types.ts:293-338`) is the unified event format:

```
interface WorldStateEvent {
  id: string;              // fresh UUID
  chapter: number;         // current chapter number
  createdAt: number;       // server timestamp (ms since epoch) + offset by index within GM call
  sourceMessageIds: string[];  // UUIDs of ChatMessages that caused this event (from provenance cascade)
  event: string;           // free-form description
  location?: string;       // optional location tag
}
```

Corvus's event format is a subset; the narration port ensures `sourceMessageIds` is always populated (provenance cascade from Report 03, item 4).

---

## 3. Save format unification

The unified save format **keeps OpenWorld's format** as the base, with an optional narrative snapshot:

```json
{
  "version": 1,
  "world": <worldVersion>,
  "state": <WorldState>,
  "library": <learnedJSON() or whole>,
  "savedAt": "<ISO timestamp>",
  "codex": <codex snapshot>,
  "narrativeSnapshot": {
    "lastProseTurnId": "<UUID>",
    "lastProseSummary": "<human-readable summary of last narrator turn>",
    "chapterSummaries": <chapter summary files as before>
  }
}
```

The `narrativeSnapshot` field is **opt-in**: existing saves without it continue to work (version gate refuses foreign content version, but not the absence of `narrativeSnapshot`). The `library` field stores the learned rule library from AI patches — this is where the narrative-style rule suggestions are persisted.

---

## 4. Migration path from Corvus-style to unified

Existing Corvus-style saves (flat JSON documents) **cannot be directly migrated** into OpenWorld's format without a conversion script, because:

- Corvus has no containment graph, no entity model, no map structure
- OpenWorld's state is a deeply nested, typed object with invariants

The migration would be a one-time operation for each user's data, producing an OpenWorld save with a `narrativeSnapshot` containing the Corvus world state as a free-form annotation. This is **deferred** (Report 08, item F defer) because it is not required for the unified engine to function.

---