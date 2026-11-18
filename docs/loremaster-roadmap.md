# LoreMaster Program Roadmap

Source of truth for this file: `docs/loremaster-product-identity-blueprint.md`, section 15.2 (master implementation phases) and section 15.4 (progress-tracking status vocabulary).

Related but separate documents:

- `docs/roadmap.md` remains the existing OpenWorld main-game roadmap. It is preserved as-is. It is **not** replaced, renamed, merged into this file, or altered by LoreMaster work.
- `docs/loremaster-product-identity-blueprint.md` is the product identity and execution blueprint for LoreMaster.
- `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, and `docs/engine-split.md` remain separate artifacts and are referenced where relevant; they are not duplicated here.

This file is the LoreMaster program roadmap derived from blueprint section 15.2. Its job is to give the LoreMaster work a single, honest place to track phase status and the unresolved roadmap-authority question, without creating a duplicate main-game roadmap.

## Roadmap authority boundary unresolved

Status: unresolved.

- The existing `docs/roadmap.md` is the main OpenWorld main-game roadmap. It has its own milestones, dependencies, completion markers, and choices to confirm.
- The blueprint’s section 15.2 defines LoreMaster master phases 0–10 as a separate program roadmap.
- These two systems overlap in subject matter but are not the same authority, and they are not yet reconciled into one agreed consolidated source of truth.
- Until that authority decision is made, this file tracks the LoreMaster program phases only. It does not claim to supersede `docs/roadmap.md`, and it does not delete or rewrite the main-game roadmap.

This is the first unresolved issue and the main reason this tracker is narrow: it records LoreMaster program phases and the authority-boundary problem, not a full merge of the two roadmaps.

## Status vocabulary

Use the status vocabulary from blueprint section 15.4 exactly:

- `NOT STARTED` — nothing meaningful started for this phase yet.
- `AUDITING` — verifying existing workspace, branch, source, documentation, contracts, and assumed facts against the actual repo.
- `IN PROGRESS` — actively being done now.
- `PLANNED` — proposed scope exists; work not started.
- `PARTIAL` — some relevant work exists, but the phase is not complete.
- `COMPLETE` — verified complete against the phase’s real acceptance criteria.
- `UNKNOWN` — status cannot be honestly stated yet from current evidence.

## Phase status summary

Statuses below are honest as of this pass. They are not implementation achievements.

- Phase 0 — audit/governance readiness: `IN PROGRESS`
- Phase 1 — LoreMaster shell and continuity with existing OpenWorld: `PLANNED`
- Phase 2 — story-centred home screen and story library: `PLANNED`
- Phase 3 — external asset discovery and asset catalogue: `PLANNED`
- Phase 4 — character creation and species diversity: `PLANNED`
- Phase 5 — gladiator demonstration world: `PLANNED`
- Phase 6 — gameplay interface redesign: `PLANNED`
- Phase 7 — natural-language gameplay and reliability: `PLANNED`
- Phase 8 — world definition and custom world creation: `PLANNED`
- Phase 9 — AI-assisted content creation: `PLANNED`
- Phase 10 — integration, optimisation, and release readiness: `PLANNED`

No future phase is claimed complete. None of Phase 1–Phase 10 is started yet.

## Phase 0 — audit/governance readiness

Status: `IN PROGRESS`

Scope: verify the actual workspace, branch, HEAD, remotes, local refs, existing documentation, dependency boundaries, and source-dependent claims before committing to a LoreMaster implementation order.

Evidence from this pass:

- Confirmed root: `C:\Dev\Loremaster`.
- Confirmed branch: `master`.
- Confirmed HEAD: `2153868f` with message `docs: integrate complete LoreMaster master roadmap into product blueprint`.
- Remotes `origin` and `loremaster` both resolve to `https://github.com/HeWhoArose/Loremaster.git`.
- Local branches: `main` at `e3cadf35`, `master` at `2153868f`.
- `origin/master` is at `843747cf`, behind local `master` and `loremaster/master`.
- `loremaster/master` is already at `2153868f`, same as local `master`.
- Working tree is otherwise clean except unrelated untracked `nah_italic_report.json`.
- Blueprint section 15.2 defines LoreMaster master phases 0–10.
- Blueprint section 15.4 defines the status vocabulary used here.
- Existing main-game roadmap `docs/roadmap.md` is preserved without editing.
- Narration dependency-boundary line `narration: ['@openworld/engine']` is present in `packages/engine/test/boundaries.test.ts`.

What is still part of Phase 0 and not finished:

- Deciding and documenting the authoritative roadmap boundary between `docs/roadmap.md` and this LoreMaster program roadmap.
- Recording an explicit transition rule for when a LoreMaster phase overlaps an existing main-game roadmap item.
- Re-verifying source-dependent claims that the blueprint itself flags as uncertain, especially current look-table species/body state and any existing cover/artwork contracts, before implementation.

## Phase 1 — LoreMaster shell and continuity with existing OpenWorld

Status: `PLANNED`

Scope: establish the LoreMaster shell as the normal launch experience while preserving existing OpenWorld continuity, especially existing save/start/settings contracts and the existing game title contract in `packages/runtime/src/ui/cover.ts`.

This phase is planned, not implemented. The existing game title contract and its save/start/settings handling remain in place; Phase 1 is about the LoreMaster app shell and the documented Cover reuse/handoff, not deleting `cover.ts` or pretending it does not exist.

## Phase 2 — story-centred home screen and story library

Status: `PLANNED`

Scope: story-centred home screen and story/library/navigation behavior from blueprint section 15.2.

## Phase 3 — external asset discovery and asset catalogue

Status: `PLANNED`

Scope: external asset discovery and asset catalogue/reporting behavior from blueprint section 15.2.

## Phase 4 — character creation and species diversity

Status: `PLANNED`

Scope: character creation and species diversity work from blueprint section 15.2.

## Phase 5 — gladiator demonstration world

Status: `PLANNED`

Scope: gladiator demonstration world from blueprint section 15.2.

## Phase 6 — gameplay interface redesign

Status: `PLANNED`

Scope: gameplay interface redesign from blueprint section 15.2.

## Phase 7 — natural-language gameplay and reliability

Status: `PLANNED`

Scope: natural-language gameplay and reliability work from blueprint section 15.2.

## Phase 8 — world definition and custom world creation

Status: `PLANNED`

Scope: world definition and custom world creation work from blueprint section 15.2.

## Phase 9 — AI-assisted content creation

Status: `PLANNED`

Scope: AI-assisted content creation work from blueprint section 15.2.

## Phase 10 — integration, optimisation, and release readiness

Status: `PLANNED`

Scope: integration, optimisation, and release-ready work from blueprint section 15.2.

## Progress tracking requirements

This file is the tracking artifact for LoreMaster program phases until a consolidated roadmap authority is agreed.

- Treat `docs/roadmap.md` as the separate existing main-game roadmap. Do not merge it into this file just because the subjects overlap.
- When a LoreMaster phase depends on a main-game roadmap item, record the dependency here and point at `docs/roadmap.md`. Do not rewrite the main-game roadmap to make the dependency disappear.
- Update this file when phase status changes or when the authoritative-roadmap-boundary issue is resolved.
- Do not mark a phase complete unless its real acceptance criteria are met, not just because its scope is written down.

## Unresolved issues

1. Authoritative roadmap identity is not resolved.
   - `docs/roadmap.md` is the existing main-game roadmap.
   - This file is the LoreMaster program roadmap derived from blueprint section 15.2.
   - It is not yet agreed which artifact is authoritative when the two overlap, or whether a later consolidation should merge, supplement, or keep them separate.
   - This tracker does not resolve that by itself; it records it.

2. Source-dependent claims still need re-verification before implementation.
   - Current look-table species/body/slot state is a content/source property, not a guaranteed present-state claim from the blueprint alone.
   - Existing cover/artwork and save/start/settings contracts are real and present, but their exact reuse/replacement boundaries for the LoreMaster shell should be re-checked against source before Phase 1 work is finalized.

## First implementation task

Finish Phase 0 reconciliation:

1. Keep `docs/roadmap.md` as the existing main-game roadmap without editing it.
2. Keep this file as the LoreMaster program roadmap derived from blueprint section 15.2, with the phase statuses above.
3. Decide and document the authoritative-roadmap-boundary rule between `docs/roadmap.md` and this file.
4. Re-verify the flagged source-dependent claims before implementation.

Then begin Phase 1:

- Establish the LoreMaster shell and the documented Cover reuse/handoff from `packages/runtime/src/ui/cover.ts`, preserving existing save/start/settings contracts and the existing game title contract.
- Do not delete `cover.ts` or its contracts.
- Do not claim any future phase complete.

## Notes

- This file intentionally does not reproduce the milestones, world-model steps, event-model milestones, or choices from `docs/roadmap.md`. That is the main-game roadmap’s job.
- This file intentionally does not reproduce `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, or `docs/engine-split.md`. Those remain their own artifacts.
