# REVISION 2 — Corrected Character and Species Architecture

**Corrections in this document:** C-06 (tier overlap, whole-sheet overclaim, effort), plus the
correction of Report 07's "Tier 3 = 2–3 weeks" estimate.
**Evidence:** clean clone at `e3cadf3`; `docs/looks.md` and the runtime figure/portrait code read
directly. **No artwork was fetched or inspected** (the audit clone is code-only; the generated world
and baked catalog are git-ignored — `.gitignore:3-4`). Every art claim below is about the *pipeline*
and its data contracts, never about how a picture looks.

---

## 1. What Report 07 got wrong

| Original (Report 07 §2) | Problem |
|---|---|
| Four tiers: Tier 1 "minor phenotype", Tier 2 "new body, same skeleton", Tier 3 "different skeleton", Tier 4 "non-humanoid" | Tier 3 and Tier 4 **overlap**: both require something other than the part-composed biped body, and the report gives both the same "new bodies / new frames / new portraits" work while also claiming Tier 4 needs no parts. A lizardfolk with a tail is Tier 3 by name and Tier 4 by mechanics. The taxonomy classifies *species*, not *mechanisms*. |
| Tier 4 "use `Entity.look` as whole-sheet key (already anticipated) … sprite sheet with multiple facings/frames" | Half true in a way that misleads. A **string** `look` is not a sheet path; it is a key into the baked **catalog** (`personLook`, `runtime/src/assets/looks.ts:9`), and an unknown key **silently falls back** to a role's look (`catalog().roles.villager[0]`). Arbitrary per-species sheets are not supported: the sheet must be baked into the catalog at build time (`npm run bake`). |
| "Tier 3 … Estimated 2–3 weeks per species"; "Tier 4 … 1–2 weeks (sprite art only)" | Ignores that a new body also needs **every part it will use redrawn for it** (sprite grids *and* portrait layers, faces × moods), plus code changes (the body union is hardcoded). The art pipeline is the dominant cost, and it was not counted. |
| "New bodies in `LookTable.bodies`" (data only) | The runtime's body set is **code**: `export type BaseBody = 'woman' \| 'man' \| 'girl' \| 'boy'` (`figure/bases.ts:1239`), and `composeSprite` falls back to `'man'` for any body not in `BASES` (`sprite.ts:47`). Adding a body is a code change in the runtime plus art, not an ontology edit. |
| "Update `LOOK_SLOTS` if new slots are needed (e.g. `tail`, `wings`)" | Adding a slot is also **code**: the sprite composer draws a fixed slot order (`PIECE_SLOTS = ['outfit','armour','cloak']`, `UNDER_HAIR = ['face','age','mark','beard']` — `sprite.ts:34-36`) and the portrait is a fixed 13-layer stack (`docs/looks.md §3.2`). A `tail` slot changes both composers. |

---

## 2. The real look pipeline (verified)

### 2.1 Contract

```ts
// packages/engine/src/types.ts:1229
interface Look {
  body: string                        // a key of LookTable.bodies
  parts: Record<string, string>       // slot → part id
  colors: Record<string, string>      // skin|hair|eyes, or `<slot>.<n>` → colour id or #rrggbb
  own?: boolean                       // restyled in world; content no longer replaces it on load
}
// Entity.look?: string | Look        // string = whole drawn figure (a skeleton, a boss)
```

`LookTable` (`types.ts:1273`) holds `slots`, `bodies` (`{name, sex, age, tags}`), `parts`
(`{slot, name, bodies?, colors?, uses?, tags?}`), `colors` (`{hex, name, for:[], tags?}`) and
`materials` (a worn thing's colour by material).

Validation is real and cheap: `lookProblems` (`engine/src/looks.ts:34`) rejects an unknown body, an
unknown part, a part in the wrong slot, **a part not drawn for that body** (`p.bodies &&
!p.bodies.includes(look.body)`), and a colour key that colours nothing. Tags are *derived*, never
stored (`lookTags`, `:22`): body tags + part tags + colour tags → `look:*` tags the rule engine can
address.

### 2.2 Data as shipped

| Item | Value | Source |
|---|---|---|
| Bodies | 4: `woman`, `man`, `girl`, `boy` (`sex` × `age` only) | `content/src/looks.ts:24` |
| Slots | 12: `hair, face, beard, age, mark, glasses, hat, cloak, armour, outfit, legs, shoes` | `content/src/looks.ts:17` |
| Worn slots | `armour`, `cloak` only | `content/src/looks.ts:21` |
| Equipment join | a worn thing's type carries a `look` prop naming a part; `wornLook` paints it in its material colour and **skips it if the part is not drawn for that body** | `engine/src/looks.ts:65` |
| Map sheet | 24×36 per frame; 4 columns (facings: down, up, left, right-mirrored); 9 rows (4 walk + 1 idle drawn; run derived); anchor row 35 | `figure/sprite.ts:14-33` |
| Portrait | 768×1536 composed from 13 ordered layers (`hairBack, body, legs, outfit, shoes, armour, cloak, age, face, mark, beard, glasses, hair, hat`); per-body base; a **face has one layer per mood** (6 moods); a per-body bust for the dialogue box | `docs/looks.md §3.2`, `figure/portrait.ts` |
| Whole-figure actor | `PersonLook` key → `catalog().characters[key]` → a baked `ActorDef` (dir/sheet/cols/rows, optional faceset) | `assets/looks.ts:9-13` |
| Generation | `generateLook(seed = person id, who, pins)` — deterministic; `legs`/`shoes` on their own stream (`OWN_STREAM`) so adding them reshuffled nobody | `content/src/looks.ts:290`, `docs/looks.md §2` |

### 2.3 Consequences that decide the species design

1. **A "species" is not a body.** Almost nothing in the engine knows what a species is: species is
   (a) derived `look:*` tags, (b) content data (faction, culture, dialogue), (c) art. Only the *body*
   and the *parts drawn for it* are mechanical.
2. **Ears, tusks, scales, brow ridges, slit eyes, tattoos** are parts (slots `mark`, `face`, `beard`,
   `hair`, `age`) — cheap in data, expensive in art (per body, and per mood if a face).
3. **A tail, wings, a quadruped torso, a digitigrade stance** are not parts at all in the current
   composers. They need a new slot (code) or a whole-figure actor (catalog).
4. **Height/proportion** (dwarf, halfling, giant) cannot be achieved by scaling: the child body is
   *drawn* as a child (its own head, its own size reference, `docs/looks.md §4`), and the sprite
   anchor is fixed at row 35 for a 36px frame. Proportion = a new body = new base art + every part
   redrawn for it.
5. **Seed stability is fragile by design.** Existing looks are generated from the person's id. Adding
   a *part* to an existing slot changes that slot's weighted choice for everyone whose id falls into
   the new bucket — silently rewriting existing NPCs' faces. Adding a *body* is safe. Adding a *slot*
   is safe only if generated from its own stream (the `legs`/`shoes` precedent).

---

## 3. Corrected taxonomy: three mechanical classes

Classified by **skeleton, part composition, equipment and portrait compatibility** — what the
pipeline must do — not by species name.

| Class | Definition (mechanical) | Data changes | Code changes | Art changes |
|---|---|---|---|---|
| **A — Part-composed on an existing body** | Upright biped, same frame and proportions, same equipment slots; difference is in head/face/mark/colour/garb | new `LOOK_PARTS` entries with `bodies: [...]`; new colours with `for`/`tags`; new tags; species content (faction, names) | none (if no new slot) | per body it applies to: 1 sprite grid per facing (4) for the part, laid on the standing head and followed down on a step; and, if it is a face, **one portrait layer per mood (6)** for that body; plus tags/words |
| **B — New body (new skeletal proportions)** | Same biped rig (2 tiles tall, 4 facings, walk/idle rows) but a different silhouette: dwarf, hulking orc, long-limbed elf | new body entry; every part the body will use declares `bodies: [newBody]` | **yes**: `BaseBody` union + `BASES` frames (`figure/bases.ts:1239`), and the portrait manifest/base per body | a full base figure (sprite frames ×4 facings, drawn rows) **and** a portrait base (768×1536) with its size reference; then every part × body (faces × 6 moods) |
| **C — Whole-figure actor (not part-composed)** | Not a biped on the standard rig: centaur, dragon, wolf, serpent, construct | a catalog `characters` entry (baked); `Entity.look` = that key; no `parts`/`colors` | none in the engine; the catalog is produced by `npm run bake` | a full sprite sheet at the actor's frame size, plus an optional faceset/portrait; **no** equipment composition, **no** look tags, **no** part-level restyle |

Class C is not "lower effort" by definition — it is *differently* scoped: one actor's art instead of
a body plus its wardrobe. It is lower effort when the creature is one or two variants; it is higher
effort when you need many variants (each is a new sheet).

---

## 4. Species compatibility matrix

Effort is expressed in **asset units** (a unit = one part drawn for one body: 4 facing grids, plus
6 portrait layers if it is a face). It is deliberately not in days: no one has measured this pipeline
for a new species, and Report 07's day estimates were invented.

| Species | Correct class | Why (anatomy → mechanism) | Required work | Blockers / risks | MVP? |
|---|---|---|---|---|---|
| **Elf** | **A** | Biped, human proportions; ears/brow/eyes are parts | 1 ear/mark part × (adult bodies it is drawn for) = 2 units; optional face variant = 2 bodies × 6 moods; new skin/hair/eye colours + tags | Cheapest real species. Do **not** add a new part to an existing shared slot without checking generated-look drift | **Yes** |
| **Dwarf** | **A for MVP; B if stature is canonical** | Beard/culture = parts and content. True short-and-broad proportions = new body (child body is a *child*, not a dwarf) | A: beard (exists) + 1–2 parts + colours, ~2 units. B: full base + portrait base + every part × body, tens of units | As A, a dwarf is a human with a culture and a beard — a design decision, not a technical one. As B, it is the most expensive Class B case because it needs everything re-drawn shorter | **Yes as A**; B deferred |
| **Orc** | **A (tusks, skin, scars) / B (hulking frame)** | Tusks and heavy brow are parts (`beard`, `mark`, `face`); a genuinely different build is a body | A: ~2–4 units + colours. B: full base + redraw | Tusks via `beard` slot compete with beards for the same slot — check `lookProblems` slot equality and the generator's exclusivity | Yes as A |
| **Beastfolk** (cat/wolf) | **A for ears/mark; slot-level for tail; C for muzzle-dominant** | Ears = parts; a tail = new slot (code in both composers); a muzzle = a new head per body (face × 6 moods × bodies) | Ears/mark: 2–4 units. Tail: slot + code + per-body grid. Muzzle: 6 layers × bodies per body | Tail/wings are **not** data-only. A muzzle-dominant beastfolk is effectively Class B head work | Partial (ears/mark) |
| **Centaur** | **C only** | Quadruped; cannot use biped frames, cannot wear `armour`/`cloak` parts, portrait is not a layered bust | one catalog actor sheet (larger frame), optional faceset, no equipment composition | Will not accept equipment or look tags; combat/render assumptions of a 24×36, 1-tile-footprint actor must be checked (`ANCHOR_Y`, tile occupancy) | No — defer |
| **Lizardfolk** | **A (scaled skin, slit eyes, head crest) / C (full reptilian)** | A scaled biped with a human skull is A; a tail or digitigrade legs are slot/code or C | A: skin colour + face/eyes variant → 6 layers × bodies; crest as `hair`/`hat`-adjacent part | Eyes are a colour key, not geometry: "slit pupils" may be impossible without new face art per mood | Partial (A) |
| **Dragon** | **C** | Wings, tail, quadruped/biped-dragon silhouette; often a boss actor | one catalog actor (or a boss sheet), optional portrait | Wings cannot be parts; flight/occupancy is engine/behaviour work, not art | No — defer |

### 4.1 What this matrix means in practice

- **The MVP species budget is Class A only**, and each Class A species costs roughly a handful of
  asset units *per body it is drawn for* — not "1–2 days".
- **Class B is a project, not a task.** It is justified when stature is central to the fiction, and
  it must be scheduled as an art workstream with its own review, not as a content edit.
- **Class C is the only honest route for non-humanoids**, and it forfeits equipment, look tags and
  part restyling. Say so in design docs; do not promise "lizardfolk with armour" via Class C.

---

## 5. Seed stability rules (mandatory)

1. **Never** change an existing part's `gen` weight, id, or slot membership. Doing so rewrites
   generated looks for existing NPCs.
2. **Never** change the child base or the body list in a way that alters existing `BASES` frames.
3. New slots must be generated from their own stream (`OWN_STREAM` precedent) or not generated at all.
4. New species parts must carry `bodies: [...]` restricting them to their body, so human NPCs can
   never draw an orc tusk.
5. Any change to the look table must be checked by regenerating a sample of existing people and
   diffing `lookCode` — this is the only reliable drift detector, and it should be a test (new work,
   R2-09 §4.10).
6. A whole-figure `look` string must exist in the baked catalog. The runtime's fallback is silent
   (`personLook` → villager), so content validation must reject unknown keys at compile time; relying
   on the runtime fallback hides errors as "everyone looks like a villager".

---

## 6. Corrections to Report 07, section by section

| Report 07 | Corrected |
|---|---|
| §1 "Tier 4 … lowest-effort path … should be the default for any creature that does not have an upright biped skeleton" | Class C is the *only* path for non-bipeds, not the cheapest in general. It loses equipment, tags and restyle. "Default" is a design choice, not a mechanical consequence |
| §2.1 tier table | Replaced by §3 above (A/B/C by mechanism) |
| §2.3 "Add new body to `LOOK_BODIES`" as step 1 | Step 0 is the runtime: `BaseBody` union + `BASES` frames; content alone renders a man |
| §2.3 step 4 "Update `LOOK_SLOTS` if new slots are needed" | Also `PIECE_SLOTS`/`UNDER_HAIR` (sprite) and the portrait layer stack |
| §2.4 "A lizardfolk or dragon can use a sprite sheet … no equipment slots" | True only via a **baked catalog** entry; arbitrary sheet files are not supported, and an unknown key silently degrades to a villager look |
| §2 estimates (1–2 days; 1 week; 2–3 weeks) | Withdrawn. Asset-unit counts in §4; no calibrated time estimate exists |
| §5 "non-humanoids use the existing whole-sheet mechanism, which is the lowest-effort path" | Withdrawn for the reasons above |
| §1 "Corvus's `portraitPath` maps to a free-file reference" | Not adopted: the collapsed pipeline has one image source per look. An external portrait path would be a second source of truth, which is exactly what `docs/looks.md` exists to prevent |

---

## 7. What may and may not be claimed after this revision

**May be claimed (source-verified):** the look contract, the four bodies, twelve slots, the worn
slots, the sprite geometry, the portrait layer stack, the seeded generator and its stream discipline,
the catalog indirection for whole figures, and the code-level cost of adding a body or a slot.

**May not be claimed:** that any specific species renders correctly, that any new part looks right,
that a new body fits the existing equipment or animation, or that art production takes a given number
of days. None of that was executed or viewed. Those are gates, not facts (R2-09 §4.10).
