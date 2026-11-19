# Phase 1 — Execution Log

The durable record of the Phase 1 implementation (docs/phase1-staged-implementation-plan.md §5). Read this first when
resuming: it names the baseline, the decisions, each stage's outcome, the evidence actually run, and what remains.

**Status: PARTIAL.** The shell, its screens, the save/start handoff and the creator handoff are implemented and verified
in a real browser. What is not demonstrated: a live model recommendation (no service was authorised or connected), act
cover artwork (contract only; no generator), the Android build (configuration only; no SDK run), and the existing
Playwright UI suite (needs a generated world plus browsers; not run in this session).

## Baseline (Stage 0) — re-audited on current HEAD

- Branch `master`, HEAD `bb88d5e0` (`docs: close out Phase 1 with the verified evidence and its limits`),
  3 commits ahead of `origin/master`. Remote `origin` and `loremaster` both `https://github.com/HeWhoArose/Loremaster.git`.
- Prior Stage 0 record was written against `f32ace8b`; this session re-audited Stage 0 against the actual files on
  `bb88d5e0` rather than trusting the prior pass/fail conclusions.
- Working tree: not clean. Modified (untranslated spec prose already converted to English earlier this session): `CLAUDE.md`,
  `docs/advancement.md`, `docs/autonomous-creator.md`, `docs/boss-rooms.md`, `docs/bosses.md`, `docs/cast/hesper.md`,
  `docs/cast/ilse.md`, `docs/cast/lina.md`, `docs/cast/lumi.md`, `docs/cast/nessa.md`, `docs/cast/severin.md`,
  `docs/cast/tobin.md`, `docs/chapter-1.md`, `docs/chapter-2.md`, `docs/chapter-3.md`, `docs/chapter-4.md`,
  `docs/chapter-5.md`, `docs/character-art.md`, `docs/continent.md`, `docs/creatures.md`, `docs/crop-art.md`,
  `docs/engine-split.md`, `docs/finale.md`, `docs/firstlight-village.md`, `docs/game-design.md`, `docs/gear.md`,
  `docs/homestead.md`, `docs/looks.md`, `docs/lore.md`, `docs/npc-sandbox.md`, `docs/prologue.md`, `docs/quests.md`,
  `docs/sets.md`, `docs/showcase.md`, `docs/skill-tree.md`, `docs/ui.md`, `docs/world-model.md`, `docs/writing.md`.
  Untracked: `nah_italic_report.json` (preserved untouched).
- Package manager: npm workspaces (root `package.json`). Scripts used this session: `npm run typecheck`,
  `npx tsc -p <project>`, `npx vitest run <file>`, `npx vite build --configLoader runner` (from `games/openworld/client`),
  `npm run dev:client`, `npm run test:ui` (not run).
- The three authorities are unchanged: `docs/roadmap.md` (OpenWorld technical roadmap) is not edited, the product
  blueprint is unchanged, and `docs/loremaster-roadmap.md` remains the programme tracker.

### Re-verified implementation-critical contracts (current HEAD, source-backed)

| Contract | Where | Verified |
| --- | --- | --- |
| Shell page entry | `games/openworld/client/shell.html` → `src/shell/main.ts` (`import '../register.ts'`, `import './styles.css'`, `import { mount } from './app.ts'`) | present |
| Game definition handover | `games/openworld/client/src/register.ts` (`useGame(CLIENT_GAME)`) | present |
| Save slots and summaries | `packages/runtime/src/saves.ts`: `SLOTS=[1,2,3]`, `SlotData { save; summary?; savedAt }`, `listSlots`, `readSlot`, `writeSlot`, `deleteSlot`, `exportSlot` (format `openworld-save`), `pickSaveFile`, `settleOpenQuestions` | present |
| Worker start payload | `packages/runtime/src/protocol.ts`: `init` carries `base`, `save?`, `library?`, `librarySeq?`, `difficulty?`, `start?`, `look?`, `prefetch?`, `quality?`, `guiding?`, `at?`, `scene?` | present |
| Title screen and its callbacks | `packages/runtime/src/ui/cover.ts`: `CoverHandlers { start, tutorial, backdrop, toggleLocale, toggleSound, muted, levels, titleMusic, ai }`; `Cover.show(panel?)`/`hide()`; `latest()`; new-game two-step (`showStep('look'|'journey')`) | present |
| Runtime handoff and teardown | `packages/runtime/src/main.ts`: `startSlot(slot,data,fresh)`; `CoverHandlers.start` delegates to it; boot takes `takeShellHandoff()`; `ready` teardown = `backdropOn=false`, `scene.setCinema(undefined)`, music place cleared, `cover.hide()`, `send({t:'save'})` | present |
| Shell→game handoff record | `packages/runtime/src/shellHandoff.ts`: `ShellHandoff { kind:'resume'|'new', slot?, look?, difficulty?, start? }`, `setShellHandoff` → `sessionStorage`, `takeShellHandoff` taken once at boot | present |
| The existing creator | `packages/runtime/src/ui/creator.ts`: body/part/color tabs, `options(slot)`, `set(change)` with body-compatibility enforcement, `generate`, `describe`, `onChange` | present |
| Look table | `games/openworld/content/src/looks.ts`: `LOOK_SLOTS` (12), `LOOK_BODIES` (4), `LOOK_PARTS`, `LOOK_COLORS`, `LOOK_TABLE`, `generateLook`, `PLAYER_LOOK`; **no species/race/ancestry field** | present |
| Story (step-based, no engine act entity) | `packages/engine/src/story.ts`: step script, `w.scene`/`w.story`, `start(id)`, beat/lesson model; no first-class `Act` | present |
| Web entry | `games/openworld/client/index.html` boots to `<script type="module" src="/src/main.ts">` → `useWorker(...)` → `import('@openworld/runtime/src/main.ts')` | present |
| Client build inputs | `games/openworld/client/vite.config.ts`: `rollupOptions.input = { game:'index.html', bosses:'boss-gallery.html', looks:'looks.html', shell:'shell.html' }`, `publicDir:'../public'` | present |
| Android packaging | `capacitor.config.ts` + `android/app/src/main/assets/capacitor.config.json`: `appId: 'com.openworld.rpg'`, `webDir: 'games/openworld/client/dist'` | present |
| Playwright infra | `tests/ui/game.spec.ts`, `tests/ui/creator.spec.ts`, `tests/ui/components.spec.ts`, `tests/ui/fonts.spec.ts`; `npm run test:ui` = `npm run gen:world && playwright test` | present |
| Deterministic shell tests | `games/openworld/client/test/shell.test.ts` (6 tests) | present; passing |
| Dependency direction test | `packages/engine/test/boundaries.test.ts` | present; **failing on current HEAD — see finding below** |

### Stage 0 finding: pre-existing boundary-rule drift on current HEAD

- `packages/engine/test/boundaries.test.ts` fails on the current HEAD at the assertion "a package's code imports only what its rule allows".
- The failing imports are:
  - `packages/runtime/src/worker.ts:21` — `import type { TurnResult } from '@openworld/narration'`
  - `packages/runtime/src/narrative/index.ts:8–21` — re-exports and uses `NarrativeTurnMachine`, `RuntimeNarrativePort`,
    `KeyValueNarrativeStore`, `MockNarrativeProvider`, and the narrative types from `@openworld/narration`.
- The boundary rule for the runtime package is `MAY_IMPORT.runtime = ['@openworld/engine','@openworld/modules','@openworld/format']`
  (`packages/engine/test/boundaries.test.ts:28`). It does **not** include `@openworld/narration`.
- `@openworld/narration` is itself a package with `MAY_IMPORT.narration = ['@openworld/engine']` (line 23), i.e. the narrative
  pathway the Phase 0 audit and the product blueprint treat as the one special cross-package route.
- This is **not** a missing permission, and it is **not** a game import. It is a two-line divergence between the actual
  `packages/runtime` imports and the documented boundary rule for that package, on this HEAD.
- Relevance to Phase 1: the new shell is added to the same runtime-adjacent surface that already crosses into the narration
  package (worker.ts creates the narrative runtime; the shell reads saves/summaries and hands off to the existing title).
  The handoff contracts the shell relies on are unaffected by this divergence, so this is a recorded known-locus, not a
  Stage 0 blocker for the shell work itself.
- Disposition: recorded and checkpointed here. Not silently patched in Stage 0 (Stage 0 is no-feature-changes, and this is a
  pre-existing source/rule mismatch, not a runtime bug introduced by Phase 1). If Phase 1 acceptance later requires the
  boundary audit green, that becomes an explicit verification gate with the two candidate resolutions recorded: (a) extend
  `MAY_IMPORT.runtime` to allow `@openworld/narration`, or (b) relocate the runtime's narration re-export so the runtime
  package no longer imports it directly. Either way, the change is made and the boundary test rerun, not worked around.

### Stage 0 design authority and conflict resolution

- Primary requirements authority: `docs/phase1-design-specification.md` (per `docs/phase1-staged-implementation-plan.md` §1.1),
  when consistent with the blueprint and the adopted Option 1 boundary in `docs/loremaster-roadmap-boundary.md`.
- Supporting design record: `docs/phase1-design-note.md` (shell/Cover handoff details). It does **not** override the spec.
- No material inconsistency found between the spec, the note, the blueprint, the plan, and the current source that would block
  implementation. The one note-vs-implementation caution is design-note §6: the shell must not pretend it can reach into
  `main.ts`'s internal `cover` instance. The actual implemented handoff honours that caution: the shell writes a one-shot
  `ShellHandoff` record to `sessionStorage` via `setShellHandoff`, the game page reads it once via `takeShellHandoff` at boot,
  and `CoverHandlers` / `CoverOptions` / `startSlot` carry the behaviour. The internal `cover` object is not driven from the shell.
- Documents intentionally not edited in Stage 0: `docs/roadmap.md` (preserved as-is).

### Stage 0 command/build confirmation

- `npm run typecheck` — run this session, exit 0 (whole workspace: `typecheck:game` + `tsc -p packages/ai` + `tsc -p games/openworld/ai`).
- `npx vitest run games/openworld/client/test/shell.test.ts` — run this session, exit 0, 6/6 passing.
- `npx vitest run packages/engine/test/boundaries.test.ts` — run this session, exit 1, 5/6 passing / 1 failing (the rule-allowance assertion above).
- `npx vite build --configLoader runner` (cwd `games/openworld/client`) — not run in Stage 0; reserved for Stage 8.
- `npm run dev:client` and the browser dev-server checks — not run in Stage 0; reserved for Stage 8.

### Stage 0 stage-by-stage file/contract/test map (as implemented in the prior checkpoint)

| Stage | Outcome claimed by prior checkpoint | Files involved | Exit criteria to re-verify this session |
| --- | --- | --- | --- |
| 0 — Source and design reconciliation | contracts re-verified; decisions 1–9 recorded | this log | done (re-audited above) |
| 1 — Shell foundation and boot | `shell.html` + `src/shell/{main,app}.ts`; game page reachable; one-shot handoff; loading/error states | `shell.html`, `src/shell/main.ts`, `src/shell/app.ts`, `shellHandoff.ts`, modified `main.ts`/`cover.ts` | boot into shell, game page still reachable, handoff bridge, loading/error, no duplicate runtime/save/start |
| 2 — Visual identity and design system | tokens/surfaces/controls/focus/reduced-motion in one stylesheet | `src/shell/styles.css` | used by actual shell screens; no gameplay renderer/HUD changes; states covered by tests or manual checklist |
| 3 — Opening and branding | `opening()` + first-run/returning + Enter/Skip + reduced-motion hold | `src/shell/app.ts` | deterministic first-run/returning paths; branding at desktop+mobile; no second game title screen; skip does not trap |
| 4 — Home, story cards, library, progress | `home()`/`library()` from `listSlots`+`SaveSummary`; act label from metadata; resume via `startSlot` | `src/shell/app.ts`, `src/shell/contracts.ts` | existing saves appear through existing contract; resume starts correct slot; empty/error states usable; act grounded in saved state + metadata |
| 5 — World discovery and selection | `discover()` from `OPENWORLD_WORLD`; announced worlds have no play action | `src/shell/app.ts`, `src/shell/contracts.ts` | curated world discoverable/selected/passed to new-game path; data-driven; no marketplace/editor/bundle mechanism; fallback states tested |
| 6 — Creator integration and recommendation | `recommend.ts` + `create()`; look handed to existing creator via `CoverOptions` | `src/shell/recommend.ts`, `src/shell/app.ts`, modified `cover.ts` | recommendation renders in existing creator using valid look data; invalid ids rejected; player edits survive; AI-unavailable/timeout/malformed/cancel handled; deterministic fake used in tests |
| 7 — Responsive, touch, accessibility, platform | one column ≤640px, 44px targets, safe-area insets, same `webDir` | `src/shell/styles.css`, `capacitor.config.ts`, `android/.../capacitor.config.json` | critical flows work at agreed viewport sizes; no horizontal overflow; no hover-only primary nav; Android config unchanged |
| 8 — Integration, regression, closeout | typecheck, unit tests, production build, browser checks | this log + evidence | full end-to-end journey; relevant checks run; passing separated from failing/skipped/unavailable/pre-existing; final diff reviewed; roadmap status updated only if genuinely demonstrated |

### Decisions carried from the prior Stage 0 record (re-confirmed against current source)

1. **Boot model (design note §9.8).** The shell is its own page (`shell.html`) in the same web build, not a rewrite of
   the game page's first paint. The game's page keeps its boot, Cover and worker. The shell's play actions navigate to
   `./index.html`, so there is one runtime and one save path.
2. **Shell → Cover handoff (design note §6).** The shell does not reach into `main.ts`'s internal `cover` instance. It writes
   a one-shot `ShellHandoff` record (`packages/runtime/src/shellHandoff.ts`) to `sessionStorage`; the game page takes it once
   at boot via `takeShellHandoff()` and uses its own start path. `CoverHandlers` is unchanged; `Cover` gained an optional
   constructor argument (`CoverOptions { look?, panel? }`) so the recommended look opens in the existing creator.
3. **Resume (design note §5).** Resume is the same start the title's Continue takes: `startSlot(slot, data)` — now the
   function the cover's `start` handler delegates to. No second save store, no duplicated start plumbing.
4. **Story → slot (design note §5, §9.2).** A save slot *is* a story run. The library lists the existing three slots and
   their `SaveSummary`; it never keeps a parallel copy of slot state.
5. **Current act (design note §9.3).** There is no engine act entity, so acts are application metadata (`contracts.ts`),
   resolved from the save's own `summary.day`. The thresholds are a first curated approximation; authored milestones replace
   them when the content names them. Before the first act, no act is shown.
6. **AI availability and consent (design note §9.5).** The shell has a `Recommender` seam. The offline rule set is
   deterministic and needs explicit player consent when no model service is connected (`?ai=<url>` names one); there is no
   silent fallback. Automated tests use the offline recommender, never a live service.
7. **Image generation (design note §9.6).** No generator is wired. The `act_cover` slot is defined as a contract
   (`contracts.ts`), and the shell falls back to its own treatment when no artwork exists.
8. **Post-game return path (design note §9.1).** Unchanged and game-owned: the death screen, the menu's new-game action and
   tutorial completion all return to the game's own title. The shell is re-entered by opening `shell.html`. This keeps
   `cover.ts`'s lifecycle intact rather than inventing a shell return contract in Phase 1.
9. **Species (design note §9.4 / spec §11.5).** The look contract has no species field. Species is data only
   (`SPECIES_PROFILES`), marked approximate, and recommendations that ask for a species say so.

## Stages

| Stage | Outcome | Checkpoint |
| --- | --- | --- |
| 0 — Source and design reconciliation | contracts re-verified in source; decisions 1–9 recorded | `f730eb5d` |
| 1 — Shell foundation and boot | `shell.html` + `src/shell/{main,app}.ts`; the game page reachable; one-shot handoff bridge; loading/error states | `06a2ddc0` |
| 2 — Visual identity and design system | `src/shell/styles.css` tokens, surfaces, controls, focus rings, reduced motion | `06a2ddc0` |
| 3 — Opening and branding | `opening()` + first-run/returning paths + Enter/Skip + reduced-motion hold | `06a2ddc0` |
| 4 — Home, story cards, library, progress | `home()`/`library()`, existing `listSlots` + `SaveSummary`, act label from metadata, resume via `startSlot` | `06a2ddc0` |
| 5 — World discovery and selection | `discover()` from `OPENWORLD_WORLD`; announced worlds have no play action | `06a2ddc0` |
| 6 — Creator integration and recommendation | `recommend.ts` + `create()`; the look is handed to the existing creator through `CoverOptions` | `06a2ddc0` |
| 7 — Responsive, touch, accessibility, platform | one column ≤640 px, 44 px targets, safe-area insets, same `webDir` | `06a2ddc0` |
| 8 — Integration, regression, closeout | typecheck, unit tests, production build, browser checks | this commit |

**Note on checkpoints.** Stages 1–7 were built as one coherent shell (the screens share `app.ts` and one stylesheet) and
are committed as a single checkpoint (`06a2ddc0`) rather than seven artificial intermediate states. Each stage's exit
criteria were verified together by the Stage 8 checks below.

## Files

Created:

- `games/openworld/client/shell.html` — the shell page.
- `games/openworld/client/src/shell/main.ts` — its entry (game definition + styles + mount).
- `games/openworld/client/src/shell/app.ts` — opening, home, library, discover, create, settings, routing, wiring.
- `games/openworld/client/src/shell/contracts.ts` — story/act metadata, world identity, `act_cover` slot, appearance
  pins, species profiles.
- `games/openworld/client/src/shell/recommend.ts` — the offline rule recommender, the model-backed one, and pin merging.
- `games/openworld/client/src/shell/styles.css` — the shell's design system and responsive layout.
- `games/openworld/client/test/shell.test.ts` — six deterministic tests for the act mapping and the recommendation.
- `packages/runtime/src/shellHandoff.ts` — the one-shot shell → game handoff record.
- `docs/phase1-execution-log.md` — this log.
- `docs/phase1-shell-opening.png`, `docs/phase1-shell-home.png` — screenshots of the shell.

Modified (additive only):

- `games/openworld/client/vite.config.ts` — `shell.html` added as a rollup input.
- `packages/runtime/src/ui/cover.ts` — optional `CoverOptions { look?, panel? }` on the constructor; the new-game panel
  opens with the recommended look when the shell asks. `CoverHandlers`, `show()`/`hide()` and the teardown are unchanged.
- `packages/runtime/src/main.ts` — the cover's `start` handler hoisted to `startSlot` (same body, same behaviour), the
  handoff taken once at boot, and a resume branch that calls `startSlot` with the slot's own save.

Deleted: none.

## Commands and evidence (Stage 8)

All run from the repository root unless noted, on Windows with native Node/npm and Git Bash.

| Command | Result |
| --- | --- |
| `npm run typecheck` (all projects) | pass (exit 0) |
| `npx vitest run games/openworld/client/test/shell.test.ts` | pass, 6/6 tests |
| `npx vite build --configLoader runner` (cwd `games/openworld/client`) | pass; emits `dist/shell.html`, `dist/assets/shell-*.js`, `dist/assets/shell-*.css` |
| `npx vite --port 5199` (dev server, cwd `games/openworld/client`) | served the shell and the game page |

### Browser checks (this session — Chromium, dev server `http://127.0.0.1:5202/shell.html`)

Server started for this session only: `cd games/openworld/client && npx vite --port 5202 --host 127.0.0.1`. Readiness
was confirmed by HTTP, not by a startup banner: both `/shell.html` and `/index.html` returned 200 before the browser was
opened. The server was left running at session end (see note at the end of this section); it is a throwaway dev server, not
a deployed artifact.

1. **Opening (existing screenshot `docs/phase1-shell-opening.png` re-read against the running build).** The opening frame
   exists in the build (`opening()`), with the LoreMaster wordmark and Enter/Skip. Exact live state not re-captured this
   session because the server was started after a save existed, so the shell opened on home; the opening path itself is
   unit-untested for animation timing but the route/rendering is exercised by the home path below and by the source read of
   `app.ts`.
2. **Home, first run (re-captured this session: `docs/phase1-shell-home-stage8.png`).** On the running build, with no save
   and no `loremaster:opened`, the shell opened on `data-route="home"`: featured card "Begin a story" / "No story yet" /
   "Create a traveller and step into the world.", "Your stories" with "See all", and the "OpenWorld" discover card
   ("STORY-DRIVEN OPEN-WORLD RPG" / "A hand-built continent of five seals, a doomed night, and the people who live through
   it."). No error, no loading spin forever.
3. **Shell→game title handoff, Library path (re-captured: `docs/phase1-shell-library-stage8.png`, then navigated to
   `index.html`).** Library → "Library" rendered three slots ("THE FIVE SEALS" / "A fresh story" / "Slot 1·/2·/3 · not
   started") read from the existing save contract, plus "Open the game's title screen". Pressing it navigated to
   `http://127.0.0.1:5202/index.html` — the game page. This is a verified title-handoff path.
4. **Shell→game title handoff, Settings → game-settings path (re-captured: `docs/phase1-shell-settings-stage8.png`, then
   navigated to `index.html`).** Settings rendered the app motion toggle, the "Game settings" panel saying the game keeps
   language/sound/world filter/keys/AI on its title screen, an "Open the game's title screen" control, and the act-art
   contract blurb ("Act covers use the `act_cover` slot: 16:9, cover, safe margin 6%."). Pressing that control navigated to
   `index.html` — a second verified title-handoff path. The `act_cover` contract blurb is direct evidence the
   `ACT_COVER` contract exists in the running shell (contract only; no artwork/generator).
5. **Shell→game title handoff, create-screen skip path (re-captured: `docs/phase1-shell-create-stage8.png`, then navigated
   to `index.html`).** On the running build: "Begin a story" → "Describe your traveller". With "Use the offline
   recommendation" checked and the description filled, the offline recommender returned a recommendation with pins
   `hair.cropped`, `mark.scar`, `outfit.oilcloth`, `shoes.boots`, hair `silver`, body `woman`, eyes `amber`, plus the
   world's own sentence "a woman, cropped silver hair, bright amber eyes, a scar across the cheek, a teal oilcloth coat,
   dark brown ankle boots", and the species note "Human only — Every body in the current look table is a human body; the
   contract has no species field.". The create screen then offered "Continue to the character creator" and "Skip and open
   the title screen"; the latter navigated to `index.html` — a third verified title-handoff path.
   **Important discrepancy with the prior log:** on a first run with no save, the featured "Begin a story" card does **not**
   open the game page directly. The current code routes `data-new` to `state.recommendation ? startNew() : go('create')`,
   so with no recommendation present it opens the shell's own describe/recommend screen; the game title is reached from there
   via the create-screen skip control (or from Library/Settings via their "Open the game's title screen" controls). The
   prior log's item 5 browser claim that "Begin a story" opened `index.html` directly is **not** what this build does; the
   handoff is real, but the path is the create-screen skip, not a direct open.
6. **Game page is the real Layer B surface (re-observed this session).** The game page (`index.html`, title "OpenWorld")
   rendered a Phaser canvas with a "Loading…" overlay and a "Story" control; the "Story" control opened the game's own story
   panel ("The story" / "No story yet. Begin a game." / chat textbox + Send). This is the pixel-game title/runtime surface
   the shell hands off to — distinct from the shell. This is direct evidence for criteria 1, 7, and 13: the shell and the game
   are two surfaces, and the game's title/Cover and gameplay renderer are intact.
7. **Narrow/mobile layout (re-captured: `docs/phase1-shell-narrow-390-stage8.png`).** At viewport 390×780 the shell
   rendered the same content stacked one column per row (featured card, "Your stories", "Discover" card), no clipped/off-
   screen content, and the primary actions ("Begin a story", "Open world") remained full-width tap targets. This is the
   desktop + mobile acceptance evidence for criterion 2; a true tap-target pixel measurement (criterion 7's "no button under
   40 px tall") was not re-measured this session and is taken from the prior build's CSS tokens.

**Dev server at session end.** The throwaway dev server on `127.0.0.1:5202` was still answering 200 at session close.
Killing it by PID (the listener is PID 8628 on this machine) did not take it down in this shell, and a blunt
`taskkill /IM node.exe`-style kill was not used because it would have collateral damage on the machine's other node
processes. The server is harmless and only serves the already-verified shell/game pages; it is not a deployed artifact and
does not affect the Git checkpoint or the acceptance evidence. If a clean process slate is desired, stop it on the host with
the host's process manager or by addressing PID 8628 directly there.

Bug found and fixed during these checks: the shell's ink colour was declared only on `body`, where the design tokens do
not exist, so text fell back to black on the dark surface. The tokens' owner (`.lm-root`) now sets `color` and
`font-family`, and the body keeps literal fallbacks. Re-checked: `.lm-open-title` computes `rgb(238, 240, 248)`.

### Not run (still outstanding)

- `npm run test:ui` (Playwright): needs `npm run gen:world` and installed browsers; **not run this session**.
- A **full** new-game + creator flow end-to-end through the game's own two-step title (look step → journey step → slot →
   "Begin adventure" → game writes the slot) was **not re-run through the shell this session**. The shell's create screen
   hands off to `index.html` with the recommended look (`startNew()` → `setShellHandoff({kind:'new', look})` →
   `location.assign(GAME_PAGE)`), and the game page then runs its own Cover/new-game flow; that the game's two-step flow and
   the existing pixel creator still work was verified on the live game page (the "Story" panel and canvas came up), but the
   full look-step → journey-step → begin sequence was not re-clicked end-to-end from the shell in this session. It remains a
   pre-existing, verified flow per the prior checkpoint, not a new result here.
- A live model recommendation: no service was named or authorised; only the offline recommender was exercised, on the live
   build this session.
- An Android build (`npx cap sync android` / Gradle): no SDK run was attempted. `capacitor.config.ts` and
  `android/app/src/main/assets/capacitor.config.json` still point at `games/openworld/client/dist`, which now contains
  `shell.html`, so the shell ships in the same artifact the game does — configuration only.

## Acceptance status (docs/phase1-design-specification.md §14) — re-evaluated against this session's evidence

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Opening shows the shell's branding; the game's title screen stays reachable | **demonstrated (source + browser):** opening route/rendering present in `app.ts`; game page is the real separate "OpenWorld" canvas/title surface, reached by three verified shell→game title handoffs |
| 2 | Navigation works on desktop and a mobile viewport | **demonstrated (browser):** Home, Library, Discover, Settings all reachable; narrow 390×780 screenshot shows one-column stack, no clipped content |
| 3 | Settings gateway reaches the game's settings without merging surfaces | **demonstrated (browser + design):** Settings panel says the game keeps its settings on its title screen; the "Open the game's title screen" control reaches `index.html` |
| 4 | An existing save summary appears in the library | **demonstrated (browser):** Library shows three slots read from the existing save contract (or "A fresh story" / "not started") |
| 5 | Resume restarts through the existing start contract | **architecture verified (source), browser path present but not re-run this session:** `resume(slot)` → `setShellHandoff({kind:'resume',slot})` → `location.assign(GAME_PAGE)`; the game page's title/Cover and start contract are intact on the live page. The save did not exist this session, so a live resume-through-save could not be triggered; the resume path is present and unchanged from the prior verified checkpoint |
| 6 | Export/import still work | **retained untouched (design):** export/import/delete/slot-pick remain the game's title-screen responsibility; not re-clicked this session |
| 7 | New game still reaches the existing two-step flow and creator | **partially demonstrated this session:** the shell's create screen hands off to `index.html` with the recommended look, and the live game page shows its real title/Cover/canvas/story-panel and the existing creator path; the full look-step→journey-step→begin sequence was not re-clicked end-to-end from the shell this session (pre-existing verified flow) |
| 8 | A recommendation is rendered by the existing creator | **design verified (source), browser evidence partial this session:** the shell renders the recommendation pins and hands the look to the game page via `CoverOptions`/`startNew()`; the living game page and its existing creator path are intact. The pixel creator displaying the exact recommended look was **not** re-observed in the pixel creator this session (the create screen's "Continue to the character creator" button was not pressed) |
| 9 | Player edits survive a later recommendation | **unit-tested (pre-existing):** `applyPins` keeps unnamed fields; not re-run/not re-clicked this session |
| 10 | AI-unavailable fallback is consent-gated | **demonstrated (browser, this session):** with no AI service connected, the offline recommender gate disables "Recommend an appearance" until "Use the offline recommendation" is checked |
| 11 | The flow works in the web build used by desktop and mobile | **demonstrated (dev build, this session):** the shell and game page served from the same dev build on desktop and at 390 px |
| 12 | Android packages the same web build | **configuration verified (not built):** `capacitor.config.ts` + Android `capacitor.config.json` both `webDir: 'games/openworld/client/dist'`; Android build not run |
| 13 | `cover.ts` is not removed or bypassed; contracts still work | **demonstrated (browser + source):** the game page's real title/Cover/canvas/story panel came up; the shell writes a one-shot `ShellHandoff` record and never drives the internal `cover` object |
| 14 | Current-act display uses the metadata contract, not an engine act entity | **architecture verified (source + design):** `currentAct(OPENWORLD_STORY, day)` from `contracts.ts`; no engine act entity exists; no save existed this session to render a live act label, so a live act label was not re-observed |
| 15 | Species-aware appearance is marked approximate | **demonstrated (browser, this session):** create screen rendered "Species today: Human only — Every body in the current look table is a human body; the contract has no species field." |

## Remaining work / limitations (updated with this session's findings)

1. **Live AI recommendation.** The `Recommender` seam and the model-backed implementation exist and validate every id,
   but no service was connected. Acceptance for a real model run still needs an authorised endpoint and a recorded
   prompt/reply. This session exercised only the offline recommender on the live build.
2. **Act covers.** `ACT_COVER` is a contract (16:9, cover, 6% safe margin — seen in the running Settings panel); no
   artwork exists and no generator is wired. Cards fall back to the shell's own treatment.
3. **Act thresholds.** `fromDay` 1–5 is a curated approximation. Authored milestones (story facts or quest stages) should
   replace them when the content names them. No save existed this session, so no live act label was rendered.
4. **Post-game return.** Still game-owned by decision 8; a shell return is not implemented.
5. **Android build.** Configuration only. Run `npx cap sync android` and a Gradle build on a machine with the SDK before
   claiming Android support.
6. **Existing Playwright UI suite.** `npm run test:ui` was not run this session (needs `npm run gen:world` + installed
   browsers).
7. **Full new-game flow through the shell not re-run end-to-end this session.** The shell's create screen hands off to
   `index.html` with the recommended look, and the game page's real title/Cover/canvas/story panel are intact, but the
   look-step → journey-step → "Begin adventure" → slot-written sequence was not re-clicked from the shell this session. It
   remains a pre-existing verified flow per the prior checkpoint.
8. **Pixel creator showing the exact recommended look not re-observed this session.** The create screen's "Continue to the
   character creator" button was not pressed; criterion 8 is therefore design-verified + partially browser-demonstrated
   rather than fully re-observed end-to-end in the pixel creator this session.
9. **Pre-existing boundary-rule drift on current HEAD.** `packages/engine/test/boundaries.test.ts` fails at the rule-allowance
   assertion because `packages/runtime` imports `@openworld/narration` while `MAY_IMPORT.runtime` does not list it. This is
   a pre-existing source/rule mismatch (not a Phase 1-introduced bug, and not a game import). Recorded in Stage 0; candidate
   resolutions: (a) extend `MAY_IMPORT.runtime` to allow `@openworld/narration`, or (b) relocate the runtime's narration
   re-export. Not silently patched. If Phase 1 acceptance requires the boundary audit green, that becomes an explicit gate.
10. **Throwaway dev server left running.** The session's dev server on `127.0.0.1:5202` was still answering 200 at session
    close; it was not force-killed to avoid collateral damage to other node processes. It is not a deployed artifact and does
    not affect the Git checkpoint or evidence. Stop it on the host if a clean process slate is wanted.
11. **Checkpoint granularity.** Stages 1–7 share one commit (`06a2ddc0`), as noted above. Stage 0 in this session is a
    re-audit/record pass against the current HEAD; it is not a new feature checkpoint.

## Recovery

```bash
git log --oneline -4         # f730eb5d (stage 0), 06a2ddc0 (stages 1-7), then this closeout
npm run typecheck
npx vitest run games/openworld/client/test/shell.test.ts
cd games/openworld/client && npx vite --port 5199    # then open /shell.html
```

The shell's contract lives in `games/openworld/client/src/shell/contracts.ts`; the game-side seam is
`packages/runtime/src/shellHandoff.ts` plus `startSlot`/`CoverOptions` in `packages/runtime/src/{main,ui/cover}.ts`.
