# Phase 1 Design Specification — LoreMaster Identity and Application Foundation

Status: design artifact for review, prepared from `docs/phase0-source-reexamination.md` and the adopted Option 1 boundary in `docs/loremaster-roadmap-boundary.md`.
Phase 1 status in `docs/loremaster-roadmap.md`: `PLANNED`.
This document describes the intended Phase 1 shell and Cover handoff. It does not modify existing runtime or engine files.

## 1. Purpose and scope

Phase 1 establishes the LoreMaster application shell and the documented handoff from the existing OpenWorld title screen, without touching the game renderer, the pixel character creator core, or existing saves.

The one concrete end-to-end flow this phase must enable is:
1. choose a world,
2. describe a character,
3. receive an AI appearance recommendation,
4. preview that recommendation in the existing creator,
5. approve it,
6. start the game in a slot.

Everything else in this spec exists to make that flow coherent and to keep the existing contracts intact.

## 2. Documents this design depends on

- `docs/loremaster-roadmap-boundary.md` — the Option 1 boundary decision.
- `docs/loremaster-roadmap.md` — the authoritative LoreMaster phase tracker.
- `docs/loremaster-product-identity-blueprint.md` — vision, requirements, and the source of phase titles and status vocabulary.
- `docs/phase0-source-reexamination.md` — the verified findings and gaps this design is built on.
- `docs/roadmap.md` — preserved as-is; the separate OpenWorld technical roadmap, not merged into this work.
- `docs/design.md`, `docs/engine-split.md`, `docs/looks.md`, `docs/ui.md`, `docs/quests.md`, `docs/character-art.md` — supporting design authorities.

## 3. Design principles

1. **Two layers, kept separate.** The modern application shell is Layer A; the existing pixel game and its title screen are Layer B. This matches `docs/loremaster-product-identity-blueprint.md` section 10.
2. **Reuse first, rewrite nowhere.** Phase 1 builds on live source contracts. It does not delete `cover.ts`, and it does not duplicate saves, the creator, or the game's start/resume plumbing.
3. **Handoff, not replacement.** The shell hands control to the existing Cover system. The existing Cover system remains the game's title screen.
4. **Metadata where the engine already has a gap.** The verified gap in `docs/phase0-source-reexamination.md` section 2 is that there is no first-class "act" entity. Phase 1 therefore treats story→act mapping and current-act display as a small application/content metadata concern, not an engine rewrite.
5. **Honest about what is missing.** The spec states the key negative findings from Phase 0 plainly, especially the look/species finding in section 5 of that report.

## 4. Existing handoff surface used by this design

This design is built on the verified surface recorded in `docs/phase0-source-reexamination.md` section 1. The exact contracts are:

- `Cover.latest()` — current title state, including the latest continuable slot.
- `CoverHandlers.start(slot, summary, options)` — start a slot from its save or a new game in it, with the `NewGame` payload shape `{ difficulty, look?, start? }`.
- `CoverHandlers.tutorial(game?)` — the standalone tutorial start.
- `CoverHandlers.backdrop(scene, at)` — the world behind the title.
- `CoverHandlers.toggleLocale()`, `CoverHandlers.toggleSound()`, `CoverHandlers.muted()`, `CoverHandlers.levels()`, `CoverHandlers.titleMusic(on)`, and `CoverHandlers.ai` — the settings/music/AI bridge the cover already expects.
- `cover.show(panel?)` / `cover.hide()` — the existing title lifecycle already used in `packages/runtime/src/main.ts`.
- The `saves.ts` contract in `packages/runtime/src/saves.ts`: `readSlot`, `writeSlot`, `deleteSlot`, `listSlots`, `exportSlot`, `pickSaveFile`, `Slot`, `SlotData`, and the per-slot `summary?: SaveSummary`.
- The worker message contract in `packages/runtime/src/protocol.ts`, especially the `init` payload fields the runtime already forwards: `base`, `save`, `library`, `librarySeq`, `difficulty`, `start`, `look`, `prefetch`, `quality`, `guiding`, and the modder/own-model plumbing.
- The game contract in `packages/runtime/src/game.ts`: `ClientGame`, `CoverDef`, `ClientGame.looks`, and the `useGame()` handover.
- The game-specific cover definition in `games/openworld/client/src/game.ts` as `CLIENT_GAME.cover`: title, tutorial flag, optional workshop start, the backdrop scene list, and companion art.

How the existing runtime currently tears down the title on `ready` is also part of the verified surface: `packages/runtime/src/main.ts` sets `backdropOn = false`, clears `scene.setCinema(undefined)`, clears the music place, calls `cover.hide()`, and then sends `{ t: 'save' }` so the slot is written or refreshed immediately after the game is ready.

## 5. LoreMaster's new opening screen and branding

### 5.1 What changes and what does not

Phase 1 adds a modern application entry and branding layer above the existing game. It does not replace the OpenWorld pixel renderer and it does not merge the shell's opening experience with the game's title screen.

The existing `Cover` class in `packages/runtime/src/ui/cover.ts` remains the game's title screen: world-behind title, companion, continue/new/load/settings. The new LoreMaster shell sits above it for the application experience.

### 5.2 Branding ownership

Phase 1 branding is owned by the application shell, not by the game. At minimum the shell owns:
- app name / logo / title treatment,
- a curated opening sequence,
- navigation chrome,
- the visual language for story cards, covers, and world identity.

The game's own title screen remains the game's branded entry. The shell's "play" action enters the game's title screen or directly starts a slot per the existing `CoverHandlers.start` contract.

### 5.3 Opening sequence

The intended Phase 1 opening sequence is:
1. branding frame,
2. world selection or featured story,
3. then, depending on the choice, either the existing game title screen or the new-game flow.

This is a shell-level sequence. It is not a replacement for `cover.ts`.

### 5.4 Art direction boundary

The shell uses modern/cinematic/non-pixel branding, icons, and cover artwork. The game keeps its pixel-art renderer and pixel HUD text. This boundary is the same one described in `docs/loremaster-product-identity-blueprint.md` section 10.

## 6. Modern home screen architecture

### 6.1 Layout

The Phase 1 home screen follows the layout already described in `docs/loremaster-product-identity-blueprint.md` section 2:
1. one large featured / continuable story,
2. smaller story cards below it,
3. a Discover New Worlds section beneath the stories,
4. settings and app navigation.

### 6.2 Featured story card

The featured card must display:
- a main illustrated cover,
- the story title,
- the current act, when the metadata exists,
- last-played information,
- a Resume Story action.

The "last played" part is already solved at the save level. `packages/runtime/src/saves.ts` stores `SlotData.summary?: SaveSummary`, and `packages/runtime/src/ui/cover.ts` already renders lines of the form `map · day n · time · Lv n · objective/quest`. What Phase 1 still needs is the shell's mapping of a story to its save slot(s), to its current act/scene, and to its cover artwork. That mapping is the small metadata layer described in section 11.

### 6.3 Smaller story cards

Smaller cards show the respective cover artwork and progress. Progress reuses existing save summaries once the shell can associate a story with slot metadata.

### 6.4 Discover New Worlds

In Phase 1 this section is a curated, sparse, hand-maintained list of worlds with cover artwork, short descriptions, and a play action. It is future-facing. It is not an elaborate marketplace in this phase.

### 6.5 Shell navigation

The shell provides:
- Home,
- Story library,
- Discover New Worlds,
- Settings, with a gateway to the game's existing settings.

The shell has its own app-level settings and delegates to the game's settings when entering the game. The two settings surfaces stay distinct. The game's settings surface already exists in `packages/runtime/src/ui/cover.ts` for language, sound, world filter, keys, AI, and credits.

## 7. How the existing Cover system hands control to the new shell

### 7.1 The actual relationship

The shell does not replace `cover.ts`. Instead, the shell is the application layer that decides when and how the player reaches the game, and the existing Cover system remains the game's title screen that the player enters.

Concretely:
- The shell's "resume/play" action maps to the existing start contract `CoverHandlers.start(slot, summary, options)`.
- The shell may enter the game's title screen through the existing `cover.show()/cover.hide()` lifecycle already in `packages/runtime/src/main.ts`.
- When the game is ready, the existing runtime tears down the title the way `packages/runtime/src/main.ts` already does on `ready`.

### 7.2 What the shell provides that the cover does not

The shell provides:
- the modern entry and branding,
- the featured-story and library view,
- the story→slot association,
- the resume action that calls the existing start contract,
- the world selection that hands off into the game's existing new-game flow.

The shell does not reimplement slot pick/load/export/import, difficulty pick, look creation, or settings. Those remain the existing Cover system's responsibility.

### 7.3 What must not happen

- The shell must not delete or bypass `cover.ts`.
- The shell must not merge its opening experience with the game's title screen.
- The shell must not duplicate the save lifecycle that `packages/runtime/src/saves.ts` already provides.

## 8. How saves, settings, and new-game creation remain functional

### 8.1 Saves

Phase 1 reuses the existing save surface exactly as verified in `docs/phase0-source-reexamination.md` section 1:
- 3 browser save slots per world in IndexedDB via `packages/runtime/src/saves.ts`,
- per-slot `SlotData { save: SaveData; summary?: SaveSummary; savedAt }`,
- export as `.json` with format `openworld-save`,
- import via `pickSaveFile()`,
- open-question settlement on load via `settleOpenQuestions`.

The shell does not store its own copy of save data. It reads summaries through the existing slot contract and presents them in the library view.

### 8.2 Resume

Resume is: find the slot for a story, show its summary, and call the same `CoverHandlers.start(slot, summary)` contract the existing cover already uses. This avoids duplicating save handling.

### 8.3 New-game creation

New-game creation remains the existing Cover system's two-step flow: look creation, then journey choices, then save slot and difficulty, built as a `{ difficulty, look?, start? }` payload handed to `CoverHandlers.start(...)`.

The shell's job is to reach that existing flow from a world choice and, when AI-assisted appearance is used, to feed the existing creator first.

### 8.4 Settings

The shell keeps app-level settings separate from the game's settings. The game settings already exist and remain reachable. The shell's settings panel is the gateway to them when entering the game.

## 9. How the existing character creator is reached

### 9.1 The creator is retained

The existing pixel character creator in `packages/runtime/src/ui/creator.ts` is retained and reused. Phase 1 does not add a second creator and does not adopt Dreamville's CharacterGenesis UI as the visual creator.

The existing cover already instantiates the creator as part of its new-game look step. Phase 1 keeps that reality and adds an AI-assisted recommendation path that feeds the same creator.

### 9.2 How the shell reaches it

The shell reaches the existing creator in one of two ways:
- through the existing Cover new-game look step, when the player starts a game in the normal way,
- through an AI-assisted character-creation step that feeds the existing creator a `LookPins`-compatible partial look before the player edits and approves it.

In both cases the visual preview, the editable surface, the words the world uses, and the final look persistence remain the existing creator's responsibility.

### 9.3 What the shell must not do

The shell must not:
- invent new part ids from AI,
- overwrite player-edited fields,
- replace the creator with a CharacterGenesis-style UI.

## 10. How the new shell works on desktop, mobile, and Android

### 10.1 Desktop and mobile web

On desktop and mobile browsers, the shell is the modern application layer above the existing runtime entry. The existing web entry path is already present: `games/openworld/client/index.html` boots to the client entry, which hands the game to the runtime, and the runtime is the real player entrypoint. Phase 1 adds the shell at the application layer above that path.

The shell should be responsive and usable on both desktop and mobile. Navigation, story cards, creator preview, and settings must work on a touch-capable mobile layout as well as on desktop.

### 10.2 Android

The Android path already has its inputs present: `capacitor.config.ts` and `android/app/src/main/assets/capacitor.config.json` both use `webDir: 'games/openworld/client/dist'`. The existing browser mechanics are not changed by Phase 1.

Phase 1 therefore does not introduce a separate Android app path. The shell runs as the application layer in the same web build the Android artifact already packages. Any mobile/touch behavior the shell needs should be implemented once in the shared shell UI, not as a separate Android-only flow.

### 10.3 What is not verified yet

The web entry path and title→new-game flow are verified as present and covered by the existing UI tests. The Android/Capacitor build/publish path is present in repo but is not verified green in this session. The design should treat Android as a supported target that reuses the same shell, while remaining honest that the build/publish path still needs its own verification.

## 11. New contracts Phase 1 must define before implementation

These are small, explicit contracts. They are application-facing metadata and UI contracts, not engine rewrites.

### 11.1 Story metadata

A story library entry should link:
- `storyId`,
- human title,
- `worldId`,
- cover art asset,
- current act id/label, when available,
- last-saved slot info, or "not started",
- an optional resume action.

A story→acts mapping should be a small ordered list of `ActInfo { actId, label, stepRange/milestone, coverArtAsset? }`.

Current-act resolution should map the engine's current scene/step to an act label through application or content metadata. The engine already knows which step/scene is running; the app maps that to an act label.

### 11.2 World identity

A world identity record should carry enough to drive a world_cover-style identity and to keep story/act covers consistent: identity fields such as title, summary, setting, environment, genre/tone/era, factions, magic/technology, geography, visual motifs, and cover art asset.

This is adapted from the Dreamville `worldVisualIdentityService` concept in `docs/loremaster-product-identity-blueprint.md` section 4, not copied from it.

### 11.3 Image-asset slot family

Phase 1 should treat `world_cover` and `story_run_cover` as reference concepts and propose the smallest correct extension for act artwork, which is a new slot concept `act_cover`, defined with:
- slot type id: `act_cover`,
- aspect ratio and fit mode,
- output mime/quality and safe margin,
- prompt building reused from the existing Dreamville-style approach,
- a "current subject only, no recap/future invention" discipline taken from the comic-scene generator concept in `docs/loremaster-product-identity-blueprint.md` section 4.

Act covers are not assumed to exist in Dreamville. The verified fact from `docs/phase0-source-reexamination.md` section 3 is that there is no confirmed act_cover slot in this repo and no verified act-artwork slot system here.

### 11.4 AI appearance recommendation

The AI step should produce an `AppearanceRecommendation` with:
- `body?`, mapped to an existing body id with an exact/approximate flag,
- `parts`, a `Record<slot, partId|null>` chosen from existing parts,
- `colors`, a `Record<colorKey, colorId>` or hex, chosen from existing colors,
- confidence/approximate flags,
- an explanation,
- changed vs preserved fields.

This feeds the existing creator as a `LookPins`-compatible input. The existing creator renders it and the player edits it.

### 11.5 Species compatibility profile

This spec does not assume a species field exists. The verified fact from `docs/phase0-source-reexamination.md` section 5 is that `games/openworld/content/src/looks.ts` has no species/race/ancestry field and that the look record is bodies/slots/parts/colors plus the dresser.

If LoreMaster eventually wants species, it should be a compatibility profile linking identity to visuals and gameplay, starting as content data. Phase 1 should mark species-aware appearance as approximate wherever it cannot be supported by existing bodies/parts/colors.

## 12. Implementation sequence

Phase 1 is implemented in the order below. Earlier steps make later steps coherent. The sequence is designed to keep the existing contracts intact and to land the one end-to-end flow last.

### 12.1 Contracts and identity first

1. Confirm the shell/game boundary with the existing files and the Option 1 decision.
2. Define the small new contracts in section 11: story metadata, world identity, image-asset slot family with the proposed `act_cover` concept, AI appearance recommendation shape, and the species compatibility profile concept.
3. Define the curated Phase 1 world and story metadata for the one flow the phase must enable.

### 12.2 Shell chrome

4. Build the application shell chrome: branding, navigation, modern iconography and typography, and the opening sequence.
5. Keep the existing game and its title screen untouched while the shell is added above it.

### 12.3 Home and library

6. Implement the home screen: featured story, smaller story cards, Discover, and settings entry.
7. Implement the story library view using the existing save summaries and slot contract.
8. Implement the resume action that calls the existing `CoverHandlers.start` contract.

### 12.4 Character creation integration

9. Implement the AI-assisted appearance step as a recommendation fed to the existing creator, with field-lock/provenance and AI-unavailable gating.
10. Implement the approve path that passes the player's final look into the existing new-game flow.

### 12.5 End-to-end flow

11. Wire one end-to-end flow: choose a world → describe a character → AI recommendation → existing creator preview → approve → start game in a slot.
12. Verify that saves, settings, load/export/import, and the existing new-game flow still work through the shell.

## 13. What Phase 1 does not do

Phase 1 does not:
- touch the game renderer or the pixel HUD,
- replace or rewrite `cover.ts`,
- duplicate saves, the creator, or the start/resume plumbing,
- assume a species field exists in the look contract,
- assume a verified act_cover slot exists in this repo,
- build a full world-creator authoring UI,
- build an elaborate world marketplace,
- implement Phase 2 and beyond.

## 14. Acceptance tests

Acceptance is defined by demonstrated behavior, not by documents written.

### 14.1 Shell and identity

1. The LoreMaster opening screen shows the new branding and opening sequence, and the existing game title screen is still reachable as the game's title screen.
2. Navigation chrome works on desktop and on a mobile viewport: Home, Story library, Discover, and Settings are reachable and usable.
3. The shell's settings gateway reaches the existing game settings without merging the two surfaces.

### 14.2 Save and resume

4. An existing save summary appears in the story/library view through the existing `saves.ts` contract.
5. Resume from a library entry restarts the game through the existing `CoverHandlers.start` contract.
6. Export and import of a save still work through the existing save surface.

### 14.3 New game and creator

7. Starting a new game from the shell still reaches the existing two-step new-game flow and the existing creator.
8. An AI appearance recommendation can be fed into the existing creator as a partial look and rendered there.
9. Player edits in the creator are preserved when the AI reinterprets or refines the appearance.
10. When AI is unavailable, the flow gates the fallback behind explicit player consent instead of silently falling back.

### 14.4 Cross-platform

11. The shell entry and the one end-to-end flow work in the web build used by desktop and mobile.
12. The Android artifact still packages the same web build, using the existing `webDir` config; the design does not introduce a separate Android-only path.

### 14.5 Honest boundaries

13. The implementation does not remove or bypass `cover.ts`, and the existing Cover/save/start/settings contracts remain functional.
14. Current-act display, when implemented, uses the small story→act metadata contract rather than an assumed engine "act" entity.
15. Any species-aware appearance is marked approximate where the existing look contract does not support a species directly.

## 15. Review boundary

This specification is a Phase 1 design document. It is written from the completed Phase 0 source re-verification and the adopted Option 1 boundary. It does not implement Phase 1. Phase 1 implementation stays on hold until this design and the boundary decisions are accepted.
