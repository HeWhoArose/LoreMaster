# REVISION 2 — Corrected Phased Roadmap

**Corrections in this document:** C-03/C-04/C-06/C-09 as they appear in Report 12's phase plan.
**Evidence:** clone at `e3cadf3`; nothing executed. Every phase below ends at a gate that is a
*test*, not a claim.

---

## 1. What was wrong with Report 12

| Original | Problem |
|---|---|
| Phase 1 "Narration port MVP … GM call with strict `validatePatch` schema (replace lenient parsing)" | The whole phase rests on C-01. It would build a validator that rejects its own inputs, or quietly degrade `validatePatch` until it accepts deltas — destroying the only real safety gate |
| Phase 1 interface sketch `handleTurn turn: TurnInput` | Syntax error in the roadmap; also `generateProse(outcome: GMOutput, …)` takes a *GM output* as the engine outcome — the two are not the same thing and neither exists as typed |
| Phase 2 "Security hardening" as a separate phase after Phase 1 | Most of the security work (no key in responses, no CORS wildcard, strict output) is *inherent* to the corrected contracts and the existing runtime; what remains (loopback gate tests, lease, prose rendering) belongs inside the phases that create the surface |
| Phase 3 "Species extension framework … Tier 1–4" | Built on the wrong taxonomy (C-06) and included Tier 2/3 work whose art cost was not counted |
| Phase 4 "Full integration test … determinism verification: replay from saved state produces same world state" | Untestable as written: the world is deterministic *given the same event sequence*; a turn's event sequence depends on model proposals, which are not deterministic. Replay must be specified over recorded events, not over "a turn" |
| Phase 5 "art/audio integration (689 MB), agent/RSI harness, autonomous creator, multiplayer feasibility" | Treats deferred infrastructure as polish to be scheduled, and reopens a component (creator) the migration matrix said to delete (C-09) |
| Whole plan | No entry/exit gate is executable; every phase "verifies" by assertion |

---

## 2. Phase plan (corrected)

Each phase has **entry** (what must be true), **work** (bounded), and **exit** (an executable gate;
the commands live in R2-09). A phase that fails its exit gate does not proceed.

### Phase 0 — Establish truth

**Entry:** nothing.
**Work:** disposable clone; clean install; typecheck; full test run; player build; world generation;
record every result as measured output (not as "should pass"). Record the environment (Node/npm
versions, OS, lockfile hash). Run the boundary test and the write-guard test explicitly.
**Exit:** a verification report with real exit codes for: `npm ci`, `npm run typecheck`, `npm test`,
`npm run gen:world`, `npm run build:player`. Any pre-existing failure is catalogued before it can be
confused with a regression later.
**Why first:** Reports 00–12 never ran anything, yet the original roadmap assumed a healthy baseline.

### Phase 1 — The contract layer (no prose, no UI)

**Entry:** Phase 0 exit met.
**Work:**

1. `packages/narration/src/contracts`: ActionProposal + NarrativeOutput schemas and validators, pure
   functions, no model calls. Unit-tested against hand-written fixtures (valid, malformed, hostile).
2. `packages/narration/src/act`: proposal → verified engine call mapping (R2-02 §4.3). Tested against
   the real engine in a sandbox world (`buildSandbox`) for each of the seven verbs.
3. Digest builder: from a `Resolution` plus the effects' `fx` output and before/after entity reads.
   Tested by running known scenarios in the sandbox and asserting the digest contents.
4. Boundary rule: the engine does not import narration; add the case to the existing boundary test.

**Exit:**
- every proposal rejection class has a test (unknown referent, illegal verb/param combination,
  wrong actor, out of reach, ambiguity);
- a refused act (`{defined:false}`) produces a `refused` turn outcome, not a success;
- no test in this phase calls a model;
- `npm run typecheck` and `npm test` pass.
**Deliberately absent:** prompts, streaming, storage, UI.

### Phase 2 — The turn machine (engine → prose), headless

**Entry:** Phase 1 exit met.
**Work:** the turn machine of R2-03 §2.2 (T0–T11) with a **scripted model** (the repo already has
scripted models for tests — `models/model.ts` documents them). Two prompts only: `intent` and
`narration`. Code-composed fallbacks for intent failure, invalid prose and refused actions.
**Exit:**
- the ten interaction classes of R2-03 §2.4 each have a headless test with a scripted model: the
  asserted outcome is the engine's, and the prose assertion is only structural (speakers, block
  count, no invented ids);
- an act that returns `defined:false` produces prose that does not claim success (asserted on the
  digest + the fallback path, not on literary quality);
- a hole filled by a rule (Contract A) is narrated from the *post-answer* resolution;
- a turn whose model fails entirely still completes with a fallback line and a persisted digest.
**Not yet:** persistence of narrative state beyond memory, regeneration, real providers.

### Phase 3 — Durability: narrative store, saves, concurrency, regeneration

**Entry:** Phase 2 exit met.
**Work:** narrative store over IndexedDB; per-turn record; interaction with `SaveData` (state first,
prose second); pre-turn snapshot ring for regeneration; provenance (`stale`, cascade on delete);
single-writer lease and turn queue; crash-point tests.
**Exit:**
- crash simulation at each T-boundary (R2-03 §5.3) leaves state and narrative in a *detectable*
  relationship, never a silent mismatch;
- regenerating a non-mutating turn replaces prose only; regenerating a mutating turn restores the
  snapshot and reproduces the same engine outcome **given the same proposal** (recorded);
- deleting a message marks narrative records stale and never re-runs effects;
- two tabs on one slot: the second is refused (test).
**Note:** this phase is where "persistence and concurrency" is actually decided; R2-03 §5 is the spec.

### Phase 4 — Live models, credentials, and the security surface

**Entry:** Phase 3 exit met; R2-09 Q1–Q3 answered.
**Work:** wire the provider abstraction with the six purposes (R2-05 §4.2); BYOK path in the modder
worker; optional owner-side service path; prose rendering rules (text nodes only); log redaction;
loopback gate tests; explicit "who pays" statement in the UI.
**Exit:**
- a full turn against a real provider with a player key, and against a keyless local endpoint;
- no key in any save, log line, error or response body (asserted by test, including error paths);
- model-authored text is never parsed as markup (test);
- loopback gate: allowed origin accepted, foreign origin refused (both tested);
- prompt-injection fixture: injected text cannot produce a Patch that writes outside its host, and
  cannot produce a proposal outside the closed param set.
**Not yet:** hosted multi-user inference (H3) — deferred by R2-09 Q6.

### Phase 5 — Species, Class A only

**Entry:** Phase 4 exit met; art workstream staffed.
**Work:** one Class A species end-to-end (recommendation: **elf**), then a second (recommendation:
**orc**, tusks + skin) using the same mechanism. Look-table entries, parts, colours, tags, portrait
layers per body, sprite grids per facing, `lookWords`/localisation, content (faction, names, lines).
**Exit:**
- the new parts render on every body they declare and on no other body (validated by
  `lookProblems` in a test, plus a visual review by a human — not by the agent);
- existing NPC looks are byte-identical before/after the change (`lookCode` diff over a sample);
- equipment still composes on the new parts or is explicitly refused by the part's `bodies`;
- the portrait bust exists for each body and each mood the part declares.
**Explicitly out of scope:** new bodies, new slots, tails, wings, centaurs, dragons.

### Phase 6 — Deferred, by decision

Only on a human decision, one at a time: new body (dwarf stature), whole-figure species (Class C),
hosted inference (H3), desktop (H4), the agent harness, the creator, TTS/image providers. Each gets
its own entry/exit gate. None is "polish".

---

## 3. Removed from the roadmap

| Report 12 item | Disposition |
|---|---|
| "Deployment configuration for Cloudflare Sites / D1 / R2 / DO / OpenNext / Next.js / Freebuff auth" | Removed (C-04). Hosting is undecided (R2-06 §6) |
| "Phase 2 security hardening" as a standalone phase after the AI work | Dissolved: the key-handling and loopback gates belong to Phase 4, prose rendering to Phase 4, slot lease to Phase 3 |
| "Phase 1 GM call with `validatePatch`" | Replaced by Phase 1 contract layer |
| Corvus `gm_update` SSE event carrying `player/characters/worldState` | Removed with C-01/C-08: there is no GM delta and no client-side world authority |
| "Determinism verification: play one full turn, replay it" | Re-specified: replay over *recorded events*, not over a re-generated turn |
| Tier 2/3/4 species work inside the MVP | Deferred to Phase 6 with its art cost stated |

---

## 4. Effort: what can and cannot be estimated

| Item | Basis for estimate | Estimate |
|---|---|---|
| Phase 0 | Command runs only | hours, dominated by install time |
| Phase 1 | Two schemas, one mapping module, fixtures | days, not weeks — pure functions against a known engine API |
| Phase 2 | The turn machine + two prompts + fallbacks | the largest single phase; its risk is *quality of proposals*, not volume of code |
| Phase 3 | Store, lease, regeneration, crash tests | comparable to Phase 1; the crash matrix is the work |
| Phase 4 | Provider wiring + security tests | moderate; depends on whether a service path (H2/H3) is wanted |
| Phase 5 | **art-bound**: per body, per part, per mood | cannot be estimated from source; the unit counts are in R2-04 §4 |

No calendar dates are given. The original roadmap's phase plan had none either, but Report 07's
species day-estimates were invented; this set does not repeat that.

---

## 5. Gates summary

| Phase | The one question its gate answers |
|---|---|
| 0 | Does the baseline actually build and pass? |
| 1 | Can a proposal be validated and turned into a real engine call, with no model involved? |
| 2 | Does a turn produce engine-first, prose-second behaviour — including refusals? |
| 3 | After a crash at any point, is the state/narrative relationship detectable and repairable? |
| 4 | Can a real model be used without leaking a key, inventing markup, or corrupting the world? |
| 5 | Does one new species render everywhere it declares without changing any existing look? |
| 6 | Is the deferred item worth its stated cost? |

Execution details and commands: R2-09. Status of every gate today: **NOT RUN**.
