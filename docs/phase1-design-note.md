# Phase 1 Design Note — LoreMaster Shell and Cover Handoff

Status: design note only. Prepared from `docs/phase0-source-reexamination.md`, `docs/loremaster-roadmap-boundary.md`, and the Phase 1 entries in `docs/loremaster-roadmap.md`. This is not an implementation and does not add runtime/engine/game code.

## 1. What Phase 1 is trying to establish

Phase 1 establishes the LoreMaster application shell and a documented handoff to the existing OpenWorld title screen, with one concrete end-to-end flow:

1. choose a world,
2. describe a character,
3. receive an AI appearance recommendation,
4. preview that recommendation in the existing creator,
5. approve it,
6. start the game in a slot.

Everything else in this note exists to keep that flow coherent without touching the game renderer, the pixel creator core, existing saves, or `cover.ts`.

## 2. Verified foundation the design builds on

These contracts already exist and are live, so Phase 1 is reuse/handoff rather than a title-screen rewrite:

- `packages/runtime/src/ui/cover.ts` — existing title screen: world-behind title, companion, continue/new/load/settings, two-step new-game flow, slot pick/load/export/import/delete, settings/language/sound/filter/keys/AI/credits.
- `packages/runtime/src/saves.ts` — 3 browser save slots, `SlotData { save; summary?; savedAt }`, summaries, export/import, open-question settlement.
- `packages/runtime/src/protocol.ts` — the worker message contract used to start and resume, including the `init` payload shape.
- `packages/runtime/src/game.ts` — `ClientGame`, `CoverDef`, `ClientGame.looks`, and the `useGame()` handover.
- `games/openworld/client/src/game.ts` — `CLIENT_GAME.cover`: title, tutorial flag, optional workshop start, backdrop scene list, companion art.
- The existing runtime lifecycle in `packages/runtime/src/main.ts`, where `ready` tears down the title (`backdropOn = false`, `scene.setCinema(undefined)`, music place cleared, `cover.hide()`, then `send({ t: 'save' })`).

The exact handoff surface is therefore:

- `Cover.latest()` for current title state,
- `CoverHandlers.start(slot, summary, options)` for new-game/load, with the `NewGame` payload shape `{ difficulty, look?, start? }`,
- the `saves.ts` contracts for the library/resume mapping,
- the existing `cover.show()/cover.hide()` lifecycle as it already exists in `main.ts`.

## 3. Shell architecture, as designed

The shell is Layer A; the existing pixel game and its title screen are Layer B. That split already exists in `docs/loremaster-product-identity-blueprint.md` section 10, and Phase 1 keeps it.

The shell owns:

- app name / logo / title treatment,
- a curated opening sequence,
- navigation chrome: Home, Story library, Discover New Worlds, Settings,
- the visual language for story cards, covers, and world identity.

The existing `Cover` class in `packages/runtime/src/ui/cover.ts` remains the game’s title screen. The shell sits above it for the application experience. The shell’s “play” action either enters the game’s title screen or directly starts a slot through the existing `CoverHandlers.start` contract.

The home screen layout is the one already described in the blueprint section 2:

1. one large featured/continuable story,
2. smaller story cards,
3. a Discover New Worlds section,
4. settings and app navigation.

## 4. Entry and exit paths

Every proposed screen needs a defined entry and exit path. Here is the current design posture:

- Opening/branding sequence: entry is the first application layer the player sees; exit is the world selection or featured story.
- World selection / featured story: entry from the opening sequence; exit is either the existing game title screen or the new-game flow.
- Home: entry after opening or from navigation; exit is library, Discover, settings, or play.
- Story library: entry from navigation; exit is resume, new game, or back to home.
- Discover New Worlds: entry from home or navigation; exit is world selection or back.
- Settings: entry from navigation or from the game handoff; exit is back to the relevant screen.
- AI-assisted character step: entry from world selection / new-game preparation; exit is the existing creator preview or back.
- Existing Cover/new-game flow: entry from the shell’s play action; exit is the game itself.
- Live game: entry from the existing cover/start contract; exit is whatever existing game path returns the player to a title or shell context.

The one gap in this list is not a missing screen; it is the post-game return path. The existing runtime already has game-to-title paths through the death screen, the menu’s new-game action, and tutorial completion, but the design must say which of those become shell return points and which remain game-only. That decision is still open.

## 5. Save management must not be duplicated

The new home screen must not duplicate save management.

The design therefore keeps the shell’s story library as a thin view sitting on top of the existing saves contract:

- the shell reads slot summaries through `packages/runtime/src/saves.ts`,
- it does not store its own copy of save data,
- resume is implemented as finding the slot for a story and calling the existing `CoverHandlers.start(slot, summary)` contract,
- export/import/delete/slot-pick remain the existing cover/saves responsibility.

The one thing the shell still needs is a story→slot association. That association must be a thin reference into the existing saves contract, not a separate parallel save model. If it becomes a second place where slot state lives, the no-duplication requirement is violated.

## 6. Existing Cover callbacks and contracts must stay intact

The existing Cover callbacks and contracts remain intact by design. Phase 1 does not replace or rewrite `cover.ts`, and it does not reimplement slot pick/load/export/import, difficulty pick, look creation, or settings.

One correction the design must take seriously: the shell should not be written as if it can directly drive the existing internal `cover` instance as though it were a public API.

In the current runtime, `cover` is created and owned inside `packages/runtime/src/main.ts`, and `cover.show()/cover.hide()` are used there at specific moments. The real public-facing handoff is the `CoverHandlers` contract passed into `Cover` and the `saves.ts`/worker contracts underneath it, not a promise that the shell can reach into `main.ts` and manipulate the existing cover object directly. If the shell needs the title screen to appear, it should do so through the same kind of existing entrypoint/abstraction the runtime already uses, not by pretending `cover` is a globally controllable shell widget.

## 7. Character creator reach

The existing pixel character creator in `packages/runtime/src/ui/creator.ts` is retained.

The shell reaches it in one of two ways:

- through the existing Cover new-game look step when the player starts a game the normal way,
- through an AI-assisted character step that feeds the existing creator a partial, compatible look before the player edits and approves it.

In both cases the visual preview, editable surface, world-facing words, and final look persistence remain the existing creator’s responsibility. The shell must not invent new part ids from AI, must not overwrite player-edited fields, and must not replace the creator with a CharacterGenesis-style UI.

## 8. Desktop, mobile, and Android

Desktop and mobile web share the same shell above the existing runtime entry. The existing web entry path is already present: `games/openworld/client/index.html` boots the client entry, which hands the game to the runtime via `useWorker`, and the runtime is the real player entrypoint.

Android reuses the existing config, not a new app path:

- `capacitor.config.ts`
- `android/app/src/main/assets/capacitor.config.json`

Both use `webDir: 'games/openworld/client/dist'`, so the shell runs as the application layer in the same web build the Android artifact already packages. Any mobile/touch behavior belongs in the shared shell UI, not a separate Android-only flow.

The one concrete layout requirement that must exist before acceptance is a mobile check. “Responsive and touch-capable” is a goal, not a test. The design needs at least one concrete mobile constraint that a test or review can actually check, for example tap target sizes, a one-column card layout below a chosen width, or keyboard-free navigation for the home/library flow.

## 9. Open dependencies and decisions

These are still open and should be resolved before implementation, not during it:

1. Post-game return path. Which game-exit moments return to the shell, and which remain game-only, is not yet decided.
2. Story→slot association. It must be defined as a thin reference into the existing saves contract, not a parallel save model.
3. Current-act display. This needs a small story→act metadata contract, because there is no first-class “act” entity in the engine today. That metadata is still undefined.
4. Curated Phase 1 world/story set. The one end-to-end flow needs a first curated world and story to exercise, but that set is not yet chosen.
5. AI availability. The AI-assisted appearance step depends on an AI service or an explicit fallback path. The service/source is not yet chosen, and the fallback must be gated behind explicit player consent rather than a silent default.
6. Image generation. Cover/act artwork depends on an image-generation capability. The contract can be defined first, but the actual generator is still a dependency.
7. Android build/publish verification. The config is present, but the build/publish path is not verified green in this session, so Android is a supported target in design only until that is checked.
8. Shell boot model. It is still not finally decided whether the shell layers on top of the existing client page or replaces the page’s first boot experience. Implementation needs one chosen model.

## 10. Acceptance-test verifiability

The accepted behavior is verifiable in two different ways, and the distinction matters.

What can be verified now, through existing tests:

- title, new-game look step, journey step, slot start, and the cover→game handoff,
- save summary reading, export/import, and the existing save surface,
- the existing creator behavior, through `npm run test:creation` and `tests/ui/creator.spec.ts`,
- the narrative dependency boundary, through `packages/engine/test/boundaries.test.ts`.

What can only be verified after the shell exists:

- branding/opening sequence behavior,
- home navigation, story library resume, and Discover behavior,
- the AI recommendation being fed into the existing creator and player edits being preserved,
- mobile layout behavior,
- the chosen post-game return path.

For the AI-dependent items, a dependable regression test needs a deterministic path — a scripted model or test mode — rather than a live AI run, because acceptance should verify the proposed behavior reliably and not depend on an external service being available in a given run.

## 11. What Phase 1 does not do

Phase 1 does not:

- touch the game renderer or the pixel HUD,
- replace or rewrite `cover.ts`,
- duplicate saves, the creator, or the start/resume plumbing,
- assume a species field exists in the look contract,
- assume a verified act_cover slot exists in this repo,
- build a full world-creator authoring UI,
- build an elaborate world marketplace,
- implement Phase 2 and beyond.

## 12. Implementation hold

Phase 1 stays on hold until the audit and this design note are accepted. The next concrete implementation work is not started here; this note records the design posture and the open decisions that implementation should not prejudice.
