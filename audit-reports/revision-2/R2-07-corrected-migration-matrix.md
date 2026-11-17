# REVISION 2 — Corrected Migration Matrix

**Corrections in this document:** C-09 (counts and misuse of REMOVE), C-07 (attribution),
C-13 (duplicated Corvus patterns), plus the disposition changes implied by C-01/C-06 (single contract,
species taxonomy).
**Evidence:** clean clone at `e3cadf3` for every OpenWorld row; Corvus rows carry Report 03's findings.

---

## 1. What was wrong with Report 11

### 1.1 The arithmetic

Report 11 §3 states: **"A preserve 41 · B adapt 7 · C redesign 1 · D reimplement 7 · E remove 11 ·
F defer 5 — Total 72 components."** Its own table has **70 rows**, and counting those rows gives:

| Disposition | Claimed | Actual in its table | Rows that actually carry it |
|---|---|---|---|
| A preserve | 41 | **38** | 1–24, 26, 28–32, 34–38, 41, 43, 57 |
| B adapt | 7 | **9** | 25, 33, 45, 53, 54, 55, 56, 58, 59 |
| C redesign | 1 | 1 | 27 |
| D reimplement | 7 | **6** | 51, 60, 61, 62, 63, 64 |
| E remove | 11 | **9** | 39, 40, 46, 47, 48, 49, 50, 52, 67 |
| F defer | 5 | **7** | 42, 44, 65, 66, 68, 69, 70 |
| **Total** | **72** | **70** | |

The "B adapt" row also lists **ten** components while claiming seven. The summary is not a summary of
the table; it was written independently and never checked.

### 1.2 Duplicated rows

- Wiki generator: rows **42** and **69** (identical).
- Art/portrait pipeline and assets: rows **44** and **70** (near-identical).
- Security posture: rows **47–49** and **67** all describe the same Corvus CORS/path/key cluster.

Three of the 70 rows are therefore duplicates, and one cluster is counted twice as a pattern.

### 1.3 REMOVE used for things that are merely out of scope

| Row | Report 11 disposition | Why it is wrong |
|---|---|---|
| 39 agent/RSI harness | **E remove** | Its own reasoning says "not core … remove from MVP" — that is DEFER. Nothing about a research harness is an anti-pattern. |
| 40 autonomous creator | **E remove** | The row itself says "defer to later phase" while the disposition says remove. Infrastructure/creator functionality is out-of-scope, not forbidden. |
| 46 multiplayer/networking | **E remove** | It does not exist in OpenWorld (Report 02 §8.7). Absence is not a component to remove. |
| 52 "No tests / no CI" (Corvus) | **E remove** | An absence, not a pattern; "do not adopt Corvus's test vacuum" is achieved by writing tests, not by removing anything. |
| 27 world generation | **C redesign** | The justification says "keeping reproducibility is essential" — i.e. preserve it. A code generator does not need redesign to be carried forward. |

"REMOVE" must mean: *this pattern must never appear in the unified project.* It was being used as a
synonym for "not in the MVP", which is what DEFER is for.

---

## 2. Disposition vocabulary (corrected)

| Code | Meaning | Test to apply |
|---|---|---|
| **P — PRESERVE** | Carried forward unchanged (or additive-only) | Would the unified project work if this stayed exactly as it is? |
| **A — ADAPT** | A proven pattern, re-implemented against OpenWorld types | Is the *idea* portable but the *code* not? |
| **R — REIMPLEMENT** | The component's job is needed; its implementation/contract must be replaced | Is the existing contract actively wrong for the objective? |
| **E — REMOVE PATTERN** | A defect or anti-pattern that must never be carried forward | Is this a vulnerability, or a design that corrupts authority? |
| **D — DEFER** | Useful, out of the initial scope | Would we want it later, on purpose? |
| **NA — NOT APPLICABLE** | The thing does not exist, so there is nothing to migrate | Did we verify its absence? |

The old "C — REDESIGN" category is retired: after correction, no component needs a redesign that is
not either an adaptation (idea survives) or a reimplementation (contract replaced).

---

## 3. Corrected matrix

### 3.1 OpenWorld — world, engine and content

| # | Component | Disp. | Basis |
|---|---|---|---|
| 1 | Simulation kernel / tick / queue / dispatch | **P** | `engine.ts:103,301,396,445`; deterministic and complete |
| 2 | `WorldState` + save format + content-version gate | **P** | `types.ts:1666`, `game.ts:195-200`, version gate `:70` |
| 3 | Entity / containment model (`Place`, cells) | **P** | `types.ts:468,460`, `world.ts:50`, `cells.ts:15` |
| 4 | Ontology (types, statuses, terrains, factions) | **P** | data merged over stdlib; `plugins`/modules merge |
| 5 | Rules + holes + specificity + tiers | **P** | `rules.ts:53,240,453,474,613` |
| 6 | Effects + `Writer`/`WriteError` guard | **P** | `effects.ts:26,90`; `world.ts:88,91` |
| 7 | Determinism (mulberry32, `seedOf`, RNG in state) | **P** | `rng.ts`, `WorldState.rng` |
| 8 | Calendar / time / weather | **P** | `calendar.ts:7-63` |
| 9 | Spatial indices, chunks, sparse saves, streaming | **P** | `world.ts` indices, `sparse.ts`, `chunk.ts` |
| 10 | Dormant maps + inbox | **P** | `world.state.dormant`; `dispatch` inbox path |
| 11 | Actor behaviour (goal order) | **P** | `behaviour.ts` |
| 12 | NPC schedules / work / homes | **P** | `npc.ts:447-452`, `types.ts:775` |
| 13 | Wellbeing / needs / harm | **P** | `wellbeing.ts` |
| 14 | Combat kernel (blows, reach, slots) | **P** | `blows.ts`, `engine.ts:646+`, `types.ts:664` |
| 15 | Monster kits / boss encounters | **P** | `packages/modules/kits` |
| 16 | Inventory / bag / stacks | **P** | `controls.ts` slots, `stacks.ts` |
| 17 | Equipment / affixes / sets | **P** | `affixes.ts`, `types.ts:1588,1600` |
| 18 | Crafting | **P** | `controls.ts:1475`, `recipes.ts` |
| 19 | Building / construction | **P** | content `construction.ts`, `world.ts:41` |
| 20 | Farming / homestead / haven | **P** | content modules |
| 21 | Progression / skills | **P** | `progression.ts` |
| 22 | Companions | **P** | `companion.ts:49,252` |
| 23 | Quests (objectives, stages, aliases, radiant) | **P** | `quests.ts`, `types.ts:96-129` |
| 24 | Story script / Story Manager | **P** | `story.ts:20,51` |
| 25 | Dialogue as authored lines / talk topics / chat keys | **P** *(was B)* | `people.ts`, `types.ts:775-795`; the narration layer is **additive** and must not rewrite `people.ts` |
| 26 | Society / factions / regard / law | **P** | `packages/modules/society` |
| 27 | World generation tooling (`gen:world`, continent generator) | **P** *(was C)* | root `package.json` `gen:world`; CI regenerates; no design change needed |
| 28 | Looks (bodies, slots, colours, seeded generator, `lookProblems`) | **P** | `engine/src/looks.ts`, `content/src/looks.ts` |
| 29 | Renderer / player (Phaser 4, figures, portraits) | **P** | `packages/runtime/src/render`, `assets/figure` |
| 30 | Format / compiler / validator | **P** | `packages/format` |
| 31 | Editor (web + Electron, modes, undo/store) | **P** | `packages/editor` |
| 32 | Localisation | **P** | `format/src/texts.ts`, `localize.ts` |
| 33 | Modder pipeline (comprehend→…→reflect) | **P** *(was B)* | `ai/src/modder/pipeline.ts`; narration consumes it, does not modify it |
| 34 | Patch validation (`validatePatch`, `idProblem`, economy LP) | **P** | `mod.ts:1313,1302` |
| 35 | Sandbox replay + derived expectations | **P** | `sandbox.ts:26` |
| 36 | Model interface + provider list (8 providers) | **P** | `ai/src/models/{model,providerList,providers}.ts` |
| 37 | AI quality/tier/detection | **P** | `engine/src/quality.ts`, `modder/detect.ts` |
| 38 | Rule library + promotion | **P** | `ai/src/library` |
| 39 | BYOK in the player | **P** | `runtime/src/ownModel.ts`, `ai/src/player`, `docs/byok.md` |
| 40 | Tests + CI wiring (241 tests) | **P** (pass/fail `NOT RUN`) | root scripts; `.github/workflows` |
| 41 | Save validation (version gate; no checksum) | **P** *(was B)* | hardening is a separate optional task, not a change to this component |
| 42 | Agent / RSI harness | **D** *(was E)* | research apparatus; keep, do not wire into the unified loop |
| 43 | Autonomous creator / workshop (`/creator/*`) | **D** *(was E)* | infrastructure for authoring; out of MVP scope, not an anti-pattern |
| 44 | Wiki generator | **D** (merge of old 42 & 69) | completeness gate; useful later |
| 45 | Art / portrait pipeline **tooling** | **P** *(was F)* | `tools/src/art/**`; required if any species work happens |
| 46 | Committed art / audio assets (689 MB) with licence carve-outs | **D** | licensing must be respected when any is shipped |
| 47 | Multiplayer / networking | **NA** *(was E)* | verified absent |
| 48 | *(old row 45, save anti-tamper)* | merged into **41** | — |

### 3.2 Corvus — narration patterns and defects

| # | Component | Disp. | Basis |
|---|---|---|---|
| 49 | Two-pass narrator/GM **shape** | **A** | keep the split of "prose pass" and "state pass"; the state pass becomes Contracts B/A, not a delta |
| 50 | Speaker-tagged output + splitter | **A** | `splitIntoSpeakerBlocks` idea; re-implemented against `NarrativeOutput` and entity ids |
| 51 | Context assembler + ordered budget/degradation | **A** | priority order is sound; token estimate replaced; speakers come from engine entities |
| 52 | Provenance: stale marking, cascade on delete, regen invalidation | **A** | strongest Corvus pattern; applies to narrative records, not world state |
| 53 | Per-game serialisation (`withGameLock`) | **A** | becomes the page's turn queue; the file lock itself is not portable |
| 54 | Atomic file writes (tmp+fsync+rename) | **A** | principle → one key write per turn; no files in the corrected runtime |
| 55 | `NPCMemoryEntry` with `sourceMessageIds` | **A** | becomes `NarrativeMemoryEntry` with `sourceTurnIds` |
| 56 | Rolling chapter summariser | **A** | threshold-on-content, not threshold-on-count; narrative-side |
| 57 | `server/types` whole data model | **R** | text-RPG document; cannot host a simulated world |
| 58 | `stateManager.applyGameMasterOutput` delta application | **R** *(contract rejected)* | replaced by Contracts A/B; no model→state channel |
| 59 | Games/saves JSON layout | **R** | replaced by OpenWorld save + narrative store |
| 60 | `lmStudio.ts` provider layer | **R** | superseded by `ai/src/models` |
| 61 | Lenient GM JSON parsing | **R** *(rejected)* | replaced by strict contract validation |
| 62 | Image / TTS / ComfyUI / Chatterbox integrations | **D** | out of scope |
| 63 | Character-card import (SillyTavern-style) | **D** | interop later |
| 64 | Client React chat UI | **D** | visual reference only |
| 65 | CORS any-origin + credentials | **E** | exploitable; never |
| 66 | Path traversal via `gameId` | **E** | never; corrected design has no client-supplied paths |
| 67 | Plaintext keys returned to the client | **E** | never |
| 68 | 50 MB JSON bodies / multer memory uploads | **E** | never |
| 69 | "No tests / no CI" (as a pattern to carry) | **NA** *(was E)* | absence; the remedy is tests (OpenWorld's), not a removal |

---

## 4. Corrected counts

The corrected table has **68 substantive rows**: numbered 1–47 and 49–69. Row 48 is a merge marker
(old row 45 folded into new row 41), not a component.

| Disposition | Count | Rows |
|---|---|---|
| **P — PRESERVE** | **42** | 1–41, 45 |
| **A — ADAPT** | **8** | 49–56 |
| **R — REIMPLEMENT** | **5** | 57–61 |
| **D — DEFER** | **7** | 42, 43, 44, 46, 62, 63, 64 |
| **E — REMOVE PATTERN** | **4** | 65, 66, 67, 68 |
| **NA — NOT APPLICABLE** | **2** | 47, 69 |
| **Total** | **68** | 42 + 8 + 5 + 7 + 4 + 2 = 68 |

Row-count check, stated explicitly because the original's was not:

- substantive rows 1–47 (47) + 49–69 (21) = **68**;
- original table: 70 rows − 2 duplicate wiki/art rows (old 69, old 70) = 68;
- the old "save anti-tamper" row (old 45) is folded into row 41 rather than dropped, so no component
  disappeared in the recount.

Only **four** components are marked REMOVE, and all four are Corvus defects (CORS with credentials,
path traversal, plaintext keys returned to clients, unbounded bodies). Everything that is merely out
of scope is DEFER: the agent harness, the autonomous creator, the wiki, art/audio assets, image/TTS
providers, character-card import and the React client.

---

## 5. What changed from Report 11, and why it matters

| Change | Effect on the project |
|---|---|
| 39/40 agent harness and creator: E→D | The creator and the RSI harness are no longer described as things to delete. They are the authoring infrastructure; deleting them would remove the project's own content pipeline |
| 46 multiplayer: E→NA | Stops a non-existent component from occupying a "remove" slot and inflating the defect count |
| 27 world generation: C→P | The generator is CI-critical; redesigning it would break reproducibility for no gain |
| 25 dialogue, 33 modder pipeline: B→P | Narration is additive; touching `people.ts` or the modder pipeline is not required and would risk 241 tests |
| 41 save validation: B→P | Version gating works; anti-tamper is optional hardening, not a contract change |
| 45 art pipeline: F→P | Species work is impossible without the pipeline; it is infrastructure, not a deferred feature |
| 52 "no tests": E→NA | An absence cannot be removed; it is answered by writing tests |
| Duplicates merged | The defect list now means something: four E rows, all genuinely forbidden patterns |
| C category retired | Every surviving item is either an idea to port (A), a contract to replace (R), or a thing to keep (P) |

The net shape is the same conclusion Report 11 reached, with better accounting: **OpenWorld is
preserved almost entirely; Corvus contributes eight patterns; five Corvus contracts are replaced; four
Corvus defects are forbidden; eight items are deferred on purpose.** Nothing in the corrected matrix
says "delete the creator" or "delete the harness", which is what the original matrix told an
implementer to do.
