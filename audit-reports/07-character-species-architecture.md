# REPORT 07 – Character / Species Architecture

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. Character model comparison

| Dimension | OpenWorld | Corvus Story Core | Unified design |
|---|---|---|---|
| **Core types** (`server/types/index.ts:540`) | `PlayerCharacter` (stats Record, money, extraCurrencies, abilities, inventory, relationships)<br>`NPCCharacter` (status active/pending/disabled, memory[], image{basePrompt,coreAppearance,defaultOutfit,baseNegative,identitySeed,portraitPath}) | `GameConfig`, `WorldInfo`, `PlayerCharacter`, `NPCCharacter`, `ChatMessage`, `WorldState`, `GameMasterOutput`, `Summary`, `LMStudioSettings`, `GlobalConfig` | OpenWorld's types are the base; Corvus's types become narrative projections |
| **Appearance / looks** (`content/src/looks.ts`; `types.ts:1229-1282`) | `LOOK_BODIES` = 4: woman, man, girl, boy (sex + age only)<br>`LOOK_SLOTS` = hair, face, beard, age, mark, glasses, hat, cloak, armour, outfit, legs, shoes<br>`LOOK_COLORS` named palette with per-family eligibility<br>`generateLook(seed, who, pins)` seeded deterministic generator<br>24A-36 hand-drawn ASCII pixel bases (BASE_W=24, BASE_H=36)<br>Three facings, 5 walk frames + idle; child body derived from woman's frames | `NPCCharacter.image{basePrompt, coreAppearance, defaultOutfit, baseNegative, lastPrompt, lastSeed, identitySeed, portraitPath}`; free-form text description; no part-composed look system | Keep OpenWorld's look system as the **engine contract**; Corvus's image fields map to `basePrompt`/`portraitPath` as optional narrative annotations. Non-humanoid creatures use `Entity.look` as whole-sheet key (already anticipated in OpenWorld). |
| **Species addition** | **Four bodies** (woman/man/girl/boy). New species: <br>1. Different skeleton (lizardfolk, dragonkin, orc, undead) → **new bodies** in LookTable, new parts with `bodies: [<new>]`, new 24A-36 base frames for 3 facings + 5 frames, new portrait layer sets, equipment part mappings per slot.<br>2. Minor differences (ears, tusks, skin tone, horns) → can share existing bodies; `mark`, `face`, `hair`, `hat` slots accept per-part variants; `LookPartDef.bodies` allows part restricted to specific bodies.<br>3. Non-humanoid → handled by `Entity.look` as whole-sheet key (skeletons, statues, creatures).<br>4. Seed stability per person (`generateLook(seed=id)`) → adding bodies/parts later changes generated looks unless new slots use their own stream (OWN_STREAM precedent: legs, shoes on separate streams). | None (no appearance system beyond free-text `coreAppearance`); no body/slot architecture; no seeded generator | Keep OpenWorld's look system; extend with species-specific body/part/frame sets. Minor-species differences share the existing framework; major skeleton changes need new bodies/frames. Non-humanoids use the existing whole-sheet mechanism. |
| **Equipment & look composition** | `wornLook` (`looks.ts:65`) maps garment's `look` prop to a part slot and paints it in material's colour (`LookTable.materials`); worn equipment joins the look; `restyled` (`:52`) mutates identity appearance in-world; `lookCode` (`:82`) is the renderer key; `lookWords` (`:88`) produces natural-language description handed to the modder | No equipment-look composition; `NPCCharacter` has `image.basePrompt` and `image.defaultOutfit` as free text | Keep OpenWorld's equipment-look composition; Corvus's `defaultOutfit` maps to a look slot as a narrative annotation, not a mechanical join. |
| **Portrait rendering** | Portraits are cut layers under `public/assets/lsw/Looks/portrait`, repainted from the look's colours (`runtime/src/assets/figure/portrait.ts`); NPCs may carry a whole drawn sheet (`Entity.look: string`) | `portraitPath` on NPCCharacter; free-path to any image file; no rendering pipeline | Keep OpenWorld's portrait pipeline; Corvus's `portraitPath` is a free-file reference, not tied to the look pipeline. The narration port can generate a portrait description from the look's colours for display. |
| **Memory** | Entity-level `boss`, `script`, `script` fields; no tail-based retrieval in core engine | `NPCCharacter.memory[]` flat array; `slice(-5)` in narrator mode, `slice(-8)` in character mode; no salience, no decay, no relevance scoring | Keep OpenWorld's entity memory fields; adopt Corvus's `sourceMessageIds` + `stale` pattern for narrative memory (see below). Replace flat `slice(-5)` with relevance-aware retrieval. |
| **Status** | `active|pending|disabled` on NPCCharacter | Same `active|pending|disabled` on NPCCharacter | Same status model; both use it. |
| **Voice / audio** | No TTS in engine; `runtime/src/assets/audio/` exists; music director (`audio/music.ts`) | `TTSSettings` with `apiKey`; TTS route `/api/tts`; Chatterbox integration (`server/services/chatterbox.ts`) | Keep OpenWorld's audio music director; add Corvus's TTS capability as an optional service, not core to character model. |

---

## 2. Species extension framework

The following framework governs how new fantasy species are added to the OpenWorld look system. It is **not a palette swap** — each species tier requires specific work.

### 2.1 Species tiers

| Tier | Description | Work required |
|---|---|---|
| **Tier 1: Minor phenotype** | Differences in ears, tusks, skin tone, horns, eye shape, within the same body (human-like) | Share existing bodies (`woman/man/girl/boy`); add per-part tags via `LookPartDef.bodies`; add colour-key variants; new portrait description. **Estimated: 1–2 days per species** |
| **Tier 2: New body, same skeleton** | Species with a different head/frame but same upright biped skeleton (e.g. goblin, hobbit, dwarf with distinct features) | **New body** in `LookTable.bodies` (5th–8th entry); new 24A-36 base frames for 3 facings + 5 walk frames + idle; new portrait layer set; equipment part mappings may need adjustment; `generateLook` seed stream separation if new slots. **Estimated: 1 week per species** |
| **Tier 3: Different skeleton** | Species with fundamentally different anatomy (lizardfolk, dragonkin, orc, undead, centaur, merfolk) | **New bodies** in `LookTable.bodies`; **new parts** with `bodies: [<new body>]`; **new 24A-36 base frames** for three facings + five frames; **new portrait layer sets**; **equipment part mappings** per slot (armour/cloak may need redefinition); **new sprite bases**. **Estimated: 2–3 weeks per species** |
| **Tier 4: Non-humanoid** | Quadrupeds, serpents, insects, constructs, elementals, dragons | Use `Entity.look` as whole-sheet key (already anticipated); sprite sheet with multiple facings/frames; no part-composed look; no equipment slots (or custom slot mapping). **Estimated: 1–2 weeks per species** (sprite art only) |

### 2.2 Adding a Tier 1 species: step-by-step

1. **Add new part tags** in `content/src/looks.ts` under the relevant slot (e.g. `hair` gets `lizard-ears` tag).
2. **Add part definition** with `bodies: ['woman', 'man']` (or whichever bodies the part applies to).
3. **Add colour tags** under `LOOK_COLORS` with `for: ['hair'|'skin'|'eyes']` and per-key tags.
4. **Update `generateLook`** if new slots need their own `OWN_STREAM` (the `legs/shoes` precedent).
5. **Update portrait palette** if the species has distinct skin/hair/eye colours.
6. **Add natural-language description** via `lookWords` for the modder.

### 2.3 Adding a Tier 3 species: step-by-step

1. **Add new body** to `LOOK_BODIES` (e.g. `'lizardfolk'`, `'dragonkin'`).
2. **Create 3 facing × 5 frame base frames** (24 × 36 ASCII pixel art, hand-drawn, per body).
3. **Define new parts** with `bodies: ['lizardfolk']` and appropriate tags.
4. **Update `LOOK_SLOTS`** if new slots are needed (e.g. `'tail'`, `'wings'`).
5. **Create portrait layer sets** (cut layers repainted from look's colours).
6. **Update equipment mappings** — especially `WORN_SLOTS = {armour, cloak}` — to handle the new body type.
7. **Test `generateLook`** with the new seed stream discipline.
8. **Add lore/flavour** via `lookWords`.

### 2.4 Non-humanoid creatures

OpenWorld already anticipates non-humanoid creatures via `Entity.look` as a whole-sheet key. This means:

- A lizardfolk or dragoncan use a sprite sheet with multiple facings and walk frames.
- No part-composed look (no hair/face/slot system).
- No equipment slots (or custom slot mapping if the creature wears gear).
- The `lookWords` description still applies for natural-language narration.

This is the lowest-effort path for non-humanoid species and should be the default for any creature that does not have an upright biped skeleton.

---

## 3. Corvus character types in the unified system

Corvus's `NPCCharacter` and `PlayerCharacter` types are **narrative projections** of OpenWorld entities, not replacements. The mapping is:

| Corvus type | Unified mapping |
|---|---|
| `NPCCharacter.id` | Maps to `Entity.id` in OpenWorld; `NPCCharacter.name` → `Entity.name` |
| `NPCCharacter.name` / `revealedName` | Same string value; in unified system, also indexed in OpenWorld's `relations?` and `props?` |
| `NPCCharacter.status` (`active|pending|disabled`) | Same status on the entity; `pending` NPCs cannot be modified by GM deltas (`stateManager` rule: status never changes by model) |
| `NPCCharacter.memory[]` | Maps to entity-level memory fields + Corvus's `sourceMessageIds` + `stale` pattern; retrieval replaces `slice(-5)` with relevance-aware scoring |
| `NPCCharacter.appearance` / `coreAppearance` | Maps to `Entity.look` description or OpenWorld's look system (`generateLook(seed=id)`); free-text in Corvus becomes a narrative annotation in the unified system |
| `NPCCharacter.voiceStyle` / `chatColor` / `actionColor` | Free-text annotations; not used by OpenWorld engine; carried in narrative prose |
| `NPCCharacter.inventory[{name,description,quantity}]` | Maps to OpenWorld entity `slots?`, `slotItems?`; but instance identity and provenance are lost — Corvus loses this information; in the unified system, inventory is OpenWorld's typed system |
| `NPCCharacter.money` / `extraCurrencies` | Maps to OpenWorld `money` + `extraCurrencies`; Corvus has no economy model, so values are free-form |
| `PlayerCharacter` fields | Same mapping direction; OpenWorld's player model is strictly more typed and constrained |

**Key differences to document for the fusion:**

- Corvus **loses** instance identity and provenance when mapping to OpenWorld (Corvus's inventory is name+quantity only, no stack identity).
- Corvus **preserves** `sourceMessageIds` + `stale` provenance, which OpenWorld does not natively have — this is a net gain for the fusion.
- Corvus's free-form `stats` Record maps to OpenWorld's typed stats, but OpenWorld can enforce invariants (no negative stats unless explicitly allowed by a rule).
- Corvus has **no** concept of equipment, affixes, sets, or combat slots — these are purely OpenWorld domain.

---

## 4. Disposition for character/species components

| Component | Disposition | Reasoning |
|---|---|---|
| OpenWorld look system (bodies, slots, colours, generator) | **PRESERVE** | Engine-critical; 241 test files depend on it; the architecture is complete and verified in source |
| Corvus NPC memory (`slice(-5)` / `slice(-8)`) | **REIMPLEMENT** | Replace with relevance-aware retrieval (salience scoring, decay curve); keep `sourceMessageIds` + `stale` |
| Corvus character status (`active|pending|disabled`) | **PRESERVE** | Simple, correct, used by both; no conflict |
| Corvus character appearance (free-text `coreAppearance`, `portraitPath`) | **ADAPT** | Map to OpenWorld's look system as narrative annotations; not engine-critical |
| Fantasy species Tier 1–4 addition | **PRESERVE (OpenWorld) / ADAPT (Corvus)** | OpenWorld's look system is the engine; Corvus's free-text is replaced by OpenWorld's look annotations |
| Equipment-look composition (`wornLook`) | **PRESERVE** | Core engine mechanic; part of the write guard and effect pipeline |
| Non-humanoid creature handling (`Entity.look` as whole sheet) | **PRESERVE** | Already anticipated in OpenWorld; lowest-effort path for new species |

---

## 5. Summary

The unified character/species architecture **preserves OpenWorld's look system as the engine contract** and maps Corvus's character types as narrative projections. Species addition follows a four-tier framework where Tier 1 (minor phenotype) shares the existing framework and Tier 3+ requires new bodies, frames, and portrait sets — but non-humanoids use the existing whole-sheet `Entity.look` mechanism, which is the lowest-effort path.

The key integration point is: **Corvus character data becomes narrative annotations on OpenWorld entities**, not the other way around. The look system stays in OpenWorld; Corvus's appearance fields are display-only annotations.

---