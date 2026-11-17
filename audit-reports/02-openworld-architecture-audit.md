# REPORT 02 — OpenWorld Complete Architecture Audit (Agent 1)

**Repository:** `SihanXU/openworld` — branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`.
**Method:** source reading only, isolated sparse clone, no installs, no builds, nothing executed.
**Audit date:** 2026-11-16.

> Scope note: this is the *first* investigation pass required by the brief ("start Agent 1 and
> Agent 2"). It is a complete system inventory with file/line evidence and dispositions. Items whose
> truth depends on running the code are marked `NOT VERIFIED` rather than guessed.

---

## 1. What OpenWorld actually is

OpenWorld describes itself (README, `DOC`) as "a pixel-art open-world RPG that runs in the browser,
together with the engine and editor it is built on. Everything in the world follows rules written as
data. When a player tries something no rule covers, a language model can propose a new rule, which
the engine validates before applying it. The game is fully playable without a model."

The repository confirms a genuine multi-package engine product, not a demo:

| Path | Contents (verified by reading) | Source LOC |
|---|---|---|
| `packages/engine` | Deterministic kernel: world, rules, effects, events, behaviour, quests, story, saves, mod port, sandbox | 22,643 |
| `packages/ai` | Modder service, model backends, provider registry, agent/RSI harness, creator | 12,729 |
| `packages/runtime` | Browser player: Phaser 4 scene, HUD, audio, figure/portrait rendering | 32,018 |
| `packages/editor` | Browser + Electron editor with its own local HTTP service | 10,352 |
| `packages/modules` | Optional systems: classes, kits, loot, needs, society, boons, waypoints, fishing | 6,831 |
| `packages/format` | Project format, compiler, validator, localisation, JSON Schemas | 2,081 |
| `packages/bridge` | Agent protocol transports (HTTP, relay, clock) | 235 |
| `packages/stdlib` | `ontology.json` + `rules.json` data roots | (data, 14 LOC loader) |
| `games/openworld/content` | The actual game: ontology, items, recipes, quests, story, bosses, society | 14,878 |
| `games/starter` | Minimal data-only game used as the editor's template | small |

Repo-wide there are **241 `*.test.ts` files** (79 under `games/openworld/tools/test`, 50 under
`games/openworld/content/test`, 34 runtime, 19 `packages/ai`, 17 `games/openworld/ai`, 13 editor,
7 format, 6 engine, 6 starter, 1 wiki, plus task fixtures).

`CLAUDE.md` states the strict dependency direction (`SRC`, docs/architecture section):

```
client (Phaser 4 + DOM HUD) → engine (pure TS, in a Web Worker) → Mod port → modder service (HTTP)
```

with `games/*` allowed to import `packages/*` and never the reverse, and
`packages/engine/test/boundaries.test.ts` enforcing it (`TEST`, not executed).

---

## 2. Kernel architecture

### 2.1 World state

`packages/engine/src/types.ts:1666` — `WorldState`:

```
tick, seed, rng (PRNG state), player, entities: Record<Id,Entity>, maps: Record<string,MapData>,
loadedMaps, counter, spawn, reported?, quarantine?, question?, paces?, dormant?, relations?, legacyTiles?, reseed?, chunks?
```

Two properties matter enormously for the fusion:

- **The entire simulation is one serialisable object.** There is no hidden engine state; even the
  RNG is a field (`rng.ts:1-5`, mulberry32 whose state lives in `WorldState.rng`, so "every run is
  replayable"). Behaviour memory is placed deliberately: `Entity.combat` is documented as "never read
  by rules"; boss memory is `Entity.boss`; story position is `Entity.script`.
- **Maps are split into static file data and per-instance diff.** `Entity.from` marks "the map whose
  file made it"; `WorldState.chunks` (`ChunkState`) keeps "what differs from its file"; `sparse.ts`
  (406 lines) implements keeping maps far behind. This is the mechanism behind the claimed 89 KB
  save over a 1,024-map world.

### 2.2 Entity model

`types.ts:468` — `Entity` is a **typed, tag-driven, relational entity**, not an ECS archetype:

```
id, type, name?, tags?, props?, statuses?, statusBy?, place: Place, facing?,
contents?: Id[], held?: Id, npc?: NpcData, residentWork?, ai?: AiData, combat?: CombatState,
script?: SceneState, boss?: BossState, frozenBy?, dropped?, slots?, slotItems?, skillbar?,
selected?, look?: string | Look, from?
```

`Place` (`types.ts:460`) is a union of `on` / `in` / `held` / `in-region` references, i.e. the world
is a **containment graph** (`world.ts:50` `REVERSE: {on:'under', in:'contains', held:'holds',
'in-region':'encloses'}`). Cells are addressable pseudo-entities (`cells.ts:15` `cellId`, spaces
`floor|soil|volume`), so terrain changes are modelled as ordinary entities — a design that lets one
rule language address floors, volumes and objects uniformly.

Inheritance is by type-id path plus tags (`rules.ts:233` `kindCovers`), with an index
(`world.ts`: `ofType`, `people`, `withProp` per `CLAUDE.md`) so nothing scans "every thing".

### 2.3 Rules, holes and specificity

`rules.ts` is the heart. A rule is a host selector + condition tree whose leaves are either
`{ do: Effect[] }` or `{ undefined: true, default?: Effect[] }` (`rules.ts:318-319`, `isDo`/`isHole`).
Matching walks the tree (`rules.ts:240` `walk`), conditions evaluate against roles
(`rules.ts:53` `evalCond`, `ROLES` at `:14` = host/actor/target/instrument/other/item/source), and
resolution returns (`rules.ts:453` `Resolution`):

```
{ defined, rule?, leaf?, hole?: {rule,path,default}, open?: {key,tier,path}, fault?: {...} }
```

**This is the single most important structural fact in the whole audit:** the engine has a
first-class, addressable notion of *"this interaction is not defined"* — with a stable key for the
gap (`holeKey` `:474`, `placeKey` `:477`, `patchKey` `:480`) and a tier (`low|medium|high`). Learned
answers are stored per `type|kind|hole|tier` and composed (`compose` `:534`, `RuleLibrary` `:613`).
Specificity ordering is explicit (`specOf` `:432`, `compareSpec` `:442`, `rulesTie` in `mod.ts:1926`).

Nothing in Corvus corresponds to this, and it is the mechanism that makes "AI proposes a rule, engine
validates and executes" possible without the AI ever writing state.

### 2.4 Effects and the write guard

`effects.ts` (1,168 lines) defines `PRIMITIVES` (`:26`), `EffectRunner` (`:90`) and role-restricted
effect sets: `RESIDENT_ONLY` (`:82` — `topic, scene, lightning, fallback, appear, begin, startQuest,
facts, advance, stage, accept, decline, failQuest`) and `QUEST_ONLY` (`:84`). Refusals are typed:
`REFUSAL`/`refusalLine` (`:87-88`).

Writes are gated by a `Writer` (`world.ts:88`) that throws `WriteError` (`world.ts:91`) outside a
legitimate outcome. `CLAUDE.md` documents the rule: "the mutators throw outside an outcome, the
clock, loading, the input's posture and the author, and in an outcome beyond its host", enforced by
`games/openworld/tools/test/writes.test.ts` (`TEST`, exists, not run). This is precisely the
"engine remains authoritative" boundary the brief demands, already implemented and tested in source.

### 2.5 Events, tick and time

`engine.ts` (2,206 lines): `class Engine` (`:103`) with `queue`/`offer`/`flush` (`:301/:319/:327`),
`dispatch` (`:396`), `resolveEvent` (`:445`), `run` (`:482`), `act`/`actEvent` (`:646/:622`),
`replay` (`:542`), `preview` (`:568`), `settle` (`:1120`), plus statuses (`:996`), props (`:1018`)
and damage (`:1046`). `UndefinedSink` (`:35`) is the seam the modder plugs into; `MapChunk` (`:49`)
is the streaming unit.

Time is `calendar.ts`: `TICKS_PER_MINUTE = 10`, `TICKS_PER_HOUR = 600`, `TICKS_PER_DAY = 14400`
(`:7-9`), start hour 6 (`:11`), weather `sun|cloud|rain|storm|fog` (`:13`), deterministic weather
from `(day, hour, seed, plan)` (`:41`). The runtime worker ticks at 10 Hz per `CLAUDE.md`.

Determinism: seeded PRNG in state; `seedOf(...parts)` (FNV-1a, `rng.ts`) gives per-occasion streams
so adding content does not reshuffle unrelated draws. Save format `game.ts:202` writes
`{version:1, world: worldVersion, state, library: learnedJSON() (or whole), savedAt, codex}`;
save/load refuse a foreign content version (`game.ts:70-71`).

---

## 3. System-by-system inventory

Status legend: **C** = COMPLETE (source-verified; runtime NOT VERIFIED) · **L** = IMPLEMENTED BUT
LIMITED · **P** = PARTIALLY IMPLEMENTED · **D** = DOCUMENTED BUT NOT IMPLEMENTED · **X** =
EXPERIMENTAL · **N** = NOT FOUND.

| # | System | Status | Evidence (file:line) | Notes / limits | Disposition |
|---|---|---|---|---|---|
| 1 | Simulation kernel / tick | C | `engine.ts:103,301,396,445` | Event queue + resolution loop; no game loop in engine | PRESERVE |
| 2 | World state & save | C | `types.ts:1666`, `game.ts:202` | Single serialisable state; version gate | PRESERVE |
| 3 | Entity/containment model | C | `types.ts:468,460`, `world.ts:50` | Graph of on/in/held/in-region; cells as entities | PRESERVE |
| 4 | Ontology (types/statuses/terrains/factions) | C | `types.ts:270,45,219,250` | Data, per game; merged over stdlib | PRESERVE |
| 5 | Rule engine + holes + specificity | C | `rules.ts:53,240,453,474,613` | Tree walk, roles, tiers, patch keys | PRESERVE |
| 6 | Effect primitives + write guard | C | `effects.ts:26,82,90`; `world.ts:88,91` | `WriteError` outside outcomes; role-restricted ops | PRESERVE |
| 7 | Determinism | C | `rng.ts:1-25`, `types.ts:1666 (rng)` | mulberry32 + per-occasion seeds | PRESERVE |
| 8 | Time / calendar / weather | C | `calendar.ts:7-63` | 14400 ticks/day; deterministic weather spans | PRESERVE |
| 9 | Spatial indices / streaming | C | `world.ts` (`ofType`,`people`,`withProp`), `sparse.ts`, `chunk.ts` | Static map file + diff chunk (`ChunkState`) | PRESERVE |
| 10 | Dormant maps + inbox | C | `types.ts:1666 (dormant)` | Off-screen maps frozen with queued events | PRESERVE / EXTEND |
| 11 | Actor behaviour (goal system) | C | `behaviour.ts:26,29` | Order: encounter, danger, threat, social, follow, need, schedule, home, idle | PRESERVE |
| 12 | NPC schedules/work/homes | C | `types.ts:739,766,775`, `npc.ts:452` | Schedule entries with anchors, variants, needs | PRESERVE |
| 13 | Wellbeing (harm/needs) | C | `wellbeing.ts` (801), `types.ts:219` | Needs derived by dry runs, `endures:` tags | PRESERVE |
| 14 | Combat (kernel) | C | `blows.ts:11-36`, `engine.ts:1046`, `types.ts:664` | mainhand/offhand slots (`wear:weapon`,`wear:arm`) | PRESERVE |
| 15 | Monster kits / boss encounters | C | `modules/kits`, `types.ts:547,607,625,639` | Wind-up/telegraph/rotation, boss memory saved | PRESERVE |
| 16 | Inventory / bag slots | C | `controls.ts:43 (SLOT_COUNT=30)`, `types.ts:468 slots/slotItems` | Physical stacks keep identity (`stacks.ts`) | PRESERVE |
| 17 | Equipment / affixes / sets | C | `affixes.ts`, `types.ts:1588,1600`, `World.stat` | Rolled affixes, set bonuses, `Ontology.affixes/sets` | PRESERVE |
| 18 | Crafting | C | `controls.ts` craft path, `types.ts:1610 Recipe`, `recipes.ts` | `madeOf` keeps material+quality under produced name | PRESERVE |
| 19 | Building / construction | C | `construction.ts` (content), `world.ts:41 isBuilt`, `types.ts:151 WorldParams` | structures/fixtures; pieces bound to walls in runtime | PRESERVE |
| 20 | Farming / homestead / haven | C | `content/src/farming.ts`, `homestead.ts`, `haven.ts` | Crops, beasts, fish, land upgrades | PRESERVE (game-layer) |
| 21 | Progression / skills | C | `progression.ts:15,47,104`, `types.ts:1455,1538` | XP `20*level`, skill tree with `requires`/points | PRESERVE |
| 22 | Companions | C | `companion.ts:49`, `types.ts` | Follow across maps; guide to tracked quest | PRESERVE |
| 23 | Quests (Bethesda-style) | C | `quests.ts:177,200,268`, `types.ts:96,115,129` | Aliases, objectives, stages, news, radiant offers | PRESERVE |
| 24 | Story script (Story Manager) | C | `story.ts:20,51`, `types.ts:1146,1179,1207` | Steps with triggers; scenes/beats; writes story props only | PRESERVE |
| 25 | Dialogue / people lines | L | `people.ts`, `types.ts:809,818,906,1061` | Keyed lines, schedule variants, talk topics/verbs — not free-form LLM dialogue | IMPROVE (hand to AI) |
| 26 | Relationships / factions / society | C | `types.ts:855,890,920,964,443`; `modules/society` | Deeds, regard, gossip, watches, prices, law | PRESERVE |
| 27 | World generation | C/G | `tools/src/demo/continent/generate.ts`, `backdrop.ts`, `rooms.ts`; `docs/continent.md §8` | 1,024 maps claimed; `public/world/` **not committed** (`gen:world`) | PRESERVE |
| 28 | Character appearance ("looks") | L | `looks.ts:9-99`, `types.ts:1229-1282`, `content/src/looks.ts:290` | 4 bodies, 12 slots, palette; sprite bases hand-drawn 24×36 | IMPROVE / EXTEND (species) |
| 29 | Renderer / player | C (source) | `packages/runtime/src/render/*`, `ui/*`, `audio/*` | Phaser 4; snapshots + `frameDelta`; NOT VERIFIED visually | PRESERVE |
| 30 | Project format + compiler + validation | C | `format/src/project.ts:37`, `compile.ts:141`, `check.ts:26,178,199` | Files → bundle; reference/size/portal/rule checks | PRESERVE |
| 31 | Editor (web + desktop) | C (source) | `editor/src/app/*`, `server/api.ts`, `server/workspace.ts`; Electron shell | Modes: map, people, database, rules, story, holes, locale, assets | PRESERVE |
| 32 | Localisation | C | `format/src/texts.ts`, `localize.ts`, `locales/` | Source language + tables; CSV/PO round-trip | PRESERVE |
| 33 | AI: modder pipeline | C | `ai/src/modder/pipeline.ts:1-20,168` | comprehend→recall→design→fix→verify→review→commit→record→reflect | PRESERVE / ADAPT |
| 34 | AI: patch validation | C | `engine/src/mod.ts:1313`, `:802 placePatch`, `:271 buildModSpec` | Host-only writes, tag/ontology checks, economy LP | PRESERVE |
| 35 | AI: sandbox replay | C | `sandbox.ts:24,26`, `checks/audit.ts` | Replay trigger + derived tests before accept | PRESERVE |
| 36 | AI: provider abstraction | C | `ai/src/models/model.ts` (`Model`,`ChatOptions`,`ModelReply`), `providerList.ts:28`, `providers.ts` | 8 providers incl. OpenAI/Anthropic/Gemini/OpenRouter/Ollama/custom | PRESERVE / ADAPT |
| 37 | AI: model routing / detection | C | `engine/src/quality.ts:1-40`, `ai/src/modder/detect.ts:16,45,121` | Per-category levels + probe-based recommendation | PRESERVE |
| 38 | AI: shared rule library | C | `ai/src/library/library.ts`, `promote.ts`; `mod.ts:379 restoreLibrary` | Append-only patch log; promotion to content | PRESERVE |
| 39 | AI: agent/RSI harness | X | `ai/src/agent/*`, `games/openworld/ai/*`, `docs/rsi*.md` | Research apparatus, not gameplay | DEFER |
| 40 | AI: autonomous creator (workshop) | X/L | `ai/src/service/server.ts:96-169` (`/creator/*`), `docs/autonomous-creator.md` | Job API + MCP tools; host-only guarded | DEFER |
| 41 | BYOK in the player | C | `runtime/src/ownModel.ts`, `modderWorker.ts`, `ai/src/player/*`, `docs/byok.md` | Key stays in browser; sent only to chosen service | PRESERVE |
| 42 | Wiki generator | C | `games/openworld/wiki/src/build.ts`; `npm run wiki:check` in CI | Completeness gate per item/person/quest | PRESERVE (later) |
| 43 | Tests / CI | C (wiring) | `.github/workflows/check.yml` | typecheck + full suite + `no-ai` + creator matrix + merge gate | PRESERVE |
| 44 | Portrait / sprite art pipeline | C/G | `tools/src/art/portraits/*`, `art/looks/*`, `art/cg/*`; `runtime/src/assets/figure/*` | Python + ComfyUI tooling; art not fetched in this audit | UNVERIFIED (art) |
| 45 | Save-file validation / anti-tamper | L | `game.ts` version gate; `validatePatch` for AI input | No signature or checksum; economy guard only in patch validator | IMPROVE |

---

## 4. The two AI-relevant seams (detail)

### 4.1 `ModPort` — the engine's question to the model

`mod.ts` (2,082 lines) defines the whole protocol as data: `Patch` (`:29`), `EntityInfo` (`:39`),
`ModRequest` (`:62`), `ModSpec` (`:107`), `ModProvider` (`:130`), `ModWorkspace` (`:137`),
`ResolveBody`/`ResolveReply` (`:142/:154`), `UndefinedRecord` (`:182`), `ValidationResult` (`:203`).
`ModPort` (`:471`) implements `UndefinedSink`; `buildRequest` (`:994`) and `buildScenario` (`:1101`)
construct the question; `signatureOf` (`:443`) de-duplicates; `AGAIN_AFTER = 3` / `AGAIN_WITHIN =
1200` (`:467-469`) implement "ask again on the player's third try". Requests are built per **one
hole and one class of event**, not per turn — a fundamentally different granularity from Corvus's
"one GM call per turn".

### 4.2 `validatePatch` — why the AI cannot corrupt the world

`mod.ts:1313` is documented as total: "whatever is sent (a save, a reply, a file), the answer is a
result, never a throw". `check()` (`:1319+`) enforces, in order: artefact shape; id hygiene
(`idProblem` `:1302` rejects `\`, leading `/`, and `.`/`..` segments); new type/status definitions
(`newTypeProblems`, `newStatusProblems`); that **conditions reference only tags the world actually
carries** (`checkTag`, with an explicit open family list `skill:|profession:|faction:|tool:|liquid:|
material:|quality:|element:|role:`); that selectors use types/tags/props and not `kind`; role names;
exact object shapes; locality (host-only writes); and the economy LP
(`ai/src/checks/economy.ts`). The library is re-validated at commit time against its current state.

This is the concrete answer to the brief's §7 requirement "the AI must never directly overwrite
authoritative state": in OpenWorld the AI never emits mutations at all. It emits *rules*, which are
validated, replayed in a sandbox (`sandbox.ts:26`), and then executed by the ordinary engine.

---

## 5. Character appearance — what the requirements actually are

This section exists because Report 07 (species architecture) depends on it, and because it is the
place where a casual reading of "characters with looks" most underestimates the work.

**Engine contract** (`engine/src/looks.ts`):

- A look is `{ body, parts: slot→partId, colors: key→colour, own? }` (`types.ts:1229`).
- Checked against `LookTable` (`types.ts:1273`): `lookProblems` (`looks.ts:34`) rejects unknown
  bodies, unknown parts, a part in the wrong slot, and **a part not drawn for that body**
  (`p.bodies && !p.bodies.includes(look.body)`).
- Tags are *derived*, never stored: `lookTags` (`:22`) unions body tags + part tags + colour tags
  (`silver hair → look:grey-haired`). So gameplay can key on appearance via the normal rule engine.
- Worn equipment joins the look: `wornLook` (`:65`) maps a garment's `look` prop to a part slot and
  paints it in its material's colour (`LookTable.materials`).
- `restyled` (`:52`) mutates identity appearance in-world; `lookCode` (`:82`) is the renderer key;
  `lookWords` (`:88`) produces the natural-language description handed to the modder.

**World data** (`games/openworld/content/src/looks.ts`):

- `LOOK_BODIES` = **four**: `woman`, `man`, `girl`, `boy` (`sex` × `age` only).
- `LOOK_SLOTS` = `hair, face, beard, age, mark, glasses, hat, cloak, armour, outfit, legs, shoes`
  (`:20`), with `WORN_SLOTS = {armour, cloak}` filled only by equipment.
- `LOOK_COLORS` is a named palette with per-family eligibility (`for: ['hair'|'skin'|'eyes'|'cloth'|
  'metal'|'leather']`) and per-key tags.
- `generateLook(seed, who, pins)` (`:290`) is a **seeded generator**: deterministic per person id,
  with `OWN_STREAM` slots (`legs`, `shoes`) on separate streams so adding them reshuffled nobody.
- Parts carry `gen` weights; the generator respects body compatibility via `weightOf`.

**Rendering contract** (`packages/runtime/src/assets/figure/`): map sprites are **hand-drawn ASCII
pixel grids**, `BASE_W = 24`, `BASE_H = 36` (`bases.ts:17-18`), three facings, four walk frames plus
an idle, with the child body derived by carving rows out of the woman's frames. Portraits are cut
layers under `public/assets/lsw/Looks/portrait`, repainted from the look's colours
(`runtime/src/assets/figure/portrait.ts`), and NPCs may instead carry a whole drawn sheet
(`Entity.look: string`).

**Consequences for fantasy species (evidence-based):**

1. Adding a species is *not* a palette change. A species with a different skeleton (lizardfolk legs,
   dragonkin wings/tail, orc tusks/hunched frame, undead skull faces) needs **new bodies** in
   `LookTable.bodies`, **new parts** with `bodies: [<new body>]`, **new 24×36 base frames** for three
   facings × five frames, **new portrait layer sets**, and **equipment part mappings** per slot.
2. Species that differ only in ears/tusks/skin tone/horns *can* share the existing bodies: `mark`,
   `face`, `hair`, `hat` slots and the `eyes/skin/hair` colour keys already accept per-part variants,
   and `LookPartDef.bodies` allows a part restricted to specific bodies.
3. Non-humanoid creatures are already handled by a different mechanism: `Entity.look` as a whole
   sheet key (skeletons, statues, creatures) — i.e. the architecture *anticipates* non-humanoids but
   as sprites, not as part-composed characters.
4. Seed stability is per-person (`generateLook(seed=id)`), so adding bodies/parts later changes
   generated looks unless new slots use their own stream (the `OWN_STREAM` precedent). Any species
   work must preserve that discipline or it will silently rewrite every existing NPC's face.

---

## 6. Tooling and product surface

- **Format/compiler:** `format/src/project.ts:37` `FORMAT = 1` and the file list (`game.json`,
  `ontology/`, `rules/`, `maps/`, `people/`, `quests/`, `story/`, `catalog.json`, `client/`,
  `learned/`, `locales/`, `extra.json`, `assets/`). `compile.ts:141` `compile()` →
  `{bundle.json, world/, assets/}`; `mergeOntology`/`mergeRules` (`:30/:63`) compose stdlib → modules
  → project. `check.ts:26` `checkProject()` returns `Problem[]` (references, sizes, portals, anchors,
  ties); `ruleProblems` (`:178`) and `ties` (`:199`) cover rule sanity.
- **Editor:** `packages/editor/src/app/` (modes) and `src/server/` (`api.ts` local service, `workspace.ts`
  folders, `assets.ts` pack import, `export.ts`+`zip.ts` export, `server.ts`+`cli.ts`). `CLAUDE.md`
  enumerates the modes and the undo/store model. It is a *real* editor, not a stub.
- **Runtime:** `runtime/src/render/scene.ts` renders `snapshot.ts` frames; `frameDelta.ts` sends
  diffs to the page; `audio/music.ts` a director; `ui/` the HUD/menus; `assets/figure/` looks.
- **Agent players:** `packages/bridge` (HTTP, relay, clock) + `docs/agent-players.md` let an agent
  play through the same `SeatInput` list as a human (`seat.ts`, `observe.ts`, `agents.ts`,
  `inputDocs.ts`). This is a ready-made hook for AI-controlled NPCs and for testing.

---

## 7. Verification matrix (first pass)

| # | Claim | Repo | File | Symbol / line | Method | Confidence |
|---|---|---|---|---|---|---|
| 1 | Engine is a pure deterministic kernel with no DOM/AI | OW | `packages/engine/src/index.ts`, `rng.ts` | barrel exports; mulberry32 | SRC | High |
| 2 | World is one serialisable state object | OW | `types.ts` | `WorldState` :1666 | SRC | High |
| 3 | Undefined interactions are first-class | OW | `rules.ts` | `Resolution` :453, `holeKey` :474 | SRC | High |
| 4 | AI emits validated *rules*, not state mutations | OW | `mod.ts` | `validatePatch` :1313, `placePatch` :802 | SRC | High |
| 5 | Writes outside outcomes throw | OW | `world.ts` | `Writer` :88, `WriteError` :91 | SRC + `writes.test.ts` exists (TEST, not run) | High |
| 6 | Sandbox replay gates acceptance | OW | `sandbox.ts` | `buildSandbox` :26; `checks/audit.ts` | SRC | High |
| 7 | Provider list incl. OpenAI/Anthropic/Gemini/OpenRouter/Ollama/custom | OW | `ai/src/models/providerList.ts` | `PROVIDERS` :28 | SRC | High |
| 8 | Per-category model capability detection & recommendation | OW | `ai/src/modder/detect.ts`, `engine/src/quality.ts` | `Detector` :121; `AI_LEVELS`, `AI_WAIT_MS` | SRC | High |
| 9 | Save survives 1,024-map world at 89 KB | OW | `docs/continent.md §8` | numbers table | DOC only | Medium — needs `npm run scale` to verify |
| 10 | 1,024 maps / 1,654 people exist in the shipped game | OW | `public/world/` (not committed) | — | GEN | Medium — must run `gen:world` |
| 11 | Looks: 4 bodies, 12 slots, seeded generator | OW | `content/src/looks.ts` | `LOOK_BODIES`, `LOOK_SLOTS`, `generateLook` :290 | SRC | High |
| 12 | Map sprites are 24×36 hand-drawn per-body | OW | `runtime/src/assets/figure/bases.ts` | `BASE_W/H` :17-18 | SRC | High |
| 13 | 241 test files; CI runs typecheck + suite + no-AI job | OW | `.github/workflows/check.yml` | jobs `check_test`, `no_ai` | SRC | High (wiring); pass/fail NOT VERIFIED |
| 14 | Game builds and plays without `packages/ai` | OW | CI `no_ai` job; `CLAUDE.md` | — | DOC | NOT VERIFIED |
| 15 | Editor is functional web+Electron app | OW | `editor/src/**`, `desktop/` | — | SRC | Medium — UI not run |
| 16 | Multiplayer/networking | OW | — | — | NOT FOUND | — single-player only; no netcode found |
| 17 | Voice / TTS | OW | — | — | NOT FOUND | — none (Corvus has it) |
| 18 | Free-form LLM dialogue for NPCs | OW | `people.ts` (keyed lines) | — | PARTIAL | High — dialogue is authored lines, not generated |

---

## 8. Structural limitations and risks (Agent 1's honest list)

1. **Dialogue is authored, not generated.** OpenWorld's talk system is keyed lines, schedule
   variants and topics (`people.ts`, `types.ts:809-820`). There is no NPC free-text conversation
   anywhere in the engine. Adding Corvus-style conversation is genuinely new work, and it must not
   bypass `WriteError`/rule resolution.
2. **The AI's unit of work is a rule hole, not a conversation.** `ModRequest` is built from one
   event and one scenario. A narrator needs a *turn*-shaped request with history; that does not
   exist and should not be forced into `ModPort`.
3. **Latency budget is hard-coded for gameplay acts**: `AI_WAIT_MS = 20_000` (`quality.ts`) is "how
   long the world stands still for the player's own question". A narrator streaming a paragraph has a
   different budget; conflating them will hurt either play or prose.
4. **Model-facing prompt text lives in `packages/ai`**, and prompts are large and behaviour-critical
   (`modder/prompts.ts`). Any new narration layer needs its own prompt module, not edits to these.
5. **The committed world data is generated, not stored** (`public/world/` is generated by
   `gen:world`). CI regenerates. A unified project must keep that reproducibility or ship the world.
6. **Asset scale is the real cost centre.** 689 MB of committed art; portraits and CG per character
   (`tools/src/art/*`). Every species and every new look part multiplies art work. This is the
   single biggest practical risk to the fantasy-species goal.
7. **No networking layer.** If "open world" ever means shared worlds, that is a from-scratch design,
   not a refactor.
8. **Single-player save semantics** (one `WorldState`, one player id) are baked into `WorldState`
   (`player: Id`). Multi-player or multi-actor seats exist (`seat.ts`) but the save does not model
   several players.
9. **Version gate is coarse**: `game.ts` discards saves from another content version. There is no
   migration framework in the engine; the *game* carries `migrate*.ts` files. Corvus has no migration
   at all.
10. **Nothing was executed.** Build health, test pass rate, actual frame performance at 1,024 maps,
    and editor usability are all unverified in this phase.

---

## 9. What this means for the fusion (preliminary, pending Agents 3–7)

- OpenWorld supplies, intact and authoritative: the kernel, world state, rules/holes, effect
  execution with the write guard, determinism, sparse saves, quests/story, society, the format,
  the compiler/validator, and the provider/model-routing layer.
- The missing layer is **narrative**: conversation, memory, narrator/GM separation, prose. Corvus is
  the reference for that layer's *orchestration shape*, not for its data model.
- The correct integration point is **beside** `ModPort`, not inside it: a new "narration port" that
  turns an in-world outcome (already resolved by the engine) into prose, and turns a player's
  conversational intent into an `Engine.act(...)` attempt — never a direct state write.
- Concretely, the AI's permitted vocabulary in the fused system should be exactly: (a) a rule patch
  through `validatePatch`, (b) an *act request* the engine resolves, (c) prose. Never a delta to
  `WorldState`.

**Report 02 status: first pass complete.** Deep-dives still owed: `effects.ts` primitive-by-primitive,
`modules/society` conduct rules, `quests.ts` news/alias machinery, `editor` mode-by-mode, `runtime`
render/audio, and the art pipelines under `tools/src/art/`.
