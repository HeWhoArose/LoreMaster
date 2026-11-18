# Phase 1 — Execution Log

The durable record of the Phase 1 implementation (docs/phase1-staged-implementation-plan.md §5). Read this first when
resuming: it names the baseline, the decisions, each stage's outcome, the evidence actually run, and what remains.

**Status: PARTIAL.** The shell, its screens, the save/start handoff and the creator handoff are implemented and verified
in a real browser. What is not demonstrated: a live model recommendation (no service was authorised or connected), act
cover artwork (contract only; no generator), the Android build (configuration only; no SDK run), and the existing
Playwright UI suite (needs a generated world plus browsers; not run in this session).

## Baseline (Stage 0)

- Branch `master`, HEAD `f32ace8b` (`docs: add sequential Phase 1 implementation plan`), remote `origin/master`.
- Working tree clean except the unrelated untracked `nah_italic_report.json` (preserved untouched).
- Package manager: npm workspaces (root `package.json`). Scripts used: `npm run typecheck`, `npx tsc -p <project>`,
  `npx vitest run <file>`, `npx vite build --configLoader runner` (from `games/openworld/client`).
- The three authorities are unchanged: `docs/roadmap.md` (OpenWorld technical roadmap) is not edited, the product
  blueprint is unchanged, and `docs/loremaster-roadmap.md` remains the programme tracker.

### Verified implementation-critical contracts

| Contract | Where |
| --- | --- |
| Shell page entry | new `games/openworld/client/shell.html` → `src/shell/main.ts` (the game's page `index.html` is unchanged) |
| Game definition handover | `games/openworld/client/src/register.ts` (`useGame(CLIENT_GAME)`) |
| Save slots and summaries | `packages/runtime/src/saves.ts` (`listSlots`, `readSlot`, `SlotData`, `SLOTS`) |
| Worker start payload | `packages/runtime/src/protocol.ts` (`init` with `save`/`look`/`start`/`difficulty`) |
| Title screen and its callbacks | `packages/runtime/src/ui/cover.ts` (`CoverHandlers`, `NewGame`, `show`, `hide`) |
| Runtime handoff and teardown | `packages/runtime/src/main.ts` (`startSlot`, `cover`, `ready` teardown, `send({t:'save'})`) |
| The existing creator | `packages/runtime/src/ui/creator.ts`, opened by the title's new-game look step |
| Look table | `games/openworld/content/src/looks.ts` (`LOOK_TABLE`, `LOOK_PARTS`, `PLAYER_LOOK`) |
| Web/Android packaging | `capacitor.config.ts`, `android/app/src/main/assets/capacitor.config.json` (`webDir: games/openworld/client/dist`) |

### Decisions made at Stage 0

1. **Boot model (open dependency §9.8 of the design note).** The shell is its own page (`shell.html`) in the same web
   build, not a rewrite of the game page's first paint. The game's page keeps its boot, its Cover and its worker exactly
   as they are, so the existing UI tests and the Android `webDir` are unaffected. The shell's play actions navigate to
   `./index.html`, so there is one runtime and one save path.
2. **Shell → Cover handoff (design note §6).** The shell does not reach into `main.ts`'s `cover` instance. It leaves a
   small one-shot record (`packages/runtime/src/shellHandoff.ts`) which the game page takes at boot; the page then uses
   its own start path. `CoverHandlers` is unchanged; `Cover` gained an optional constructor argument
   (`CoverOptions { look?, panel? }`) so the recommended look opens in the existing creator.
3. **Resume (design note §5).** Resume is the same start the title's Continue takes: `startSlot(slot, data)` — the
   function the cover's `start` handler now delegates to. No second save store, no duplicated start plumbing.
4. **Story → slot (design note §5, §9.2).** A save slot *is* a story run. The library lists the existing three slots
   and their `SaveSummary`; it never keeps a parallel copy of slot state.
5. **Current act (design note §9.3).** There is no engine act entity, so acts are application metadata
   (`contracts.ts`), resolved from the save's own `summary.day`. The thresholds are a first curated approximation;
   authored milestones replace them when the content names them. Before the first act, no act is shown.
6. **AI availability and consent (design note §9.5).** The shell has a `Recommender` seam. The offline rule set is
   deterministic and needs explicit player consent when no model service is connected (`?ai=<url>` names one); there is
   no silent fallback. Automated tests use the offline recommender, never a live service.
7. **Image generation (design note §9.6).** No generator is wired. The `act_cover` slot is defined as a contract
   (`contracts.ts`), and the shell falls back to its own treatment when no artwork exists.
8. **Post-game return path (design note §9.1).** Unchanged and game-owned: the death screen, the menu's new-game action
   and tutorial completion all return to the game's own title. The shell is re-entered by opening `shell.html`. This keeps
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

### Browser checks (Chromium, dev server, `http://127.0.0.1:5199`)

1. **Opening.** With no save and `loremaster:opened` cleared: `data-route="opening"`, `h1` "LoreMaster", buttons
   `Enter`/`Skip`; `Enter` reaches `home`. Screenshot `docs/phase1-shell-opening.png`.
2. **Home, first run.** `data-route="home"`, featured card reads "No story yet", Discover shows OpenWorld. Screenshot
   `docs/phase1-shell-home.png`.
3. **Navigation.** Library → "Library", Discover → "Discover worlds", Settings → "Settings", Home → home; no horizontal
   overflow at 390 px width.
4. **Narrow layout.** At 390×780: `scrollWidth` 373 (no overflow), no button under 40 px tall (44 px targets hold),
   cards stack one per row.
5. **Recommendation → existing creator (the one end-to-end flow).** Typed "A young woman with cropped silver hair, a
   scar, a travelling coat and tall boots"; consented to the offline recommendation (no AI service connected); got
   `hair.cropped`, `mark.scar`, `outfit.oilcloth`, `shoes.boots`, hair colour `silver`, body `woman`, no look-table
   problems, and the world's own sentence "a woman, cropped silver hair, bright amber eyes, a scar across the cheek, a
   teal oilcloth coat, dark brown ankle boots". "Continue to the character creator" opened `index.html`, whose own Cover
   opened its new-game panel with the existing pixel creator showing exactly that look and those words.
6. **New game through the existing flow.** "Next" reached the journey step (difficulty cards, three slots, Import,
   Creative workshop, "Slot 1 · Normal"); "Begin adventure" started the game (cover hidden, canvas and HUD live), which
   wrote slot 1.
7. **Library reads the existing save.** Back on the shell: featured card read
   "The Five Seals · Act I — The First Seal / Cloudtop · day 1 13:00 · Lv 1 / Slot 1 · saved Nov 18 / Resume story" —
   summary from `saves.ts`, act from the metadata contract.
8. **Resume.** "Resume story" navigated to `index.html` and the game came up on the saved slot (cover hidden, canvas
   live) — through `startSlot`, the same path the title's Continue uses.

Bug found and fixed during these checks: the shell's ink colour was declared only on `body`, where the design tokens do
not exist, so text fell back to black on the dark surface. The tokens' owner (`.lm-root`) now sets `color` and
`font-family`, and the body keeps literal fallbacks. Re-checked: `.lm-open-title` computes `rgb(238, 240, 248)`.

### Not run

- `npm run test:ui` (Playwright): needs `npm run gen:world` and installed browsers; not run in this session.
- A live model recommendation: no service was named or authorised; only the offline recommender was exercised.
- An Android build (`cap sync` / Gradle): no SDK run was attempted. `capacitor.config.ts` and
  `android/app/src/main/assets/capacitor.config.json` still point at `games/openworld/client/dist`, which now contains
  `shell.html`, so the shell ships in the same artifact the game does.

## Acceptance status (docs/phase1-design-specification.md §14)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Opening shows the shell's branding; the game's title screen stays reachable | demonstrated (browser) |
| 2 | Navigation works on desktop and a mobile viewport | demonstrated (390 px, no overflow) |
| 3 | Settings gateway reaches the game's settings without merging surfaces | demonstrated by design: the gateway opens the game's own title, where its settings live |
| 4 | An existing save summary appears in the library | demonstrated (browser) |
| 5 | Resume restarts through the existing start contract | demonstrated (browser) |
| 6 | Export/import still work | retained untouched in the title screen; not re-clicked in this session |
| 7 | New game still reaches the existing two-step flow and creator | demonstrated (browser) |
| 8 | A recommendation is rendered by the existing creator | demonstrated (browser) |
| 9 | Player edits survive a later recommendation | unit-tested (`applyPins` keeps unnamed fields); not re-clicked in the browser |
| 10 | AI-unavailable fallback is consent-gated | demonstrated: the gate disables Recommend until consented |
| 11 | The flow works in the web build used by desktop and mobile | demonstrated in the dev build; production build emits the shell |
| 12 | Android packages the same web build | configuration verified; build not run |
| 13 | `cover.ts` is not removed or bypassed; contracts still work | demonstrated (the title still runs its own flow) |
| 14 | Current-act display uses the metadata contract, not an engine act entity | demonstrated (act label from `contracts.ts`) |
| 15 | Species-aware appearance is marked approximate | demonstrated (the create screen says so) |

## Remaining work / limitations

1. **Live AI recommendation.** The `Recommender` seam and the model-backed implementation exist and validate every id,
   but no service was connected. Acceptance for a real model run still needs an authorised endpoint and a recorded
   prompt/reply.
2. **Act covers.** `ACT_COVER` is a contract; no artwork exists and no generator is wired. Cards fall back to the shell's
   own treatment.
3. **Act thresholds.** `fromDay` 1–5 is a curated approximation. Authored milestones (story facts or quest stages) should
   replace it when the content names them.
4. **Post-game return.** Still game-owned by decision 8; a shell return is not implemented.
5. **Android build.** Configuration only. Run `npx cap sync android` and a Gradle build on a machine with the SDK before
   claiming Android support.
6. **Existing UI suite.** `npm run test:ui` was not run; the repo's Playwright specs still need a pass against this build.
7. **Checkpoint granularity.** Stages 1–7 share one commit, as noted above.

## Recovery

```bash
git log --oneline -4         # f730eb5d (stage 0), 06a2ddc0 (stages 1-7), then this closeout
npm run typecheck
npx vitest run games/openworld/client/test/shell.test.ts
cd games/openworld/client && npx vite --port 5199    # then open /shell.html
```

The shell's contract lives in `games/openworld/client/src/shell/contracts.ts`; the game-side seam is
`packages/runtime/src/shellHandoff.ts` plus `startSlot`/`CoverOptions` in `packages/runtime/src/{main,ui/cover}.ts`.
