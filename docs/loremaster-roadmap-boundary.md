# LoreMaster Roadmap Authority Boundary and Cross-References

Status: adopted (Option 1), recorded 2026-11-18.

## Decision

The LoreMaster program keeps three separate documents, with three separate jobs:

- `docs/roadmap.md` — the OpenWorld technical roadmap. It is preserved as-is. It is not renamed, replaced, merged into a LoreMaster file, edited by LoreMaster work, or used as the LoreMaster phase list.
- `docs/loremaster-roadmap.md` — the authoritative LoreMaster programme roadmap. Its phase list and statuses come from `docs/loremaster-product-identity-blueprint.md` section 15.2 (master implementation phases), and its progress vocabulary comes from section 15.4.
- `docs/loremaster-product-identity-blueprint.md` — the vision and requirements authority for the product.

This is Option 1 from the roadmap-authority discussion. The choice is recorded here so the split is explicit and does not drift back toward “which roadmap is authoritative.”

## What each document is for

### `docs/roadmap.md`

The main OpenWorld main-game roadmap. It has its own milestones, dependencies, completion markers, and choices to confirm. LoreMaster work does not claim to supersede it and does not edit it.

This file is the authoritative technical roadmap for the main game. It is scoped to world behavior, engine/client changes, content milestones, and the main-game choices to confirm. It is not the LoreMaster program tracker.

### `docs/loremaster-roadmap.md`

The LoreMaster programme tracker. It tracks the LoreMaster phases only. Where a LoreMaster phase depends on a main-game roadmap item, it records the dependency here and points at `docs/roadmap.md`; it does not rewrite `docs/roadmap.md` to make the dependency disappear, and it does not reproduce `docs/roadmap.md`’s milestones, world-model steps, event-model milestones, or choices.

This file is the authoritative LoreMaster program roadmap. Its phase titles come from `docs/loremaster-product-identity-blueprint.md` §15.2 and its status vocabulary comes from §15.4.

### `docs/loremaster-product-identity-blueprint.md`

The product identity and execution blueprint. It is the authority for the LoreMaster vision and requirements, and it is the source of truth for the phase titles and status vocabulary used by the LoreMaster tracker.

This is the top-level product authority for LoreMaster. It is not a substitute for `docs/roadmap.md`, and `docs/roadmap.md` is not a substitute for it.

## Cross-references, not merges

When a decision, design, or dependency is relevant to more than one document, the documents point at each other. They do not copy each other’s content. Concretely:

- The LoreMaster tracker’s source of truth is `docs/loremaster-product-identity-blueprint.md` §15.2 and §15.4.
- The existing `docs/roadmap.md` is preserved as the OpenWorld main-game technical roadmap. Where the two roadmaps touch the same subject, the LoreMaster file records a dependency and points at `docs/roadmap.md` instead of restating it.
- `docs/creative-roadmap.md`, `docs/world-model.md`, `docs/design.md`, and `docs/engine-split.md` remain separate artifacts and are referenced where relevant; they are not duplicated in either roadmap.
- The boundary decision and the audit that supports it are recorded in `docs/loremaster-roadmap-boundary.md` and `docs/phase0-source-reexamination.md`. The Phase 1 design note is recorded in `docs/phase1-design-note.md`.

## What is not allowed by this boundary

- Do not merge `docs/roadmap.md` into `docs/loremaster-roadmap.md`, or vice versa.
- Do not duplicate `docs/roadmap.md`’s milestones, world-model steps, event-model milestones, or choices into the LoreMaster roadmap.
- Do not let the LoreMaster tracker claim to supersede the main-game roadmap.
- Do not use the product blueprint as a replacement for either roadmap; it is the vision/requirements authority, not the tracking artifact.
- Do not let later LoreMaster work silently rewrite `docs/roadmap.md` so a dependency looks smaller or disappeared.

## Authority routing for common questions

- “What is the main game building next, and in what order?” → `docs/roadmap.md`.
- “What is the LoreMaster program building next, and in what order?” → `docs/loremaster-roadmap.md`.
- “Where do the LoreMaster phase titles and status vocabulary come from?” → `docs/loremaster-product-identity-blueprint.md` §15.2 and §15.4.
- “What is the LoreMaster vision and requirements authority?” → `docs/loremaster-product-identity-blueprint.md`.
- “Where is the decision that these three documents coexist rather than merge?” → `docs/loremaster-roadmap-boundary.md`.
- “What did the source audit actually verify before Phase 1 design?” → `docs/phase0-source-reexamination.md`.
- “What is the Phase 1 shell/Cover handoff design, and what is still open?” → `docs/phase1-design-note.md`.

## Current state of Phase 1

Phase 1 is planned, not implemented. The boundary decision is documented here so it is no longer an open question, but the implementation has not started. Phase 1 is being prepared from the completed Phase 0 audit and its design note; it does not begin until that audit and design are complete. See `docs/phase0-source-reexamination.md` for the Phase 0 findings and `docs/phase1-design-note.md` for the Phase 1 design posture.
