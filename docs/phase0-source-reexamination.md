# Phase 0 Source Re-Examination

Purpose: record, with exact references, what the existing source contracts actually do and what is still missing before Phase 1. This is an audit artifact, not an implementation.

Scope: Cover/save/start/settings contracts, story-to-act relationships, artwork slots, character creator, species/look compatibility, narrative boundaries, and web/Android entry points.

Verdict before reading any of it this session was simple: the existing OpenWorld source already exposes most of the deliverable surface we would want to hand off to a LoreMaster shell; the main gaps are metadata and future-content concepts, not missing runtime plumbing.

## 1. Cover / save / start / settings contracts

Status: **verified**.

What exists:

- The title screen is `packages/runtime/src/ui/cover.ts`. It owns the live settings panel, the new-game look/journey steps, the slot picker, and the start actions. Its settings panel is wired today for language, sound, filter, keys, AI and credits: see the settings branch in `cover.ts` around the `#cvLang` / `#cvSound` / `#cvFilter` / `#cvKeysBtn` / `this.on.ai.wire(host)` / credit wiring, and the tutorial/workshop buttons in the same file.
- New-game flow is explicit in `cover.ts`: there is a `showStep('look'|'journey')` step UI, a slot picker, difficulty picks, and start payloads built as `{ difficulty, look, start }` and handed to `on.start(...)`. The cover also reopens itself at well-defined moments in `packages/runtime/src/main.ts`: after a new-game reselect (`afterSave.then(() => cover.show())`), on an incompatible-start refusal (`cover.show().then(() => cover.failed(...))`), on tutorial completion (`cover.show().then(() => cover.note(...))`), and in the model-negotiation path (`cover.show()` in the AI/own-model flow).
- Save/slot contracts are in `packages/runtime/src/saves.ts`: slot read/write, summaries, listing, export and import. `packages/runtime/src/protocol.ts` carries the worker message contract the cover and the runtime use to start and resume.
- `packages/runtime/src/game.ts` defines the typed cover contract the game publishes: `CoverDef`, `CoverScene`, and the game’s `looks` surface on `ClientGame`, plus `useGame()` / `game()` for the runtime’s current-game access.
- The game’s own cover definition lives in `games/openworld/client/src/game.ts` as `CLIENT_GAME.cover`: title, tutorial flag, optional workshop start, the backdrop scene list, and companion art. That is the game-specific part of the title screen contract.

How the handoff actually works today:

- The runtime starts/resumes through the worker. On `ready`, `main.ts` does the title teardown: `backdropOn = false`, `scene.setCinema(undefined)`, music place cleared, `cover.hide()`, then `send({ t: 'save' })` so the slot is written or refreshed immediately after the game is ready.
- So the real handoff surface is not speculative. It is: `Cover.latest()` for current title state, `CoverHandlers.start(slot, summary, options)` for new-game/load, the `saves.ts` slot/summary/list/export/import contracts for the library/resume mapping, and the existing `cover.show()/cover.hide()` lifecycle already in `main.ts`.

Gap:

- None in the existing Cover/save/start/settings contracts. The gap is only that Phase 1 has not been written yet; the contracts it would hand off from are already present and live.

Exact references:

- `packages/runtime/src/ui/cover.ts`
- `packages/runtime/src/saves.ts`
- `packages/runtime/src/protocol.ts`
- `packages/runtime/src/game.ts`
- `packages/runtime/src/main.ts`
- `games/openworld/client/src/game.ts` (`CLIENT_GAME.cover`)

Acceptance-test verifiability:

- Verifiable. The existing UI test `tests/ui/game.spec.ts` already exercises the live title flow, including a `start(page)` helper that goes new → next step → new game → waits for `lsw.frame.player`. That is direct evidence the cover/new-game/look path works in a real browser context. Save/export/import and settings are reachable from the same cover surface.

## 2. Story-to-act relationships

Status: **partial**.

What exists:

- The story engine is `packages/engine/src/story.ts`. It has a step-script model: steps are loaded by id, the world has `w.story`, and the story can be started with `start(id)`. Region/beat logic and the step/condition model live there.
- The content’s actual steps live in `games/openworld/content/src/*`, not in the engine. For example, `games/openworld/content/src/prologue.ts` exports beat/step arrays and lesson tables, and the chapter files carry their own story material. So steps are authored as content, not as a separate engine “act” entity.

Gap:

- There is no separate “act” entity in the engine. Act grouping is not a first-class contract today. That means current-act display and act artwork are a small missing metadata/UI contract, not a missing engine subsystem.
- This matters for Phase 1 because the blueprint’s story-centric view assumes a current-act concept for display and for act artwork. The engine can already run the story; what is missing is the lightweight act grouping and the UI/metadata around it.

Exact references:

- `packages/engine/src/story.ts`
- `games/openworld/content/src/prologue.ts`
- `games/openworld/content/src/game.ts`

Acceptance-test verifiability:

- Partially verifiable today. The engine can be verified to run a story and track its current step/scene. The current-act display the LoreMaster shell wants is not yet a verified contract, because it depends on the new story→act metadata layer rather than on a pre-existing engine “act” entity.

## 3. Artwork slots

Status: **verified for looks/portraits/sprites; not verified for act artwork slots**.

What exists:

- The look system is the authoritative slot/part/color contract: `games/openworld/content/src/looks.ts` defines `LOOK_SLOTS` (12 slots), the four bodies in `LOOK_BODIES`, `LOOK_PARTS`, `LOOK_COLORS`, `LOOK_TABLE`, and the generator/describer on the game’s `looks` surface.
- The renderer side is present and real: `packages/runtime/src/assets/figure/sprite.ts` composes the map sprite from a look, and `packages/runtime/src/assets/figure/index.ts` provides `portraitOf` and `preparePortrait` for the standing portrait. So the sprite/portrait pipeline is already in place and already used by the creator and the runtime.
- The documented contract for this whole surface is `docs/looks.md`: what a look record is, the three outputs (sprite, portrait, tags/words), the art pipeline, the event model, and the world filter.

Gap:

- There is no verified in-repo “act_cover” slot and no verified act-artwork slot system in this repo.
- The blueprint’s mention of image slots and an act cover is partly a Dreamville reference-clone claim. For this repo, the verified fact is: the existing OpenWorld asset/rendering setup exists, and the missing piece is act-grouping metadata, not a confirmed act-specific artwork slot inside this repository.

Exact references:

- `games/openworld/content/src/looks.ts`
- `packages/runtime/src/assets/figure/sprite.ts`
- `packages/runtime/src/assets/figure/index.ts`
- `docs/looks.md`

Acceptance-test verifiability:

- Looks/portrait/sprite art is verifiable through the existing renderer and creator. Act covers are not yet verifiable in this repo, because the slot and the act-grouping metadata are both still missing.

## 4. Character creator

Status: **verified**.

What exists:

- The existing pixel character creator is `packages/runtime/src/ui/creator.ts`. It is the hand-built look editor: body, one part per slot, colors, body switching, generation, and description.
- It already exposes what a LoreMaster shell would want from it: an editable `look`, body/part/color selection constrained to the current body, `generate` and `describe` from the game’s looks surface, and an `onChange` callback path. The new-game panel already makes the player’s look with it, and the dev page makes anyone’s look.
- The cover already instantiates it as part of the title flow, so the creator is not a separate future surface; it is a current title-screen contract.

Gap:

- None in the existing creator surface. The Phase 1 question is only how the LoreMaster shell feeds it a recommendation and preserves player-edited fields; the creator itself is already there and already usable.

Exact references:

- `packages/runtime/src/ui/creator.ts`
- `games/openworld/content/src/looks.ts`

Acceptance-test verifiability:

- Verifiable. The existing creator has its own deterministic regression set via `npm run test:creation`, and the UI test `tests/ui/creator.spec.ts` exists alongside the game flow test. The creator behavior itself is testable without implementing Phase 1.

## 5. Species / look compatibility

Status: **key negative finding**.

What exists:

- The look record today is bodies, slots, parts, colors, and the dresser/restyle path. `games/openworld/content/src/looks.ts` has no species, race, ancestry or lineage field. The only body diversity is the four bodies in `LOOK_BODIES`, with parts gated by `bodies` and weighted by `gen`.
- Look compatibility in the existing system is expressed through body gating and part generation, not through a species taxonomy. The dresser (`restyle`) and `World.setLook` / the `own` snapshot are the existing look-mutation path.

Gap:

- Species is not present in the look contract today. This is the explicit current state, not something hidden behind an existing field.
- Any species/lineage layer would be a future extension built on top of the approved look record, not something already wired. Phase 1 therefore cannot assume a species field exists; if LoreMaster eventually wants one, the look record and the creator need that extension designed and added first, on top of the existing bodies/slots/parts/colors.

Exact references:

- `games/openworld/content/src/looks.ts`

Acceptance-test verifiability:

- Not meaningfully verifiable as a positive capability today, because the field does not exist. The auditable fact is the absence itself: the look record does not currently carry species/race/ancestry. Any future acceptance test for species would first need the new data shape and then a compatibility profile that is more than a name on a dropdown.

## 6. Narrative boundaries

Status: **verified**.

What exists:

- Dependency enforcement is real and present: `packages/engine/test/boundaries.test.ts` still carries the `narration: ['@openworld/engine']` allowance at line 23. That is the boundary test that holds the direction.
- The product identity for the boundary is in `docs/design.md`: the AI interface is the outcome of an event, and narration/undefined-leaf behavior is the place the AI enters. That is the narrative-boundary design authority.
- The hosting/direction context is also in `docs/engine-split.md`: `games/*` may import `packages/*`, never the reverse, and the boundary test holds that direction.

Gap:

- None in the boundary enforcement itself. The gap is conceptual and future-facing only: the narrative boundary is enforced today; what is not yet present is the LoreMaster-authored narrative content and the act-grouping layer that would sit on top of the existing story model.

Exact references:

- `packages/engine/test/boundaries.test.ts` (line 23)
- `docs/design.md`
- `docs/engine-split.md`

Acceptance-test verifiability:

- Verifiable today through the existing boundary test. The design authority is documented, not speculative.

## 7. Web / Android entry points

Status: **verified as present; Android build/publish not verified green this session**.

What exists:

- Web app entry: `games/openworld/client/index.html` boots to `<script type="module" src="/src/main.ts">`. That entry imports `@openworld/runtime/src/game.ts` (`useWorker`) and then boots `packages/runtime/src/main.ts`. So the runtime is the real player entrypoint, and the game page hands the game to it.
- Vite setup: `games/openworld/client/vite.config.ts` configures `publicDir: '../public'` and `rollupOptions.input: { game, bosses, looks }`. The runtime player scaffold is `packages/runtime/play/index.html` plus `packages/runtime/play/main.ts`; the runtime’s own vite config is `packages/runtime/vite.config.ts`.
- Android: `android/app/src/main/assets/capacitor.config.json` is present with the same app id and web dir, and `capacitor.config.ts` exists at the repo root with `webDir: 'games/openworld/client/dist'`. So the Capacitor app artifact and its config are present.
- End-to-end confirmation: `tests/ui/game.spec.ts` already exercises the live title flow, including a `start(page)` helper that goes new → next step → new game → waits for `lsw.frame.player`. That is direct evidence that the cover/new-game/look path works in a real browser context.

Gap:

- The Android/Capacitor build and publish path is present as config, but it is not verified as passing in this session. The web entry path is verified as present and covered by UI tests; the Android side is verified as present in repo but not verified as build/publish green.
- No index.html/meta/manifest/favicon inspection was needed beyond the existing client `index.html` and the existing runtime player scaffold; those are the entry artifacts.

Exact references:

- `games/openworld/client/index.html`
- `games/openworld/client/src/main.ts`
- `packages/runtime/src/main.ts`
- `games/openworld/client/vite.config.ts`
- `packages/runtime/vite.config.ts`
- `packages/runtime/play/index.html`
- `packages/runtime/play/main.ts`
- `capacitor.config.ts`
- `android/app/src/main/assets/capacitor.config.json`
- `tests/ui/game.spec.ts`

Acceptance-test verifiability:

- Web entry and the title→new-game flow are verifiable through the existing UI tests. Android is present in repo, but its build/publish path needs its own verification separate from this audit.

## Summary of the important findings

- The Cover/save/start/settings contracts are all present and live. The real handoff surface is `Cover.latest()`, `CoverHandlers.start(slot, summary, options)`, the `saves.ts` slot/summary/list/export/import contracts, and the existing `cover.show()/cover.hide()` lifecycle in `main.ts`. Phase 1 is reuse/handoff, not a title-screen rewrite.
- Story-to-act is the main structural gap: the story engine is present, the content steps are present, but there is no first-class “act” entity, so current-act display and act artwork are a small missing metadata/UI contract.
- Artwork slots are verified for looks/portraits/sprites, but there is no verified act_cover or act-artwork slot in this repo; the blueprint’s act-art claim is partly a Dreamville reference-clone claim, not an in-repo artifact.
- The character creator is present and already usable; the only Phase 1 question is how the shell feeds it and preserves player edits.
- Species is not present in the look contract today; the look record is bodies/slots/parts/colors plus the dresser. A species/lineage layer would be a future extension on top of the approved look record, not an existing capability.
- Narrative boundary enforcement is present: the boundary test at `packages/engine/test/boundaries.test.ts:23` and the design authority in `docs/design.md` hold the direction.
- Web and Android entry points are both present; web entry and the title→new-game flow are verified and covered by UI tests, while the Android/Capacitor build/publish path is present but not verified green this session.

## What this means for Phase 1

Phase 1 should be prepared as a shell and a documented Cover handoff built on top of the existing contracts above. It should not touch the game renderer, the pixel-creator core, existing saves, or `cover.ts`, and it should not assume a species field or an act-cover slot exists. The next concrete step after this audit is the Phase 1 design note, and implementation stays on hold until that design is complete.
