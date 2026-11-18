# LoreMaster Product Identity and Interface Blueprint

Source-backed blueprint for review before any Phase 1 implementation.

**Status of this document:** draft for review. It audits the actual LoreMaster workspace at `C:\Dev\Loremaster` and uses the cloned Dreamville-External repo at `C:\Dev\dreamville-inspect` only as an architectural reference. It does not implement anything yet, does not duplicate systems, and does not remove working OpenWorld functionality.

**Repository identity (verified):** root `C:\Dev\Loremaster`, remotes `origin`/`loremaster` both `https://github.com/HeWhoArose/Loremaster.git`, branch `master`, HEAD `843747cfcb48ffa3568c309ca55e66518641d176`. Clean except `?? nah_italic_report.json`.

**LoreMaster is the OpenWorld monorepo, rebranded:** the codebase is a monorepo of workspaces `packages/*` and `games/*/*`. The existing runtime is `@openworld/runtime`, the engine is `@openworld/engine`, and the existing game is `games/openworld`. The product name here is **LoreMaster**, and the blueprint treats LoreMaster as the application layer on top of the existing OpenWorld engine and OpenWorld pixel-game client. The engine-side dependency rule is already enforced and tested: `packages/engine/test/boundaries.test.ts` asserts engine imports no game, games import packages, and no game imports another. An earlier fix added `narration: ['@openworld/engine']` to `MAY_IMPORT`; verify it is still present before any further boundary work.

**Dreamville reference clone:** `C:\Dev\dreamville-inspect` (depth-1). Inspect its image/character/identity services as contracts and design references only. Do not import its code into LoreMaster. Do not adopt its CharacterGenesis UI as the visual character creator. Do not assume it already supports act-level artwork slots.

---

## 0. Audited source anchors

These are the files actually read to write this blueprint. Treat them as the source of truth for each claim below, not filenames in isolation.

### LoreMaster (actual workspace)
- `README.md`, `CLAUDE.md` — project identity, package layout, dependency direction, working agreements.
- `docs/ui.md` — shared DOM component workshop, component contracts, typography/size rules, existing creator and cover composition (`creator.css`, `cover.css`).
- `docs/design.md` — locked design decisions, event model, the AI interface being the outcome of an event, root defaults.
- `docs/world-model.md` — agreed world model v4 (not yet built); considered when discussing future engine capabilities.
- `docs/character-art.md` — portraits and event CG direction.
- `docs/looks.md` — look = one record → sprite + portrait + tags/words.
- `docs/quests.md` — quest/story model, news, Story Manager, journal/tracker/markers.
- `packages/runtime/src/game.ts` — `ClientGame`, `CoverDef`, `ClientGame.looks`; `useGame()` handover; runtime imports no game.
- `packages/runtime/src/ui/cover.ts` — existing title screen: world-behind title, companion, continue/new/load/settings, new-game two-step flow (look then journey), save-slot pick/load/export/import/delete, settings/language/sound/filter/keys/AI/credits.
- `packages/runtime/src/saves.ts` — 3 browser save slots (IndexedDB), summaries, export/import, open-question settlement on load.
- `packages/runtime/src/ui/creator.ts` — existing pixel-art character creator: appearance/clothing/palette tabs, bodies/parts/colors, moods, bust + walking sprite preview, own-look persistence, part/body compatibility enforcement.
- `packages/engine/src/story.ts` — story script: steps with triggers, scenes vs beats, effects write only the story, scene commands.
- `packages/engine/src/looks.ts` — `lookTags`, `wornLook`, `lookCode`, `lookWords`, `restyled`; pure data, no pictures.
- `packages/engine/src/types.ts` — `Entity.look` is `string | Look`; `Look` = body + parts + colors; `Ontology.looks`; `PixelArt` for learned types.
- `packages/engine/test/boundaries.test.ts` — dependency-boundary enforcement (and the earlier fix location).
- `games/openworld/content/src/game.ts` — `GAME: GameDef`: ontology + rules + terrainChars + `upgradeSave` + probes; content imports engine, engine imports nothing from game.
- `games/openworld/content/src/looks.ts` — actual look table: 4 bodies (`woman/man/girl/boy`), 12 slots, parts, named colors, `generateLook`, `PLAYER_LOOK`; **no species/race/ancestry field**; worn pieces fill `armour`/`cloak` via item `look` prop.
- `games/openworld/client/src/game.ts` — `CLIENT_GAME: ClientGame`: catalog, panels, looks, cover scenes (six Holy City showcase places), cover title `"OpenWorld"`, tutorial + creative-workshop starts, world filter (sepia ink/cream paper), texts, dev shortcuts (chapter/part/open triggers), summon, upgrade/fresh.
- `capacitor.config.ts`, `android/app/src/main/assets/capacitor.config.json` — `webDir: 'games/openworld/client/dist'`; Android build inputs verified; prior `android-build.log` = `BUILD SUCCESSFUL in 9m 6s`, `EXIT:0`.
- `playwright.config.ts`, `tests/ui/game.spec.ts`, `tests/ui/creator.spec.ts` — browser test infrastructure (Chromium, `baseURL http://127.0.0.1:5173`, `webServer` runs `npm run dev:client -- --host 127.0.0.1`, waits for `/ui-lab.html`).

### Dreamville-External (reference only)
- `src/data/imageAssetSpecs.ts` — image slot types/specs/normalization: `world_cover`, `story_run_cover`, `character_portrait`, `npc_portrait`, `equipment`, `item`, `skill_icon`, `spell_icon`, `creature`, `location`, `scene`; `compileProviderNeutralPrompt`, `appendImageOutputSpecification`.
- `src/components/common/imageAssetTypes.ts` — `ImageAssetSlotType`, `ImageAssetMeta`, `compileProviderNeutralPrompt` by slot type.
- `server/services/characterGenesisService.ts` — structured character extraction from natural language: identity/appearance/personality/background/role/motivations/relationships/condition/attributes/stats/capabilities/skills/feats/equipment/startingLocation/portraitAsset; field locks/userEditedFields; `AI_UNAVAILABLE` with explicit deterministic-confirmation gating.
- `server/services/worldVisualIdentityService.ts` — `buildWorldIdentity` (world_cover inputs) and `buildStoryRunIdentity` (story_run_cover inputs) from a `WorldTemplate`.
- `server/services/comicSceneGenerator.ts` — single-moment comic scene prompt contract (current-turn visual moment only), not an act-cover generator.
- `server/domain/characterProgressionEngine.ts` — progression with `SPECIES` module type, `SELECT_SPECIES`, species as a progression module concept; reference for species-as-module, not a LoreMaster implementation.
- `src/utils/imageAssetNormalizer.ts` — asset normalization helpers.

---

## 1. Opening experience and branding

**Decision:** separate the application interface from the actual game renderer.

### 1.1 Application interface — modern, cinematic, non-pixel
- Branding, logo, title treatment, typography, and opening motion belong to the application shell.
- The shell uses modern icons and typography (the UI docs already describe a shared component theme with tokens/components/layout layers and a 12×12 pixel icon grid for shared icons; for the application shell, prefer a modern icon set and a clean typeface for the title/nav, while the runtime's game UI keeps Fusion Pixel for in-game HUD text).
- The opening experience is a first-run/world-select/featured-story shell, not the existing OpenWorld title screen. The existing `Cover` class in `packages/runtime/src/ui/cover.ts` is the **game's title screen** (world-behind title, companion, continue/new/load/settings). It remains the entrypoint into the pixel game. The new LoreMaster shell sits **above** it for the application experience.

### 1.2 Actual game — retain OpenWorld's pixel-art renderer
- Keep OpenWorld's pixel-art world renderer (`packages/runtime` rendering pipeline: Phaser 4 + DOM HUD; snapshot rendering via `render/scene.ts`, depth, pieces, world filter).
- Keep pixel-art playable characters, NPCs, monsters, environmental objects.
- Keep pixel icons where they represent actual in-game objects (item icons, equipment, skills — the existing tooltip/item-icon system in `client/src/ui/tooltip.ts` and `itemTips.ts`).
- Do not replace the underlying game renderer or the pixel character creator.

### 1.3 Branding implementation anchor
- Rename/brand at the application shell level. At minimum, the shell owns:
  - app name/logo/title treatment,
  - a curated opening sequence (branding frame → world selection / featured story),
  - navigation chrome (home, library, discover, settings),
  - the visual language for story cards, covers, and world identity.
- The game's own title screen (`Cover`) remains the game's branded entry; do not merge the two title experiences. The shell's "play" action enters the game's title screen or directly starts a slot per the existing `CoverHandlers.start` contract.

**Audit result:**
- Already in LoreMaster: runtime entry + `Cover` title screen + settings/language/sound/AI panels.
- Reusable from Dreamville as design reference: `worldVisualIdentityService.ts` world identity concept; image slot contracts.
- Missing: application shell branding, modern iconography, opening motion, app-level navigation.

---

## 2. Story-centred home screen

**Decision:** one large featured/continuable story, smaller story cards below it, a Discover New Worlds section beneath the stories, and settings/other app navigation.

### 2.1 Layout
1. Featured/continuable story (large).
2. Smaller story cards (progress).
3. Discover New Worlds (future-facing; not an elaborate marketplace yet).
4. Settings and app navigation.

### 2.2 Featured story card
Must display:
- main illustrated cover,
- title,
- current act,
- last-played information,
- Resume Story action.

Last-played information already exists in LoreMaster in the form of save summaries. `packages/runtime/src/saves.ts` stores `SlotData.summary?: SaveSummary` and the cover's `line(s)` in `cover.ts` renders `map · day n · time · Lv n · objective/quest`. So the "last played" problem is largely solved at the save level; what is missing is the **application shell's** mapping of a story → its save slot(s) → its current act/scene → its cover artwork.

Current act information is available from the story system: the story in `packages/engine/src/story.ts` tracks the running scene (`w.scene`) and steps; the engine exposes the story's state; the save summary currently shows `map`, `day`, `hour`, `level`, `objective`, `quest`. To show "current act" in the shell, the app needs a story → act mapping that the shell can read without loading the full game world. That is a new, small contract (see §4 and §13).

### 2.3 Smaller story cards
- Show respective cover artwork and progress.
- Progress can reuse existing save summaries (last saved map/day/time/level/objective) once the shell can associate a story with slot metadata.

**Audit result:**
- Already in LoreMaster: save summaries, cover/title flow, "continue latest slot" logic (`Cover.latest()`), save pick/load/export/import/delete.
- Reusable from Dreamville as design reference: story-run identity concept (`buildStoryRunIdentity`), cover art contracts (`story_run_cover` slot spec).
- Partial: save summaries give "last played" data; "current act" needs a small story→act metadata contract.
- Missing: application home screen shell, featured-story resume action that maps to an existing slot, story card composition in the app chrome.

---

## 3. Story library and save/resume

**Decision:** the library is the application's view of stories and saves; resume reuses the existing save system.

### 3.1 Existing persistence
- 3 browser save slots per world, IndexedDB, via `packages/runtime/src/saves.ts`: `readSlot`/`writeSlot`/`deleteSlot`/`listSlots`/`exportSlot`/`pickSaveFile`.
- Each slot has `SlotData { save: SaveData; summary?: SaveSummary; savedAt }`.
- Open-question settlement on load: `settleOpenQuestions` runs the defaults of questions that were open when the save was made.
- Export/import as `.json` files with format `openworld-save`.

### 3.2 Resume contract
- The existing `CoverHandlers.start(slot, data, game?)` already starts a slot from its save or a new game in it.
- Resume in the shell = find the slot for a story, show its summary, and call the same start contract. This avoids duplicating save handling.

### 3.3 Library model
- A story library entry should link: story id, human title, world id, cover art asset, current act id/label (from a small metadata contract), last-saved slot info (or "not started"), and an optional resume action.
- This is application metadata; it should not duplicate save data. It should reference slots and read summaries.

**Audit result:**
- Already in LoreMaster: full save lifecycle (3 slots, summaries, export/import, open-question settlement), cover continue/load flow.
- Reusable from Dreamville as design reference: story-run identity for cover metadata; nothing else needed from it for save/resume.
- Missing: application story library view, story→slot association, resume action from the shell, current-act display.

---

## 4. Story and act artwork

**Decision:** one main cover per story, separate generated artwork per act; the story cover stays consistent with the world identity; act artwork reflects the events/locations/characters of that act.

### 4.1 What Dreamville actually has
From `src/data/imageAssetSpecs.ts` and `src/components/common/imageAssetTypes.ts`:
- `world_cover` (4:3, 1200×900, cover fit) — world identity poster.
- `story_run_cover` (16:9, 1280×720, cover fit) — story adventure poster.
- `character_portrait`, `npc_portrait`, `creature`, `location`, `scene`, `equipment`, `item`, `skill_icon`, `spell_icon`.

From `server/services/worldVisualIdentityService.ts`:
- `buildWorldIdentity(world)` compiles the inputs for a world_cover-style identity (title, summary/setting/environment, genre/tone/era, factions, magic/technology, geography, visual motifs).
- `buildStoryRunIdentity(run, world)` compiles story_run_cover inputs (story title, adventure context: starting location, protagonist, immediate situation; plus the world identity).

From `server/services/comicSceneGenerator.ts`:
- This is a **single current-turn visual moment** generator (comic scene), not an act-cover generator. It explicitly resets per image and forbids previous/future/recap panels.

### 4.2 Act covers are not confirmed in Dreamville
- Dreamville has `world_cover` and `story_run_cover` slots. It does **not** have a confirmed `act_cover` slot type in the inspected `imageAssetSpecs.ts`.
- Dreamville's comic scene generator is about current-turn panels, not act posters.
- Therefore: do not assume Dreamville already supports act covers. Treat act artwork as a new slot/contract that extends the existing image-asset idea.

### 4.3 The smallest correct extension for act-specific artwork
Propose a new image-asset slot type **act_cover** (or reuse `scene`/`location` semantics with an act-specific metadata wrapper), defined by:
- slot type id: `act_cover`,
- aspect ratio: choose to match story-run cover or a distinct act poster ratio (recommend matching `story_run_cover`'s 16:9 for consistency, or a 4:3 act poster if vertical act scroll is desired; pick one and keep it consistent),
- inputs (metadata): act id, act title/label, story id, world identity (reuse world identity so act art stays consistent with the world), key events/locations/characters of that act, mood/tone, composition hint, and a "do not invent future/past events" constraint modeled on the comic-scene generator's single-moment discipline.

Reuse Dreamville's contracts:
- reuse `appendImageOutputSpecification` / `compileProviderNeutralPrompt` style prompt building for the new slot,
- reuse the world identity service's world-level fields so act covers inherit world identity,
- reuse the "current subject only, no recap/future invention" discipline from `comicSceneGenerator.ts` to keep act art focused on that act's content.

Do **not** duplicate image-generation systems. The point is to add one slot type and one metadata wrapper, reusing the existing prompt-building/normalization approach.

### 4.4 Story cover vs world identity
- Story cover should stay consistent with the world identity. The cleanest model: a story's cover is generated from a story-run identity that includes the world identity (as `buildStoryRunIdentity` already does), so the story cover and world cover share visual language without being the same image.
- Act covers are a further refinement: each act gets its own generated image using the same world identity plus act-specific subject matter.

### 4.5 How this connects to LoreMaster's actual data
- LoreMaster's story is in `packages/engine/src/story.ts`: one script of steps, scenes vs beats, steps with triggers, scene commands. Steps can have `say`, `hint`, `card`, `picture`, `move`, `fact`, `topic`, etc.
- The current story/act structure in LoreMaster is **step-based**, not a separate "act" entity. To display "current act" and generate act artwork, the app needs an explicit **act grouping** of steps (a small metadata layer: story → ordered acts, each act = a named subset/range of steps or a named milestone). This is the same small contract needed for "current act" in §2.
- Do not reshape the engine story script for this. Add act grouping as application-facing metadata (and/or content metadata) that maps story id → acts → step ranges/milestones. The engine already knows which step/scene is running; the app maps that to an act label.

### 4.6 Asset handling reuse
- Reuse Dreamville-style image slot specs for cover/act art generation contracts.
- In LoreMaster, the generated images are application assets (shell cover artwork), not in-game sprites. Keep a clean separation: in-game art stays pixel; shell cover art is modern generated/postered artwork.
- Avoid duplicate generation pipelines: one image-generation contract family (world_cover, story_run_cover, act_cover, portraits, etc.) with slot-specific specs and prompt builders.

**Audit result:**
- Already in LoreMaster: story script (steps/scenes/beats), step `picture`/`card` commands, scene art pipeline for CGs (docs/character-art.md), look→portrait pipeline.
- Reusable from Dreamville as design reference: world_cover/story_run_cover slot specs, `worldVisualIdentityService` identity contracts, `compileProviderNeutralPrompt`/`appendImageOutputSpecification` prompt building, single-moment discipline from `comicSceneGenerator.ts`.
- Partial: world and story identity concepts exist in Dreamville; LoreMaster has world identity implicitly (world filter, cover scenes, showcase places) but no formal world_cover/story_run_cover generation pipeline today.
- Missing in Dreamville: confirmed act_cover slot — so LoreMaster should propose the smallest correct extension rather than assume it exists.
- Requires new assets: generated cover/act artwork pipeline + assets.
- Requires new (small) engine/content metadata: story→act grouping so "current act" and act art targets are well-defined.

---

## 5. Discover New Worlds

**Decision:** future-facing section; curated worlds with individual identities, cover artwork, and descriptions; do not build an elaborate world marketplace yet.

### 5.1 What "world" means here
- A LoreMaster world is an OpenWorld game project (a `GameDef` + content + assets + generated world files). OpenWorld already supports multiple worlds via bundle URL (`?game=<url>`, `npm run play`, `npm run editor` opens projects). `ClientGame.cover` already has scenes, title, companion, world filter.
- Dreamville's `worldVisualIdentityService.buildWorldIdentity` shows one clean way to derive a world identity poster contract from world metadata (title, summary, setting, environment, genre/tone/era, factions, magic/technology, geography, visual motifs).

### 5.2 Phase-0 Discover section
- A curated, hand-maintained list of worlds: world id, title, identity summary, cover artwork, short description, and a "play" action.
- Not a marketplace: no ratings, no user-generated storefront, no purchase flow, no search/recommendation engine yet.
- The section can be sparse initially: a few featured worlds with cover art and descriptions, plus a future-facing placeholder for "more worlds coming."

### 5.3 World selection → character creation → play
- The intended flow: choose a world → create/select a character → enter the game.
- This flow should eventually be the application shell's primary onboarding. For now, it can begin as a small curated world list that hands off to the existing new-game flow (look creation then journey/save slot).

### 5.4 Future world creation
- Future world creation is a larger topic (authoring, world identity, generated covers, species/look compatibility, quests/story). Mark it as future; do not build a full world-creator UI in Phase 1.
- When world creation is built, reuse the same world identity contract used for Discover cover artwork so created worlds get consistent cover art.

**Audit result:**
- Already in LoreMaster: multi-world support via bundle URL + `ClientGame` per game; cover/title/scenes/world filter per game; editor opens projects.
- Reusable from Dreamville as design reference: world identity contract (`buildWorldIdentity`), world_cover slot spec.
- Partial: world identity exists implicitly but not as a formal "world identity poster" contract in LoreMaster.
- Missing: curated Discover section, world identity poster generation, future world creation UI (future).

---

## 6. Existing OpenWorld character creator and AI-assisted appearance selection

**Decision:** RETAIN OpenWorld's existing visual character creator. Do NOT replace it with Dreamville's CharacterGenesis UI. Use Dreamville's CharacterGenesisService only to inform AI interpretation/structured generation that feeds the existing creator.

### 6.1 The existing creator (retained)
- `packages/runtime/src/ui/creator.ts`: appearance/clothing/palette tabs, bodies/parts/colors, moods, bust + walking sprite preview, random, words the world will use for the look.
- `packages/runtime/src/game.ts` hands the look table via `ClientGame.looks { table, slots, worn, bodies, colors, parts, player, generate, describe }`.
- `games/openworld/content/src/looks.ts`: the actual look table (4 bodies, 12 slots, parts, named colors, `generateLook`, `PLAYER_LOOK`).
- The creator enforces part/body compatibility (`Creator.set` drops parts that do not fit the new body; `options(slot)` filters parts by body).
- Worn pieces (`armour`/`cloak`) are filled by items via `wornLook`, not by the creator directly.
- The new-game flow in `cover.ts` is already a two-step creator-then-journey flow (look step then journey step), with difficulty and save-slot selection.

### 6.2 The intended AI-assisted workflow
1. Player chooses a world.
2. Player describes their character naturally.
3. AI interprets the description and derives identity, species, physical appearance, personality, background, and other relevant information.
4. AI selects compatible appearance options in the existing visual character creator.
5. Player sees the resulting character preview (in the existing creator).
6. Player can directly edit appearance, clothing, colours, and other supported features.
7. Player approves the character.
8. Approved appearance is mapped to the actual playable pixel-art character.

### 6.3 What "AI selects compatible appearance options" means in practice
The existing creator's data model is: `Look = { body, parts: Record<slot, partId|null>, colors: Record<colorKey, colorId> }`. A part may be body-restricted (`parts[id].bodies`) and color-key-restricted (`parts[id].colors`). The generator `generateLook(seed, who, given)` already accepts `given: LookPins { body?, parts?, colors? }` and fills the rest.

So the AI-assisted step should produce a **constrained partial look** (a `LookPins`-shaped structure) that the existing creator can render and the player can edit:
- `body` — mapped from the interpreted species/body type to one of the existing bodies (`woman/man/girl/boy`) when possible; if a species has no existing body mapping yet, fall back to the closest existing body and mark it as approximate (see §7).
- `parts` — select existing part ids per slot that fit the chosen body and the interpreted appearance (hair, face, beard, age, mark, glasses, hat, outfit, legs, shoes). Do not invent part ids; choose from `LOOK_PARTS`.
- `colors` — select existing color ids for the chosen parts, from `LOOK_COLORS`; `#rrggbb` is also a color too (the creator accepts hex as nearest named color).

The AI output is therefore a **look recommendation**, not a new creator. The existing creator renders it and the player edits it.

### 6.4 Do not overwrite player-edited fields
This is the key safety rule. Dreamville's `CharacterGenesisService.extractCharacterDraft` already models this with `userEditedFields` / `fieldLocks` and per-section provenance (`USER_EDITED` vs `AI_GENERATED` vs `DETERMINISTIC_FALLBACK` vs `SYSTEM_DERIVED`). Adopt the same discipline:
- Track which creator fields the player has edited.
- When the player asks the AI to reinterpret or refine, preserve the edited fields; only propose changes to fields the player has not explicitly edited.
- Show provenance/plain-language summary of what the AI changed and what it kept, so the player understands the recommendation.
- If AI is unavailable, gate deterministic fallback behind explicit player consent (as Dreamville does with `AI_UNAVAILABLE.requiresDeterministicConfirmation`). Do not silently fall back.

### 6.5 What the AI contributes vs what the existing creator contributes
- AI contributes: structured interpretation of the natural-language description, and a compatible partial look recommendation mapped to existing parts/colors/bodies.
- Existing creator contributes: the actual visual preview (bust + walking sprite), the full editable surface, the words the world will use, and the persistence of the final look.
- The final approved look is still a `Look` record stored as the player's look, exactly as today.

### 6.6 Where the AI interpretation layer would live
- It is an application-layer service (or an AI package service) that takes a natural-language description + world context and returns a structured character interpretation + a `LookPins`-compatible appearance recommendation.
- This is the part informed by Dreamville's `CharacterGenesisService` (extraction contract, field-lock discipline, provenance). It is **not** the Dreamville CharacterGenesis UI.
- It should be designed to feed the existing creator, not to bypass it.

**Audit result:**
- Already in LoreMaster: full visual character creator (see above), generate-look + describe-look, new-game two-step flow, look persistence.
- Reusable from Dreamville as design reference: `CharacterGenesisService` extraction contract, field-lock/provenance discipline, structured character sections; use it to inform AI interpretation only.
- Partial: natural-language → compatible-look recommendation is not built yet; no field-lock UI in the creator today.
- Missing: AI interpretation service wired to the existing creator, player field-lock/provenance UI, explicit AI-unavailable gating.
- Do not do: replace the creator with CharacterGenesis UI; invent new part ids from AI; overwrite player-edited fields.

---

## 7. Species diversity and visual compatibility

**Decision:** species must have a real compatibility profile (identity → visual features, sprite, animations, equipment, gameplay rules). Do not just add names to a dropdown.

### 7.1 What OpenWorld supports today (audited)
From `games/openworld/content/src/looks.ts`:
- 4 bodies: `woman`, `man`, `girl`, `boy`.
- Bodies carry: `name`, `sex` (female/male), `age` (adult/child), optional `tags` (e.g. `look:child`).
- 12 slots: `hair, face, beard, age, mark, glasses, hat, cloak, armour, outfit, legs, shoes`.
- Parts are body-restricted where relevant (`parts[id].bodies`), and worn-only parts exist (`gen.worn = true` for circlet, crown of thorns, breastplate, pauldrons — items bring these).
- Colors are named (hair/skin/eyes/cloth/leather/metal).
- `generateLook` seeds from a person id and weighs parts by sex/age/role.
- There is **no species/race/ancestry field** on a look or body today.

So today:
- "Species" is not a first-class field. The existing visual range is human-ish bodies with sex/age differentiation and a palette of parts/colors.
- Equipment/clothing works across bodies through slots; some parts are body-specific.
- Animations/sprites: the player figure is composed from the look (bases + outfit layers, `packages/runtime/src/assets/figure/`; `composeSprite`, portrait layers). The existing sprite system is built around the 4 bodies and the 16×16 composition pipeline.

### 7.2 What requires new visual assets
To support the requested species with real visual differentiation, some species will need new assets:
- sprite bases / body variants (e.g. shorter stockier build, taller slender build, non-human proportions, tails, horns, non-human facial structure),
- head/face parts that read as those species,
- species-differentiating parts (ears, horns, tails, scales, fur textures, skin color ranges beyond the current skin palette),
- equipment that fits those bodies/slots,
- possibly palette expansions for skin/fur/scales.

A compatibility profile per species should state:
- which existing bodies it maps to (or whether it needs a new body),
- which existing slots/parts are compatible,
- which parts are new,
- which color keys/range apply,
- which equipment slots/armour types fit,
- which animations (walk, combat poses, overlays) apply or need new rows,
- what gameplay rules attach (stat modifiers, abilities, vulnerabilities, equipment restrictions, world rules).

### 7.3 What can be achieved with existing assets now
With the existing 4 bodies and parts:
- You can represent human-ish characters with variety via parts/colors/moods.
- You can approximate some species by remapping a description to the closest existing body + evocative parts/colors, **but** that is an approximation, not true species support, and the blueprint should label it as such.
- The AI-assisted appearance step (§6) can initially map species descriptions to the closest existing body/parts/colors and clearly mark the mapping as approximate, so the player is not misled.

### 7.4 Species profile design (recommended)
Define a species compatibility profile as data, e.g.:
- `id`, `name` (text), `visualSummary`,
- `bodyMapping`: which existing body id(s) it currently maps to, and whether that is exact or approximate,
- `newBodyNeeded`: boolean + what differs,
- `compatibleSlots`: which look slots are available,
- `addedParts`: new part ids (if any) and their slot/body/colors,
- `colorKeys`: which color keys/range apply (skin/fur/scales, etc.),
- `equipmentCompatibility`: which armour/clothing/weapon slots and types fit,
- `animations`: which existing animation rows apply, what new rows are needed,
- `gameplay`: stat modifiers, abilities, vulnerabilities, equipment restrictions, world-rule hooks,
- `appearanceTags`: the `look:*`/identity tags this species implies (the engine already derives `look:*` tags from the look, so species tags can be expressed through the look where possible).

The engine already derives look tags from the look (`lookTags` in `packages/engine/src/looks.ts`). Species identity should connect to visual features through the look where possible, and to gameplay through ontology/rules/modules where needed — not through a free-text name only.

### 7.5 Dreamville references (use as concept, not implementation)
- `characterProgressionEngine.ts` models species as a `SPECIES` progression module with `SELECT_SPECIES` and speciesId. That is a reference for "species as a module with progression effects," which is one valid way to attach gameplay to species.
- `CharacterGenesisService` extracts `identity.species` from a natural-language concept. That is a reference for species inference at character creation time.
- Use these as conceptual references for how species can be a first-class module with identity + gameplay, not as a LoreMaster implementation to copy.

### 7.6 Phasing
- Phase 1-scope: define the species compatibility profile concept + data shape; map the requested species to what exists vs what needs new assets; mark approximate mappings explicitly; wire the AI appearance step to prefer compatible existing parts/colors when a species is approximate.
- Later: add new bodies/parts/palette rows for species that need them; connect species to gameplay through ontology/rules/modules; ensure visual + gameplay compatibility are both real.

**Audit result:**
- Already in LoreMaster: 4 bodies, 12 slots, parts, colors, generate/describe, worn-look, look-tag derivation.
- Reusable from Dreamville as design reference: species-as-module concept (`SPECIES`, `SELECT_SPECIES`); species extraction from natural language (`CharacterGenesisService.identity.species`).
- Partial: species diversity is not a first-class field today; existing assets cover human-ish variety well but not the full requested species range.
- Missing: species compatibility profile data shape; new body/part/palette rows for species that need them; gameplay hooks for species.
- Requires new assets: sprite bases/parts/palette/animations for species that cannot be approximated from existing bodies.
- Requires new engine capabilities: species as a compatible profile linking identity → visuals + gameplay (can begin as content data and grow into ontology/module hooks); act grouping for story/act art (related, see §4).

---

## 8. World selection and future world creation

**Decision:** world selection is the application shell's onboarding; future world creation is a larger later effort.

### 8.1 World selection (application shell)
- A curated world list (Discover or a dedicated world-select screen) lets the player pick a world.
- Picking a world should hand off to character creation (§6) and then to the game's new-game flow (existing look step + journey step + save slot + difficulty).
- World selection should display world identity (title, summary, cover art, description) using the same world identity contract as Discover.

### 8.2 Future world creation
- Out of scope for Phase 1 beyond noting the contract: a created world should produce a world identity (cover artwork, visual motifs, tone/setting), a story/act structure with act covers, and species/look compatibility.
- When built, reuse the same image-asset contracts (world_cover, story_run_cover, act_cover) and the same world identity service concept.
- Do not build a full world-creator authoring UI in Phase 1.

### 8.3 Relationship to existing OpenWorld authoring
- OpenWorld already has an editor (browser + desktop) that edits maps, characters, items, rules, story, quests. That is the engine-side authoring path.
- LoreMaster's "world creation" at the application level is about world identity + presentation + onboarding; it should not duplicate the editor's data authoring. Coordinate with the editor for content; the shell owns identity/presentation.

**Audit result:**
- Already in LoreMaster: multi-world support via bundle URL + per-game `ClientGame`; editor for content authoring; cover/title/scenes/world filter per game.
- Reusable from Dreamville as design reference: world identity contract, world_cover slot spec.
- Missing: curated world-selection UX, world identity poster generation, future world-creation shell (future).

---

## 9. Application navigation and settings

**Decision:** a modern application shell with navigation (home/library/discover/settings) separate from the game's in-game HUD and title screen.

### 9.1 Shell navigation
- Home (featured story + story cards + Discover + settings entry).
- Story library (all stories + save summaries + resume).
- Discover New Worlds (curated worlds).
- Settings (app-level + gateway to game settings).
- Possibly: character/profile view, cover art gallery, world identity view.

### 9.2 Settings
- Reuse the existing settings surface where it makes sense: the existing `Cover` settings panel already handles language, sound, world filter, keys, AI setting, credits.
- The application shell can carry its own app-level settings (branding, default world, shell appearance) and delegate to the game's settings when entering the game.
- Keep the two settings surfaces distinct: app shell settings vs game settings, both reachable but not merged.

### 9.3 Navigation vs in-game HUD
- The shell is the modern application navigation.
- The in-game HUD remains the existing OpenWorld HUD (clock, bars, toolbar, dialogue, panels, journal, map, etc. in `packages/runtime/src/ui/`).
- Do not move in-game HUD into the shell or vice versa. They are separate layers by design (§11).

**Audit result:**
- Already in LoreMaster: game settings (language/sound/filter/keys/AI/credits) and title menu (continue/new/load/settings); in-game HUD and panels.
- Reusable from Dreamville as design reference: shell navigation patterns (generic), nothing engine-specific.
- Missing: application shell navigation, app-level settings, shell→game handoff.

---

## 10. Boundaries between the modern application interface and pixel-art gameplay

**Decision:** two distinct layers, each with its own art language and responsibilities.

### 10.1 Layer A — modern application interface
- Branding, home, library, discover, world selection, character creation chrome, settings, story/act cover artwork, modern icons/typography.
- Art here is modern/cinematic/non-pixel: generated cover/act artwork, world identity posters, modern icons.
- This layer owns the application shell and its navigation.

### 10.2 Layer B — actual game renderer
- OpenWorld's pixel-art renderer and pixel characters/NPCs/monsters/objects.
- Pixel icons where they represent in-game objects.
- The game's own title screen (`Cover`) and in-game HUD.
- This layer is retained as-is.

### 10.3 Handoff points
- Shell "resume/play" → game's existing start contract (`CoverHandlers.start`), entering the game's title screen or starting a slot directly.
- Shell character creation → existing visual creator (`Creator`), with AI-assisted recommendation fed as a `LookPins`-compatible partial look.
- Shell world selection → game's `?game=<url>`/bundle + new-game flow.
- Shell cover/act artwork → application assets, not in-game sprites.

### 10.4 What must not blur
- Do not replace the game renderer with modern art.
- Do not turn in-game icons into modern icons where they denote in-game objects.
- Do not merge the shell title experience with the game's title screen.
- Do not let AI-authored appearance invent sprite data that the existing renderer cannot draw; AI recommends existing parts/colors/bodies (or clearly-flagged new ones).

**Audit result:**
- Already in LoreMaster: clear separation between runtime UI and engine, and between game client and engine; rendering pipeline and HUD are defined.
- Reusable from Dreamville as design reference: image slot contracts for shell artwork; single-moment discipline for generated art.
- Missing: explicit shell/game boundary documentation in the app (this blueprint section is part of that), shell→game handoff wiring.

---

## 11. Recommended implementation phases

These are recommended phases, not committed scope. Phase 1 is the smallest thing that establishes the shell + identity + one end-to-end story flow without touching the game renderer or creator.

### Phase 0 — review + contracts (this blueprint)
- Review this blueprint.
- Agree the slot/contract set: `world_cover`, `story_run_cover`, new `act_cover`, image prompt-building reuse.
- Agree the story→act metadata shape.
- Agree the species compatibility profile data shape.

### Phase 1 — application shell + identity + one story flow
- Build the application shell chrome (branding, navigation, modern icons/typography).
- Implement the home screen: featured story + smaller story cards + Discover (curated, sparse) + settings entry.
- Implement save-summary-based story library + resume action using the existing save/start contracts.
- Implement world identity + story cover artwork generation contract (reuse Dreamville-style slot specs and prompt building; add `act_cover` as the smallest correct extension).
- Implement the AI-assisted appearance step as a **recommendation fed to the existing creator**, with field-lock/provenance and AI-unavailable gating.
- Wire one end-to-end flow: choose world → describe character → AI recommendation → existing creator preview → approve → start game in a slot.
- Do not touch the game renderer, the pixel creator's core, or existing saves.

### Phase 2 — story/act artwork + current-act display
- Add story→act metadata and current-act display on the home/library.
- Generate act covers per act using the new slot + world identity.
- Populate the featured story with real cover + act art.

### Phase 3 — species compatibility + new assets (incremental)
- Define species compatibility profiles for the requested species.
- Add new bodies/parts/palette/animations only where approximation is not acceptable.
- Connect species to gameplay through ontology/rules/modules as needed, incrementally.
- Keep the AI appearance step mapping species → compatible existing/new parts with explicit approximate flags.

### Phase 4 — curated worlds + future world creation groundwork
- Grow Discover into a curated world list with identities + covers + descriptions.
- Lay groundwork for future world creation (world identity contract, cover/act art generation, species/look compatibility) without building a full world-creator UI yet.

### Phase 5 — polish + acceptance
- Acceptance tests (§14).
- Manual browser review of the shell + game handoff.

**Out of scope for this blueprint's phases:** replacing the pixel renderer, replacing the visual creator with CharacterGenesis UI, duplicating image-generation systems, removing working OpenWorld functionality, building an elaborate world marketplace.

---

## 12. File-level reuse and integration opportunities

### 12.1 LoreMaster files to reuse/extend
- `packages/runtime/src/ui/cover.ts` — keep as the game's title screen; study its panel pattern for the shell's panels. Do not convert it into the app shell.
- `packages/runtime/src/saves.ts` — reuse for save summaries, export/import, slot management, open-question settlement.
- `packages/runtime/src/ui/creator.ts` — retain and extend with field-lock/provenance + AI recommendation input; do not replace.
- `packages/runtime/src/game.ts` / `ClientGame.looks` — extend/reuse for look table access + generate/describe; already the contract for looks.
- `packages/runtime/src/ui/common.ts` + shared components (`packages/runtime/src/ui/components/index.ts`) — reuse for shell panels that need DOM components; shell can use the same component primitives.
- `packages/engine/src/story.ts` — source of truth for current step/scene; map to act labels via app metadata.
- `packages/engine/src/looks.ts` — `lookTags`, `wornLook`, `lookCode`, `lookWords`, `restyled`; reuse for look compatibility checks and words.
- `packages/engine/src/types.ts` — `Look`, `Entity.look`, `PixelArt`; reference for data contracts.
- `games/openworld/content/src/looks.ts` — the actual look table; the source for what parts/colors/bodies exist today.
- `games/openworld/client/src/game.ts` — `CLIENT_GAME` (cover, world filter, catalog, panels, looks, dev shortcuts); reference for per-game identity; the `?game=<url>`/bundle model is the existing multi-world path.
- `capacitor.config.ts` + `android/.../capacitor.config.json` — `webDir: 'games/openworld/client/dist'`; these stay; Android build inputs are verified.
- `docs/ui.md`, `docs/looks.md`, `docs/character-art.md`, `docs/quests.md` — design contracts to keep consistent.

### 12.2 Dreamville files to use as reference (not to copy)
- `src/data/imageAssetSpecs.ts` + `src/components/common/imageAssetTypes.ts` + `src/utils/imageAssetNormalizer.ts` — image slot specs, `ImageAssetMeta`, `compileProviderNeutralPrompt`, `appendImageOutputSpecification`. Reuse the **approach** (slot type + spec + prompt building + normalization), and add `act_cover`.
- `server/services/worldVisualIdentityService.ts` — `buildWorldIdentity` and `buildStoryRunIdentity` as reference contracts for world identity + story-run identity. Adapt the field set to LoreMaster's world/story model.
- `server/services/characterGenesisService.ts` — extraction contract + field-lock/provenance discipline + `AI_UNAVAILABLE` gating. Reference for the AI interpretation layer; do not use its UI.
- `server/domain/characterProgressionEngine.ts` — `SPECIES` module concept, `SELECT_SPECIES`. Reference for species-as-module gameplay, not for the visual creator.
- `server/services/comicSceneGenerator.ts` — single-moment discipline ("exact current visual moment only; no recap/future") as a guiding constraint for generated act/cover art. Not an act-cover generator itself.

### 12.3 What to avoid
- Do not import Dreamville modules into LoreMaster.
- Do not create a second character creator.
- Do not create a second image-generation pipeline; extend the one contract family.
- Do not duplicate save handling; reuse `saves.ts`.
- Do not duplicate the game renderer or HUD; reuse the existing runtime/engine/client.

---

## 13. Data contracts to define (small, explicit)

These are the new, small contracts this blueprint depends on. Define them before Phase 1 implementation.

### 13.1 Story metadata (application-facing)
- `StoryInfo`: `storyId`, `title` (text), `worldId`, `coverArtAsset`, `currentActId?` (from story→act mapping + current scene/step), `lastPlayed?` (from save summary), `slot?` (association), `resume()` action.
- Story→acts mapping: `storyId` → ordered list of `ActInfo { actId, label, stepRange/milestone, coverArtAsset? }`.
- Current act resolution: given the engine's current scene/step (from `story.ts` / world state), map to an `actId`/`label`. This can be a small content/app metadata lookup, not an engine change.

### 13.2 World identity
- `WorldIdentity`: `worldId`, `title`, `summary`, `setting`, `environment`, `genreTags`, `toneTags`, `era`, `factions`, `magicOrTechnology`, `geography`, `visualMotifs`, `coverArtAsset`.
- Derive from the world project's metadata (adapt `buildWorldIdentity`'s field set to LoreMaster's world model). Keep it as the source for world_cover artwork and for consistency with story/act covers.

### 13.3 Image-asset slot family
- Add `act_cover` to the existing slot family conceptually (spec: aspect ratio, fit mode, output mime/quality, safe margin, prompt building), reusing the Dreamville-style approach.
- Keep one prompt-building/normalization approach for `world_cover`, `story_run_cover`, `act_cover`, and any portrait/creature/location slots the shell may later use.

### 13.4 AI appearance recommendation
- `AppearanceRecommendation`: `body?` (existing body id, with exact/approximate flag), `parts` (`Record<slot, partId|null>` chosen from `LOOK_PARTS`), `colors` (`Record<colorKey, colorId>` from `LOOK_COLORS` or hex), `confidence/approximate flags`, `explanation`, `changedFields` vs `preservedFields`.
- Feed this into the existing creator as a `LookPins`-compatible input; the creator renders and the player edits; edited fields are tracked and preserved on later AI refinement.

### 13.5 Species compatibility profile
- `SpeciesProfile`: `id`, `name` (text), `visualSummary`, `bodyMapping` (existing body id(s) + exact/approximate), `newBodyNeeded`, `compatibleSlots`, `addedParts`, `colorKeys`, `equipmentCompatibility`, `animations`, `gameplay`, `appearanceTags`.
- Start as content data; grow into ontology/module hooks later.

---

## 14. Risks, dependencies, and acceptance tests

### 14.1 Risks
- **Assuming Dreamville has act covers.** It does not appear to, in the inspected slot set. Mitigate by defining `act_cover` explicitly rather than reusing a nonexistent slot.
- **Blurring the shell/game boundary.** Mitigate by keeping two layers explicit and reusing existing handoff contracts (`CoverHandlers.start`, creator, `?game=<url>`).
- **AI overwriting player edits.** Mitigate by adopting field-lock/provenance discipline from `CharacterGenesisService` and gating AI-unavailable fallback behind explicit consent.
- **Species treated as a name only.** Mitigate by requiring a compatibility profile (visual + gameplay) and marking approximate mappings explicitly until new assets exist.
- **Duplicate image-generation systems.** Mitigate by extending one slot-family contract and reusing Dreamville's prompt-building/normalization approach.
- **Duplicate character creator.** Mitigate by retaining the existing creator and feeding it a recommendation only.
- **Touching the engine/game renderer in Phase 1.** Mitigate by confining Phase 1 to the shell, identity, save-summary-based library, and AI recommendation → existing creator.

### 14.2 Dependencies
- **AI availability.** The AI-assisted appearance step depends on an AI service being available (or an explicit fallback path). Dreamville's `AI_UNAVAILABLE` gating is the right pattern.
- **Image generation.** Cover/act artwork depends on an image-generation capability (the contract can be defined first; the actual generator is a dependency).
- **Generate-world / world data.** The existing `npm run gen:world` and per-game world data remain relevant for the game side; the shell's world identity can be derived from world metadata.
- **Test infrastructure.** `npm run test:ui` is blocked here (Playwright Chromium not installed; `tests/ui` config is Chromium, `baseURL http://127.0.0.1:5173`, `webServer` runs `npm run dev:client -- --host 127.0.0.1` and waits for `/ui-lab.html`). Manual browser review is the feasible path for shell/game handoff review. Local Chrome exists at `C:\Program Files\Google\Chrome\Application\chrome.exe`; Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.

### 14.3 What to verify before Phase 1
- Re-confirm the Step-1 boundary fix is still present: `narration: ['@openworld/engine']` in `MAY_IMPORT` in `packages/engine/test/boundaries.test.ts` (verify via `git diff`/file read).
- Re-confirm `packages/engine/test/boundaries.test.ts` still enforces engine-import-no-game and no-game-imports-another.
- Re-confirm the existing creator's part/body compatibility behavior (`Creator.set`, `options`, `WORN_SLOTS`) is intact.
- Re-confirm the existing save/summary/load contract (`saves.ts`, `Cover.latest()`, `CoverHandlers.start`) is intact.

### 14.4 Acceptance tests (criteria, not scripts yet)
- **Shell branding + navigation:** the shell shows branding/logo, home navigation, and distinct modern chrome; the game's title screen and HUD remain pixel and unchanged.
- **Home screen:** featured story shows cover art, title, current act, last-played info, and a Resume action; smaller story cards show cover art + progress; Discover is present but sparse/future-facing.
- **Story library + resume:** library lists stories with summaries; resume starts the existing slot via the existing start contract; export/import still work.
- **Story/act artwork:** story cover is consistent with world identity; act covers exist per act and reflect act content; no duplicate generation pipeline.
- **Character creation:** the existing visual creator is retained and renders the AI recommendation; the player can edit; edited fields are preserved on refinement; AI-unavailable is gated behind explicit consent; final approved look is a real `Look` record.
- **Species:** species have a compatibility profile; approximate mappings are flagged; new-asset species are identified as requiring new assets; no species is "just a dropdown name."
- **World selection:** curated worlds show identity + cover + description; selecting a world hands off to character creation → game flow.
- **Boundary:** shell art is modern; in-game art and icons for in-game objects remain pixel; no cross-contamination.

---

## 15. Summary classification map

For each relevant feature, the classification requested in the audit:

| Feature | Classification |
|---|---|
| Application branding/opening/modern shell | Missing (LoreMaster); reusable from Dreamville as design reference only |
| Story-centred home (featured + cards + Discover + settings) | Missing (LoreMaster shell); save summaries exist |
| Featured story resume | Partial (save summaries + `CoverHandlers.start` exist); shell wiring missing |
| Story/act cover artwork | Partial (story script + CG pipeline exist); act_cover is a proposed new slot; Dreamville has world_cover/story_run_cover but not confirmed act_cover |
| Story library + save/resume | Partial (save system complete; library + current-act display missing) |
| Discover New Worlds | Missing (curated list); world identity concept reusable from Dreamville |
| Existing visual character creator | Already in LoreMaster (retain) |
| AI-assisted appearance selection | Missing; Dreamville `CharacterGenesisService` is reference for interpretation + field-lock discipline only |
| Species diversity + visual compatibility | Partial; no species field today; Dreamville species-as-module + species extraction are reference concepts |
| World selection / future world creation | Partial (multi-world via bundle URL + editor); curated selection + world identity poster missing; future creation is future |
| App navigation/settings | Partial (game settings exist); app shell navigation missing |
| Modern-app vs pixel-game boundary | Already structurally present; needs explicit shell/game handoff documentation + wiring |
| Implementation phases | Recommended here (Phase 0–5) |
| File-level reuse/integration | Listed in §12 |
| Risks/dependencies/acceptance tests | Listed in §14 |

---

## 16. Decisions reaffirmed

- **Retain** OpenWorld's pixel renderer, pixel characters/NPCs/monsters/objects, pixel icons for in-game objects; build a separate modern application interface on top.
- **Retain** the existing visual character creator; do not replace it with Dreamville's CharacterGenesis UI; use `CharacterGenesisService` only to inform AI interpretation/structured generation.
- **Do not assume** Dreamville supports act covers; propose the smallest correct extension (`act_cover`) and reuse its image contracts/prompt-building approach.
- **Do not duplicate** image-generation systems or the character creator or save handling.
- **Do not remove** working OpenWorld functionality.
- **Species** get a real compatibility profile (identity → visual features, sprite, animations, equipment, gameplay rules); not just dropdown names.

---

End of blueprint. Review before any Phase 1 implementation.

---

# Master Roadmap Integration

## 15. Master Development Roadmap and Freebuff Execution Mission

This document is both the detailed product identity/interface specification and the governing product-direction brief for the next stages of LoreMaster. The roadmap below expands the interface blueprint into the complete product programme. It does not replace the source-backed findings or decisions in earlier sections.

### 15.1 Product vision and non-negotiable architecture

LoreMaster is a story-centred, AI-assisted open-world RPG. It combines a modern, cinematic application experience with the retained OpenWorld pixel-art gameplay world.

The intended product journey is:

1. LoreMaster-branded opening experience.
2. LoreMaster home screen.
3. Story library, featured/resumable story, or world selection.
4. Character creation when starting a new adventure.
5. Gameplay inside the selected world.

The application shell and gameplay presentation are distinct visual layers:

- **Application layer:** LoreMaster branding, home, story cards, cover artwork, library, discovery, navigation, settings and world selection. Use a modern non-pixel visual language.
- **Gameplay layer:** retain the OpenWorld renderer and pixel-art characters, NPCs, monsters, environments, world objects and in-game object icons. Redesign surrounding interface elements in LoreMaster's visual language without replacing the renderer.

OpenWorld remains authoritative for simulation and gameplay state. The narrative system may interpret player intent, propose actions and describe outcomes, but it must not independently invent or apply world-state changes. Use one canonical action/narrative pipeline and one canonical dialogue result; separate UI panels must display the same canonical content rather than independently generating variations.

Reuse existing systems before creating replacements. Do not create a second home experience, save system, character creator, narrative engine or parallel gameplay runtime. Preserve web and Android targets, offline-first core gameplay and BYOK-only AI access. Do not introduce a mandatory hosted AI service or owner-managed API keys.

### 15.2 Master implementation phases

The phases below are the authoritative proposed order. A phase may be split into smaller tracked tasks, but its dependencies and acceptance criteria must remain visible. Research and non-invasive audits may run in parallel where they do not disrupt the active implementation phase.

#### Phase 0 — Audit, verification and project governance

**Objectives**
- Establish the actual repository/workspace, branch, commit and working-tree state before making changes.
- Reconcile existing project documentation and known audit findings.
- Verify the current state of the engine, client, runtime, narration, saves, creator, world content, tests and Android configuration.
- Establish one authoritative roadmap and progress tracker.

**Acceptance criteria**
- Repository identity and branch are recorded from actual Git evidence.
- Existing functionality is classified as verified, partial, planned, blocked or unknown.
- Known test failures and environmental blockers are explicitly recorded; no suite is described as passing without a completed run and exit status.
- Existing documents are reused where appropriate; conflicting or duplicate plans are identified and resolved.
- The product identity blueprint remains intact and is referenced by the master plan.

#### Phase 1 — LoreMaster identity and application foundation

**Objectives**
- Establish the LoreMaster logo, brand identity, opening experience and modern application design system.
- Create the application shell that hosts the home screen, library, discovery, settings and world/story entry flows.
- Remove the old OpenWorld-branded title screen from the normal user-facing launch journey.

**Important implementation constraint**
The existing OpenWorld Cover implementation may contain reusable start-game, save selection, loading, settings or other runtime logic. Inspect and preserve those contracts. Do not simply delete the Cover system or bypass required initialization. Determine the safest handoff from the LoreMaster shell into the existing game-start/runtime flow.

**Acceptance criteria**
- Fresh launch presents LoreMaster branding, not the old OpenWorld title screen.
- The home experience is the default application landing page.
- Existing save/start functionality remains operational through the new entry flow.
- No duplicate game-start or save-management implementation is introduced.
- Web and Android shell behaviour is verified.

#### Phase 2 — Story-centred home, library and navigation

**Objectives**
- Implement one large featured or resumable story card.
- Show smaller story cards beneath/alongside it as appropriate.
- Display a main cover for each story and separate artwork for each act.
- Provide story progress, current act and resume functionality.
- Provide a story library, Discover New Worlds section, application navigation and settings.
- Reuse the existing save system and existing DreamVille image identity/prompt-contract patterns where appropriate.

**Artwork and data constraints**
- Preserve the distinction between a world, a story/run and its acts.
- DreamVille's inspected image contracts include `world_cover` and `story_run_cover`; do not claim that `act_cover` already exists.
- Define an explicit story-to-act relationship sufficient to identify the current act and its artwork target.
- Add the smallest appropriate act-art contract extension within the existing image-contract family. Do not build a parallel image-generation system.
- Generated artwork must represent the correct current story/act and must not invent future events or recap details as if they were current.

**Acceptance criteria**
- A player can distinguish featured, resumable and new stories.
- Existing saves are discoverable and resumable without data loss.
- Story and act artwork targets are unambiguous.
- Discover can initially be a curated placeholder/library surface; a full marketplace is not required in this phase.

#### Phase 3 — External asset discovery and LoreMaster asset catalogue

**Objectives**
Research and catalogue existing lawful assets before commissioning or generating large quantities of replacements. Candidate discovery sources may include Kenney, OpenGameArt, itch.io asset collections, Game-icons.net, Ninja Adventure, FreePixel.Art and relevant GitHub repositories. These are research leads, not automatic licence approval.

**Catalogue categories**
- Player characters, NPCs and portraits.
- Species, animals, monsters and bosses.
- Weapons, armour, clothing and equipment.
- Powers, spells, skills and projectiles.
- Visual effects, animations and particles.
- Maps, tilesets, buildings, locations and environmental props.
- UI icons and gameplay icons.
- World, story and act artwork.
- Audio and environmental sound.

**Required metadata for every candidate**
- Source URL and repository/package identity.
- Creator/author where available.
- Exact licence and version, plus a copy/link to the licence terms.
- Attribution requirements.
- Commercial-use permission.
- Modification, redistribution and bundling permissions.
- File formats, dimensions, animation frames, directions and dependencies.
- Renderer/engine compatibility and required conversion/import work.
- Category, tags and intended use.
- Review status and any restrictions.

Do not infer commercial permission from free download availability. Flag unclear, conflicting or missing licences for human review. Do not import assets with unacceptable or unknown usage rights into distributable builds.

**Acceptance criteria**
- A searchable, maintainable asset catalogue exists.
- Candidate assets are classified by licence and technical compatibility.
- The first import shortlist prioritises assets needed by the gladiator demonstration world.
- Imported assets retain provenance and licence records.
- No unnecessary duplicate asset-management subsystem is created.

#### Phase 4 — Character creation and species diversity

**Objectives**
- Retain and extend the existing OpenWorld visual character creator.
- Add a natural-language description step that recommends a compatible appearance using existing creator capabilities.
- Let the player inspect and directly edit the recommendation before confirming.
- Expand species diversity through explicit compatibility profiles rather than labels alone.

**Character flow**
1. Player describes the character in natural language.
2. AI extracts structured, reviewable character traits.
3. The recommendation is mapped to supported species and appearance options.
4. The existing OpenWorld creator renders the recommendation.
5. The player can change appearance choices directly.
6. Only the player's confirmed character is committed to the game.

DreamVille's character extraction, field-lock and provenance patterns may inform this flow, but do not replace the OpenWorld creator with a second creator.

**Species profile considerations**
- Identity and world availability.
- Body and part compatibility.
- Visible features and palettes.
- Sprite assets and directional animations.
- Equipment compatibility.
- Gameplay attributes and abilities.
- Any world-specific rules or limitations.
- Missing-asset and approximation status.

The inspected OpenWorld look table was reported to have four body definitions and twelve appearance slots, with no first-class species field. Re-check the current source before implementation; do not treat that historical observation as proof of the current branch state. Do not claim a species is fully supported until both its visual representation and gameplay compatibility have been tested.

**Acceptance criteria**
- Existing creator workflows still function.
- AI recommendations use only verified compatible options or are clearly marked as approximations.
- Players can edit recommendations before confirmation.
- Species data does not silently bypass body, part, equipment or animation constraints.
- Unsupported species are not presented as complete.

#### Phase 5 — Gladiator demonstration world

**Purpose**
Build the first controlled LoreMaster adventure as an integration test of the actual RPG systems, not as a disconnected demo or throwaway engine.

**Premise**
The player is a gladiator waiting for their turn to fight. The story begins in a waiting area with other fighters and develops through preparation, NPC interactions, training, arena entry, fights and consequences.

**Candidate locations and content**
- Waiting room and fighter quarters.
- Other fighters and rivals.
- Guards, trainers and medical personnel.
- Beds and resting areas.
- Training area and practice equipment.
- Weapons, armour and consumables.
- Arena entrance and main fighting arena.
- Spectators and relevant event locations.

**Gameplay coverage**
- Natural-language movement and movement toward named characters.
- NPC selection, conversation and dialogue.
- Object interaction, including using a bed to sleep/rest.
- Training and equipment changes.
- Inventory and item use.
- Combat, damage, healing and consequences.
- Location transitions and event triggers.
- Story/act progression.
- Save and resume across meaningful points.

**Acceptance criteria**
- The adventure uses the real OpenWorld simulation and LoreMaster narrative pipeline.
- NPCs and objects have actual engine entities and valid interaction rules.
- Story events follow authoritative game outcomes.
- A player can complete a representative loop from introduction through arena encounter and subsequent consequence.
- Save/resume restores the correct world and story state.

#### Phase 6 — Gameplay interface redesign

**Objectives**
Modernise the interface surrounding the pixel-art game while preserving the renderer and in-world art style.

Review and redesign as appropriate:
- HUD and status display.
- Story/narration panel.
- Dedicated NPC dialogue and identity area.
- Player action input.
- NPC selection and information.
- Inventory and equipment.
- Character sheet.
- Skills and abilities.
- Quests and journal.
- Map.
- Pause and settings interfaces.

**Canonical presentation rules**
- NPC dialogue in the dedicated dialogue area and chronological narrative history must come from the same canonical dialogue result.
- Player speech must be represented consistently in the world and in the narrative history.
- UI components consume authoritative turn results; they must not call separate AI generation paths for the same event.
- Pixel art remains appropriate for in-world entities and gameplay object icons. The application shell, branding, story covers and general application UI should not inherit pixel styling merely because the underlying engine uses pixel art.

**Acceptance criteria**
- Redesigned panels display actual runtime state.
- Existing interactions remain reachable and usable.
- Dialogue and narrative history do not diverge.
- Keyboard ownership and input focus remain correct.
- Responsive web and Android layouts are tested.

#### Phase 7 — Natural-language gameplay and interaction reliability

**Objectives**
Make the game reliably interpret intentions beyond simple directional commands.

Required interaction categories include:
- Move left/right/up/down and move toward a named NPC or location.
- Approach, follow, talk to and interact with named characters.
- Identify and interact with objects.
- Sleep/rest on a suitable bed.
- Sit, train, pick up, equip and use items.
- Talk, ask questions and respond in dialogue.
- Combat and relevant abilities.
- Enter/leave locations and travel.
- Ordinary travel with meaningful route/location context.
- Fast travel with a clear summary rather than a silent unexplained teleport.
- Trigger and resolve world events.

**Required action pipeline**
1. Interpret the player's intention.
2. Resolve the target against actual world entities and locations.
3. Detect ambiguity and ask the player to clarify rather than guessing.
4. Construct a typed, validated action proposal.
5. Submit the proposal to the authoritative engine.
6. Execute only actions accepted by engine rules.
7. Read the actual resulting world state.
8. Narrate that result.
9. Update story progression and presentation from the same canonical turn result.

Investigate intermittent Modder offline messages separately from action interpretation. Determine whether Modder is a required dependency, optional integration or an unrelated tool in the current runtime. Do not assume that an online Modder connection alone makes natural-language gameplay reliable.

**Acceptance criteria**
- Named-target movement works with multiple nearby candidates and ambiguous-target clarification.
- Bed/sleep interaction succeeds only when the world entity and rules allow it.
- Failed actions are narrated as failures, not fabricated successes.
- NPC dialogue and action outcomes match engine state.
- Interrupted turns do not claim completion.
- Regeneration and rollback preserve authoritative state and existing snapshot rules.
- Tests cover both successful and rejected interactions.

#### Phase 8 — World-definition and custom-world architecture

Only begin detailed implementation after the core application and gladiator gameplay demonstrate the required reusable foundations.

**World definition dimensions**
- Setting, tone, lore and history.
- Geography, regions and locations.
- Factions and social structures.
- Species and their compatibility.
- Attributes, equipment and progression.
- Magic, technology and other capability systems.
- Creatures, NPC behaviours and environmental rules.
- Narrative constraints and content policy.
- Asset packs and visual identity.

Future examples include magical academies, supernatural/curse-based settings, medieval fantasy, mechanical samurai, medieval zombie survival and original science-fantasy worlds. These are examples of possible original settings, not a requirement to reproduce copyrighted franchises, protected characters, logos or proprietary assets.

Do not hardcode every world's mechanics into one universal character sheet. Determine which capabilities are supported by the current engine and which require carefully scoped extensions. Keep world-specific rules data-driven where practical and validated by the engine.

**Acceptance criteria**
- A world can declare and validate its supported rules and content.
- Unsupported mechanics are identified rather than silently simulated.
- Existing OpenWorld worlds continue to work.
- At least two meaningfully different test-world configurations can be loaded without duplicating the core runtime.

#### Phase 9 — AI-assisted content creation

**Objectives**
Create validated workflows for authoring or generating:
- NPCs and characters.
- Species variants.
- Monsters and bosses.
- Weapons, armour and items.
- Powers, spells and skills.
- Maps, buildings and locations.
- Artwork, effects and supported animations.
- Dialogue, quests and story content.

Reuse the asset catalogue, existing DreamVille image-generation patterns where appropriate, and OpenWorld's actual content contracts. Generated content must be validated for schema, engine compatibility, world rules, balance, provenance and licence constraints. AI must not invent engine capabilities or silently create invalid runtime data.

**Acceptance criteria**
- Generated content is previewable and reviewable before being added to a world.
- Invalid content is rejected with actionable errors.
- Asset provenance and licence information are retained.
- Existing authored content remains usable.
- Content generation cannot directly bypass authoritative engine validation.

#### Phase 10 — Integration, optimisation and release

Complete and record:
- Unit and integration tests.
- Browser UI and end-to-end gameplay tests.
- Android builds and device/emulator tests where available.
- Save/load and migration verification.
- Offline-first behaviour.
- BYOK configuration and provider failure handling.
- Long-session performance and memory/resource testing.
- Security and dependency review.
- Production web build.
- Android release build.
- Documentation and release preparation.

A successful HTTP response is not proof that gameplay works. A test discovery/dry run is not a completed test run. A prior Android build is not proof that the current source builds. Record exact commands, exit codes, test totals and environmental blockers.

### 15.3 Cross-phase engineering rules

1. Inspect and reuse existing systems before proposing replacements.
2. Do not create a second home screen, save system, character creator, narrative engine or gameplay runtime.
3. Preserve the OpenWorld pixel-art renderer and authoritative simulation.
4. Keep the modern LoreMaster application shell visually distinct from in-game pixel art.
5. Keep AI-generated proposals subordinate to engine validation.
6. Keep web and Android compatibility.
7. Preserve offline-first core gameplay and BYOK-only AI access.
8. Do not introduce mandatory hosted AI or owner-managed API keys.
9. Record provenance and licences for all imported or generated assets.
10. Do not implement elaborate custom-world mechanics before the core RPG is reliable.
11. Do not mark work complete without evidence against explicit acceptance criteria.
12. Distinguish implemented, integrated, tested and user-verified states.
13. Treat flaky tests, timeouts and missing test infrastructure as unresolved until properly diagnosed.
14. Avoid broad refactors when a narrow integration with an existing contract is sufficient.
15. Keep documentation aligned with the actual code and current branch.

### 15.4 Progress tracking requirements

Maintain a phase/task tracker with these statuses:

- NOT STARTED
- AUDITING
- IN PROGRESS
- BLOCKED
- PARTIAL
- VERIFICATION
- COMPLETE

For every phase and significant task record:
- Objective and scope.
- Existing systems to reuse.
- Files/contracts affected.
- Dependencies.
- Acceptance criteria.
- Tests and verification commands.
- Actual results and exit codes.
- Known defects and blockers.
- Evidence links or source references.
- Completion status and date.

A phase is COMPLETE only when all mandatory acceptance criteria have been demonstrated. Documentation alone does not constitute implementation.

### 15.5 Freebuff execution mission — next assignment

The next Freebuff assignment is to reconcile and operationalise this blueprint, not to begin implementing all ten phases.

1. Verify the actual LoreMaster repository, active workspace, branch, HEAD and working-tree state. Never use the obsolete Portal workspace.
2. Read this entire blueprint and inspect the existing documentation structure.
3. Preserve all existing source-backed sections and decisions.
4. Compare the roadmap in this section with any existing master plan, tracker and architecture decision documents. Reuse existing documents where sensible; do not create duplicate authorities.
5. Resolve the title-screen conflict explicitly: LoreMaster branding and the LoreMaster home screen are the normal launch experience; OpenWorld Cover logic may be reused internally where required for save/start/runtime contracts.
6. Verify source-dependent claims against the current branch before changing them. In particular, re-check save/start contracts, story/act relationships, image slots, look/species definitions, creator compatibility, narrative boundaries and Android/web entry points.
7. Identify contradictions, missing dependencies, outdated claims and scope overlaps. Record unresolved points rather than guessing.
8. Update this blueprint and any genuinely necessary supporting roadmap/tracker/decision documents so that there is one coherent source of truth.
9. Set honest initial progress statuses. Do not mark future phases as implemented or complete.
10. Review the full diff for accidental deletion, duplicated systems, incorrect paths and unsupported claims.
11. Commit documentation changes on the correct branch only after review, following the repository's contribution conventions.
12. Report exact changed files, commit SHA, branch, decisions reconciled, unresolved issues and the next implementation task.

Do not implement the application shell, character creator, asset imports, gladiator world or gameplay changes as part of this documentation assignment. Those belong to their respective phases and should begin only after this roadmap reconciliation is reviewed.

### 15.6 Definition of success

LoreMaster should become one coherent, extensible RPG product:

- A recognisable LoreMaster-branded application experience.
- A story-centred home and library with meaningful cover artwork.
- A reusable character creation experience with genuine species diversity.
- A growing, properly licensed asset collection.
- A playable demonstration adventure that exercises real engine systems.
- Reliable natural-language interaction grounded in authoritative simulation.
- A world-definition architecture capable of supporting genuinely different settings and rule systems.
- AI-assisted content creation that produces validated, usable game content.
- A tested web and Android experience.

The guiding principle is: **build the product once, make its worlds diverse, and let validated data and rules—not duplicated game implementations—provide that diversity.**

