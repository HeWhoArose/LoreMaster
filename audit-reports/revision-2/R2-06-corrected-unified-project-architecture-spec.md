# REVISION 2 — Corrected Unified Project Architecture Specification

**Corrections in this document:** C-04 (deployment), C-08 (invented state fields), C-11 (effect
primitives), and the structural half of C-01/C-10.
**Evidence:** clean clone at `e3cadf3`; `docs/design.md`, `CLAUDE.md`, root `package.json`, runtime and
engine source. Nothing executed (`NOT RUN`).

---

## 1. The system as it actually is

### 1.1 Runtime (verified)

```
static site (Vite build)
  ├── page: Phaser 4 scene + DOM HUD   (packages/runtime/src/render, ui)
  │     ├── engine Web Worker          (packages/engine: WorldState, rules, effects, saves)
  │     │     └── ModderLink ──port──▶ modder worker (player's key) ──HTTPS──▶ provider
  │     │                    └─HTTP──▶ modder service (optional, loopback)
  │     └── IndexedDB: 3 save slots + shared rule library
  └── static world chunks (generated; git-ignored: `.gitignore:3-4`)
```

- Engine is pure TypeScript, runs in a Web Worker, imports no game (`CLAUDE.md`, architecture section).
- The client builds to a static site (`docs/design.md:38,1518`).
- The modder service is a Node HTTP server, loopback-oriented, with a subset of routes documented as
  "this host only" (`packages/ai/src/service/server.ts:1-22`).
- The editor is a Vite app plus an Electron shell (`package.json`: `editor`, `editor:build`,
  `desktop`).

### 1.2 Threading and ownership

| Owner | State | Never |
|---|---|---|
| Engine worker | `WorldState`, rule library, RNG, chunks | network, DOM, credentials |
| Page | UI state, save slot handle, turn queue (new), BYOK hint only | authoritative world state |
| Modder worker | player's key, in-memory library copy | authoritative world state |
| Modder service (optional) | server model config, shared library log, self-state | the player's key |

This ownership map is the reason the corrected lifecycle is enforceable: there is exactly one writer,
and the narrator is not it.

---

## 2. The one architectural change to OpenWorld

Everything in this specification is additive except one constraint:

> **The engine must never import the narration module.** Dependency direction stays
> `client → engine → mod port → modder`, with narration as a *client-side* consumer of engine results.

Rationale: a narration layer that the engine could import would eventually be called from inside a
resolution, and the first time prose runs inside `dispatch`, the engine stops being deterministic and
the save format starts depending on text. OpenWorld already enforces its direction with a boundary
test (`packages/engine/test/boundaries.test.ts`, exists, `NOT RUN`); the corrected design adds
narration to that boundary rather than inventing a new one.

---

## 3. Component inventory

### 3.1 Preserved (no change)

Engine kernel (`engine.ts`), world/containment (`world.ts`, `cells.ts`, `sparse.ts`), rules and holes
(`rules.ts`), effects and the write guard (`effects.ts`, `world.ts:88`), determinism (`rng.ts`),
calendar (`calendar.ts`), behaviour/NPC/society modules, quests and story (`quests.ts`, `story.ts`),
inventory/equipment/crafting/building/progression/companions, looks (`engine/src/looks.ts`,
`content/src/looks.ts`), format/compiler/validator (`packages/format`), editor, localisation, mod
port and validation (`mod.ts`), sandbox (`sandbox.ts`), rule library (`ai/src/library`), AI quality
and detection (`quality.ts`, `modder/detect.ts`), model interface and providers
(`ai/src/models`), BYOK (`runtime/src/ownModel.ts`, `ai/src/player`), saves (`runtime/src/saves.ts`),
tests and CI.

### 3.2 Corrected description of effects (C-11)

Report 02 §2.4 and §4.2 presented `RESIDENT_ONLY`'s contents as "`PRIMITIVES`". The real
`PRIMITIVES` table (`effects.ts:26`) has ~50 entries, including the ones the narration layer must
understand because they *produce narratable facts*:

`spawn, destroy, transform, move, loosen, step, addStatus, removeStatus, setProp, addProp, addTag,
removeTag, hurt, wear, posture, sleep, fall, breakdown, heal, gainXp, pocket, foe, open,
dropContents, goto, topic, scene, craft, grow, lightning, ashore, fallback, emit, vfx, say, remark,
log, emote, restyle, quest, advance, stage, accept, decline, failQuest, begin, startQuest, facts,
news, learn, appear, panel`

`RESIDENT_ONLY` (`:82`) and `QUEST_ONLY` (`:84`) are *restriction sets*: rules hosted by the story,
the world, or a quest may use them; a learned patch for an ordinary host may not.

Why this matters to the narration layer: `say`, `remark`, `log`, `emote` and `vfx` are the engine's own
narrative output channel. The corrected lifecycle reads them as the outcome digest's factual core
(R2-03 §2.2). A narrator that ignores them will invent dialogue the world already wrote.

### 3.3 New modules

| Module | Location (proposed) | Imports allowed | Purpose |
|---|---|---|---|
| `narration-contracts` | `packages/narration/src/contracts` | engine **types** only | ActionProposal, NarrativeOutput schemas + validators (pure, testable) |
| `narration-turn` | `packages/narration/src/turn` | contracts, engine public API, model interface | the turn machine (R2-03 §2.2), digest builder, fallbacks |
| `narration-prompts` | `packages/narration/src/prompts` | contracts | intent / narration / summary prompts (separate from `ai/src/modder/prompts.ts`; those are behaviour-critical and must not be edited) |
| `narrative-store` | `packages/narration/src/store` | nothing (interface + IDB impl) | turns, blocks, summaries, NPC memory |
| `action-bridge` | `packages/narration/src/act` | engine public API | ActionProposal → the verified `act`/`Controls` calls (R2-02 §4.3) |

The engine's public barrel stays the only import surface; no new engine API is added in Phase 1.

---

## 4. Interfaces (grounded in verified signatures)

```ts
// packages/narration/src/contracts
type Verdict = { ok: true } | { ok: false; errors: string[] }

function validateActionProposal(p: unknown, ctx: {
  seat: Id;                       // the actor the turn belongs to
  visible: (id: Id) => boolean;   // referent check against the turn's projection
  verbs: readonly Verb[];         // the engine's seven
  talkVerbs: (who: Id) => readonly string[];
}): Verdict

function validateNarrativeOutput(o: unknown, ctx: {
  cast: (id: Id) => boolean;      // speakers allowed this turn
  player: Id;
  limits: { blocks: number; chars: number };
}): Verdict
```

```ts
// packages/narration/src/turn
interface TurnRequest {
  slot: Slot;
  input: { kind: 'text'; text: string } | { kind: 'control'; control: ControlInvocation };
  mode: 'play' | 'replay';
}

interface TurnResult {
  turnId: string;
  resolution: Resolution;                  // engine's own type, verbatim
  digest: OutcomeDigest;                   // engine-derived (below)
  blocks: NarrativeBlock[];
  outcome: 'resolved' | 'rejected' | 'refused' | 'failed-turn';
}

interface OutcomeDigest {
  turnId: string;
  worldRevision: number;                   // narrative-store-side counter, not engine state
  proposal?: { verb: Verb; target: Id; params: object; accepted: boolean; rejection?: string };
  resolution: { defined: boolean; filledHole: boolean; ruleId?: string; fault?: string };
  facts: { kind: 'say'|'remark'|'log'|'emote'|'vfx'; who?: Id; text?: string }[];
  changes: { entityId: Id; summary: string }[];   // human-readable, bounded, from before/after
  mutated: boolean;
}
```

`TurnRequest`/`TurnResult` live outside the engine. `Resolution` is imported, never redefined — that
was the failure mode of the original design, which invented a "GM output" and a fictional `act`
request in place of the real types.

```ts
// packages/narration/src/store
interface NarrativeStore {
  beginTurn(t: { turnId: string; slot: Slot; revision: number }): Promise<void>;
  putSnapshot(turnId: string, save: SaveData): Promise<void>;   // for regeneration, bounded
  putTurn(r: TurnResult & { blocks: NarrativeBlock[] }): Promise<void>;
  blocksFor(slot: Slot, range?: { from?: string; to?: string }): Promise<NarrativeBlock[]>;
  markStale(turnIds: string[]): Promise<void>;                  // edit/delete provenance
  putMemory(entityId: Id, m: NarrativeMemoryEntry): Promise<void>;
  memoryFor(entityId: Id, k: number): Promise<NarrativeMemoryEntry[]>; // relevance-scored, not slice(-5)
}
```

`NarrativeMemoryEntry` is new (Corvus's shape was reference only): `{id, turnId, entityId, text,
salience, createdAt, sourceTurnIds, stale?}`.

---

## 5. Data model: two stores, one direction

| Concern | World (engine) | Narrative (new) |
|---|---|---|
| Authoritative | yes | no |
| Saved per slot | `SaveData` object | turn records + summaries + memory |
| Version-gated by content | yes (`game.ts:70`) | policy decision (R2-09 Q4) |
| Referenced by | nothing narrative | `turnId → worldRevision`, `block.sourceTurnIds` |
| Deleted by | the player (slot) | the player (turn delete, marks stale) |
| Read by engine | yes | **never** |

No field is added to `WorldState`. Report 10 §2.3's `narrativeProse`, `narrativeScene` and
`narrativeTurnId` are withdrawn: they would (a) change the save schema, (b) make text part of the
deterministic state, (c) invite the engine to read prose.

---

## 6. Hosting: undecided alternatives (corrected from C-04)

**Requirement trace:** the objective asks for one independent, persistent, extensible engine. Nothing
in that requires a hosted service, a specific cloud, or an account system. The repositories support a
static client with browser persistence and an optional loopback Node service. Any deployment past
that is a product decision, not an architectural consequence.

| Option | Shape | What it needs | Cost/ownership | Risks | Status |
|---|---|---|---|---|---|
| **H1 — Static, BYOK only** | static site + engine worker + in-page modder worker; no server | nothing new | each player pays their provider | key in browser (§R2-05 T1) | **supported today** by the code |
| **H2 — Static + local service** | H1 + loopback modder service (dev, editor, owner's machine) | hardening of the loopback gate + tests | the machine's owner | T2 if the gate is wrong | **supported today**, unverified gate |
| **H3 — Static + hosted inference proxy** | H1 + a server that holds the owner's key and rate-limits players | auth or signed sessions, per-user limits, model allow-list, budget caps | owner | T3; abuse; cost | **not built**; would need a provider decision |
| **H4 — Desktop app** | Electron shell (the editor already has one) bundling a local model | packaging, model distribution, updates | the player's machine | size, GPU requirements | feasible; not built |
| **H5 — Cloudflare/Next.js/D1/R2/DO/Freebuff auth** (Report 10 §4) | — | — | — | **incompatible with the actual runtime** (no Next.js, saves are IndexedDB, no networking) | **REMOVED** |

Rules for the specification:

1. No option may be assumed by the code. The narration module must run under H1 (no server at all).
2. H3 and H4 are **explicitly deferred** and require a human decision (R2-09 Q6).
3. If a hosted option is ever chosen, its service is a *model proxy*, not a world authority: the world
   stays in the player's browser in every option in this list.

---

## 7. Invariants of the specification

1. One writer of world state: the engine worker.
2. Rules come only from validated patches at holes; actions only from validated proposals; prose only
   from validated narrative output.
3. The engine never imports narration.
4. The narrator receives a digest, never `WorldState`.
5. Saves are written before prose.
6. Narrative state can be rebuilt from digests + world; world state can never be rebuilt from prose.
7. No platform-specific API in the core path (no D1/R2/DO/Cloudflare/Next.js/identity provider).
8. Every refusal path (invalid proposal, refused act, failed turn, invalid prose) has a defined,
   non-invented output.

---

## 8. What this specification deliberately does not decide

- Which hosting option (H1–H4).
- Whether narrative state survives a content-version change.
- Whether memory is rule-based (relevance function) or model-extracted (a `memory` purpose call).
- Whether the intent model and the narrator are the same model (they may be; the roles make it
  possible to split later).
- Species beyond Class A.
- Any cloud account, identity provider, database, bucket or domain.

Those are in R2-09 §5 as questions for human approval, not gaps in the analysis.
