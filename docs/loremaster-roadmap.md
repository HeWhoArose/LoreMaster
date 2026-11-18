# LoreMaster Program Roadmap

Source of truth for this file: `docs/loremaster-product-identity-blueprint.md`, section 15.2 (master implementation phases) and section 15.4 (progress-tracking status vocabulary).

Related but separate documents:

- `docs/roadmap.md` remains the existing OpenWorld main-game roadmap. It is preserved as-is. It is **not** replaced, renamed, merged into this file, or altered by LoreMaster work.
- `docs/loremaster-product-identity-blueprint.md` is the product identity and execution blueprint for LoreMaster.
- `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, and `docs/engine-split.md` remain separate artifacts and are referenced where relevant; they are not duplicated here.

This is the authoritative LoreMaster program roadmap. Its phases come from `docs/loremaster-product-identity-blueprint.md` section 15.2 (master implementation phases), and its progress vocabulary comes from section 15.4 (progress-tracking statuses). `docs/loremaster-product-identity-blueprint.md` is the product identity and execution blueprint; it is the vision and requirements authority for LoreMaster. The boundary between these documents is recorded in `docs/loremaster-roadmap-boundary.md`.

## Roadmap authority boundary

Status: resolved by decision, recorded in `docs/loremaster-roadmap-boundary.md`.

- `docs/roadmap.md` is the OpenWorld technical roadmap. It is the existing main-game roadmap. It has its own milestones, dependencies, completion markers, and choices to confirm. It is preserved as-is. It is not replaced, renamed, merged into this file, edited by LoreMaster work, or used as the LoreMaster phase list.
- This file, `docs/loremaster-roadmap.md`, is the authoritative LoreMaster program roadmap. It tracks the LoreMaster program phases only. It does not claim to supersede `docs/roadmap.md`, and it does not delete or rewrite the main-game roadmap.
- The three-document split is Option 1 from the roadmap-authority discussion. The product identity and requirements authority is `docs/loremaster-product-identity-blueprint.md`; the LoreMaster tracker derives its phase titles from blueprint section 15.2 and its status vocabulary from section 15.4.

Cross-references are used instead of merges:

- The LoreMaster tracker's source of truth is `docs/loremaster-product-identity-blueprint.md` §15.2 and §15.4.
- The existing `docs/roadmap.md` is preserved as the OpenWorld main-game roadmap. Where the two roadmaps touch the same subject, this file records a dependency and points at `docs/roadmap.md` instead of restating it.
- `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, and `docs/engine-split.md` remain separate artifacts and are referenced where relevant; they are not duplicated here.

This is the first unresolved issue and the main reason this tracker is narrow: it records LoreMaster program phases and the authority-boundary decision, not a full merge of the two roadmaps.

## Status vocabulary

Use the status vocabulary from blueprint section 15.4 exactly:

- `NOT STARTED`
- `AUDITING`
- `IN PROGRESS`
- `BLOCKED`
- `PARTIAL`
- `VERIFICATION`
- `COMPLETE`

A phase is `COMPLETE` only when all mandatory acceptance criteria have been demonstrated. Documentation alone does not constitute implementation.

## Phase status summary

Statuses below are honest as of this pass. They are not implementation achievements.

- Phase 0 — Audit, verification and project governance: `IN PROGRESS`
- Phase 1 — LoreMaster identity and application foundation: `PLANNED`
- Phase 2 — Story-centred home, library and navigation: `PLANNED`
- Phase 3 — External asset discovery and LoreMaster asset catalogue: `PLANNED`
- Phase 4 — Character creation and species diversity: `PLANNED`
- Phase 5 — Gladiator demonstration world: `PLANNED`
- Phase 6 — Gameplay interface redesign: `PLANNED`
- Phase 7 — Natural-language gameplay and interaction reliability: `PLANNED`
- Phase 8 — World-definition and custom-world architecture: `PLANNED`
- Phase 9 — AI-assisted content creation: `PLANNED`
- Phase 10 — Integration, optimisation and release: `PLANNED`

No future phase is claimed complete. None of Phase 1–Phase 10 is started yet.

## Phase 0 — Audit, verification and project governance

Status: `IN PROGRESS`

Scope: verify the actual workspace, branch, HEAD, remotes, local refs, existing documentation, dependency boundaries, and source-dependent claims before committing to a LoreMaster implementation order. The completed source re-verification is recorded in `docs/phase0-source-reexamination.md`.

Evidence from this pass:

- Confirmed root: `C:\Dev\Loremaster`.
- Confirmed branch: `master`.
- Confirmed HEAD: `ba8cd26b` with message `docs: add LoreMaster program roadmap/tracker from blueprint §15.2`.
- Remotes `origin` and `loremaster` both resolve to `https://github.com/HeWhoArose/Loremaster.git`.
- Local branches: `main` at `e3cadf35`, `master` at `ba8cd26b`.
- `origin/master` is at `843747cf`, behind local `master`.
- Working tree is otherwise clean except unrelated untracked `nah_italic_report.json`.
- Blueprint section 15.2 defines LoreMaster master phases 0–10 with these titles:
  - Phase 0 — Audit, verification and project governance
  - Phase 1 — LoreMaster identity and application foundation
  - Phase 2 — Story-centred home, library and navigation
  - Phase 3 — External asset discovery and LoreMaster asset catalogue
  - Phase 4 — Character creation and species diversity
  - Phase 5 — Gladiator demonstration world
  - Phase 6 — Gameplay interface redesign
  - Phase 7 — Natural-language gameplay and interaction reliability
  - Phase 8 — World-definition and custom-world architecture
  - Phase 9 — AI-assisted content creation
  - Phase 10 — Integration, optimisation and release
- Blueprint section 15.4 defines the status vocabulary used here, including the rule that `COMPLETE` requires demonstrated acceptance criteria.
- Existing main-game roadmap `docs/roadmap.md` is preserved without editing.
- Narration dependency-boundary line `narration: ['@openworld/engine']` is present in `packages/engine/test/boundaries.test.ts` at line 23.

What is still part of Phase 0 and not finished:

- Re-verifying source-dependent claims that the blueprint itself flags as uncertain, especially current look-table species/body state and any existing cover/artwork contracts, before implementation. The source re-verification is in `docs/phase0-source-reexamination.md`.

## Phase 1 — LoreMaster identity and application foundation

Status: `PLANNED`

Scope: establish the LoreMaster shell and continuity with existing OpenWorld, including branding, home/library/discover navigation, save-summary-based story library and resume, world identity and cover artwork contracts, the AI-assisted appearance recommendation fed to the existing creator, and one end-to-end flow: choose world → describe character → AI recommendation → existing creator preview → approve → start game in a slot.

This phase is planned, not implemented. The existing game title contract and its save/start/settings handling remain in place; Phase 1 is about the LoreMaster app shell and the documented Cover reuse/handoff, not deleting `cover.ts` or pretending it does not exist.

The handoff surface Phase 1 would build on is already present and live: `Cover.latest()`, `CoverHandlers.start(slot, summary, options)`, the `saves.ts` slot/summary/list/export/import contracts, and the existing `cover.show()/cover.hide()` lifecycle in `packages/runtime/src/main.ts`. The Phase 0 source re-verification is in `docs/phase0-source-reexamination.md`.

## Phase 2 — Story-centred home, library and navigation

Status: `PLANNED`

Scope: story-centred home screen, story library, current-act display, and app navigation from blueprint section 15.2 and section 2.

## Phase 3 — External asset discovery and LoreMaster asset catalogue

Status: `PLANNED`

Scope: external asset discovery and the LoreMaster asset catalogue/reporting work from blueprint section 15.2 and section 5.

## Phase 4 — Character creation and species diversity

Status: `PLANNED`

Scope: character creation and species diversity work from blueprint section 15.2 and sections 6–7, including the species compatibility profile and only-new-when-needed assets.

Source note: species is not present in the existing look contract today. `games/openworld/content/src/looks.ts` has no species/race/ancestry field; the look record is bodies, slots, parts, colors, and the dresser. A species/lineage layer would be a future extension on top of the approved look record, not something already wired. See `docs/phase0-source-reexamination.md`.

## Phase 5 — Gladiator demonstration world

Status: `PLANNED`

Scope: gladiator demonstration world from blueprint section 15.2.

## Phase 6 — Gameplay interface redesign

Status: `PLANNED`

Scope: gameplay interface redesign from blueprint section 15.2.

## Phase 7 — Natural-language gameplay and interaction reliability

Status: `PLANNED`

Scope: natural-language gameplay and interaction reliability work from blueprint section 15.2.

## Phase 8 — World-definition and custom-world architecture

Status: `PLANNED`

Scope: world-definition and custom-world architecture work from blueprint section 15.2.

## Phase 9 — AI-assisted content creation

Status: `PLANNED`

Scope: AI-assisted content creation work from blueprint section 15.2.

## Phase 10 — Integration, optimisation and release

Status: `PLANNED`

Scope: integration, optimisation and release-ready work from blueprint section 15.2.

## Progress tracking requirements

This file is the tracking artifact for LoreMaster program phases. The boundary is already documented as Option 1 in `docs/loremaster-roadmap-boundary.md`.

- Treat `docs/roadmap.md` as the separate existing main-game roadmap. Do not merge it into this file just because the subjects overlap.
- When a LoreMaster phase depends on a main-game roadmap item, record the dependency here and point at `docs/roadmap.md`. Do not rewrite the main-game roadmap to make the dependency disappear.
- Update this file when phase status changes. Do not mark a phase complete unless its real acceptance criteria are met, not just because its scope is written down.
- Phase 1 is not being implemented yet. It is being prepared from the completed audit and its design doc; it does not begin until that audit and design are complete.

## Unresolved issues

1. Authoritative roadmap identity is resolved by decision, not by consolidation.
   - `docs/roadmap.md` is the OpenWorld technical roadmap, preserved as-is.
   - This file is the authoritative LoreMaster program roadmap, from blueprint §15.2 / §15.4.
   - `docs/loremaster-product-identity-blueprint.md` is the vision and requirements authority.
   - The boundary is recorded in `docs/loremaster-roadmap-boundary.md`. Phase 1 is not implemented yet; it is being prepared from the completed audit.

2. Source-dependent claims still need re-verification before implementation.
   - Current look-table species/body/slot state is a content/source property, not a guaranteed present-state claim from the blueprint alone. The verified finding is that species is absent from the existing look contract today; see `docs/phase0-source-reexamination.md`.
   - Existing cover/artwork and save/start/settings contracts are real and present, but their exact reuse/replacement boundaries for the LoreMaster shell should be re-checked against source before Phase 1 work is finalized. The Phase 0 source re-verification is in `docs/phase0-source-reexamination.md`.

## First implementation task

Finish Phase 0 reconciliation:

1. Keep `docs/roadmap.md` as the OpenWorld technical roadmap without editing it.
2. Keep this file as the authoritative LoreMaster program roadmap, derived from blueprint section 15.2 and section 15.4.
3. Keep the boundary documented in `docs/loremaster-roadmap-boundary.md` as Option 1: separate documents, cross-referenced, not merged and not duplicated.
4. Re-verify the flagged source-dependent claims before implementation. The source re-verification is in `docs/phase0-source-reexamination.md`.

Then begin Phase 1:

- Establish the LoreMaster shell and the documented Cover reuse/handoff from `packages/runtime/src/ui/cover.ts`, preserving existing save/start/settings contracts and the existing game title contract.
- Do not delete `cover.ts` or its contracts.
- Do not claim any future phase complete.

## Notes

- This file intentionally does not reproduce the milestones, world-model steps, event-model milestones, or choices from `docs/roadmap.md`. That is the main-game roadmap's job.
- This file intentionally does not reproduce `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, or `docs/engine-split.md`. Those remain their own artifacts. The boundary is documented in `docs/loremaster-roadmap-boundary.md`.
