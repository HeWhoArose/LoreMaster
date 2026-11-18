# Phase 1 — Execution Log

The durable record of the Phase 1 implementation (docs/phase1-staged-implementation-plan.md §5). Read this first when
resuming: it names the baseline, the decisions, each stage's outcome, the evidence actually run, and what remains.

## Baseline (Stage 0)

- Branch `master`, HEAD `f32ace8b` (`docs: add sequential Phase 1 implementation plan`), remote `origin/master`.
- Working tree clean except the unrelated untracked `nah_italic_report.json` (preserved untouched).
- Package manager: npm workspaces (root `package.json`). Scripts used: `npm run typecheck`, `npx tsc -p <project>`,
  `npx vitest run <file>`, and the client's own `vite build`.
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
   (`contracts.ts`), resolved from the save's own `summary.day`. The thresholds are a first curated approximation; authored
   milestones replace them when the content names them. When the day is before the first act, no act is shown.
6. **AI availability and consent (design note §9.5).** The shell has a `Recommender` seam. The offline rule set is
   deterministic and needs explicit player consent when no model service is connected (`?ai=<url>` names one); there is
   no silent fallback. Automated tests use the offline recommender, never a live service.
7. **Image generation (design note §9.6).** No generator is wired. The `act_cover` slot is defined as a contract
   (`contracts.ts`), and the shell falls back to its own treatment when no artwork exists.
8. **Post-game return path (design note §9.1).** Unchanged and game-owned: death screen, the menu's new-game action and
   tutorial completion all return to the game's own title. The shell is re-entered by opening `shell.html`. This keeps
   `cover.ts`'s lifecycle intact rather than inventing a shell return contract in Phase 1.
9. **Species (design note §9.4 / spec §11.5).** The look contract has no species field. Species is data only
   (`SPECIES_PROFILES`), marked approximate, and recommendations that ask for a species say so.

## Stages

| Stage | Outcome | Checkpoint |
| --- | --- | --- |
| 0 — Source and design reconciliation | contracts verified; decisions 1–9 recorded above | see `git log --grep 'phase 1 stage'` |
| 1 — Shell foundation and boot | `shell.html` + `src/shell/{main,app}.ts`; the game page reachable; handoff bridge | same checkpoint as 2–7 (see note) |
| 2 — Visual identity and design system | `src/shell/styles.css` tokens, surfaces, controls, focus, reduced motion | ditto |
| 3 — Opening and branding | `opening()` + first-run/returning paths + skip + reduced-motion hold | ditto |
| 4 — Home, story cards, library, progress | `home()`/`library()`, existing `listSlots` + `SaveSummary`, resume via `startSlot` | ditto |
| 5 — World discovery and selection | `discover()` from `OPENWORLD_WORLD`; announced worlds have no play action | ditto |
| 6 — Creator integration and recommendation | `recommend.ts` + `create()`; the look is handed to the existing creator | ditto |
| 7 — Responsive, touch, accessibility, platform | one-column ≤640 px, 44 px targets, safe-area insets, same `webDir` | ditto |
| 8 — Integration, regression, closeout | typecheck, targeted tests, production build, browser check | final checkpoint |

**Note on checkpoints.** Stages 1–7 were built as one coherent shell (the screens share `app.ts` and one stylesheet), so
they are committed as a single checkpoint rather than seven artificial intermediate states. Each stage's exit criteria
are recorded in the table above and were verified together by the Stage 8 checks.

## Commands and evidence

Filled in at Stage 8 below.
