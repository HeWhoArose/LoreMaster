# Phase 1 — Staged Implementation Plan

Status: approved execution plan for Phase 1, subject to the source-verification gate in Stage 0.

This document turns the Phase 1 design into a sequential, checkpointed implementation programme. It is a work plan, not evidence that any feature has been implemented or tested.

## 1. Authority, scope, and source reconciliation

Read these documents before changing application code:

- `docs/loremaster-product-identity-blueprint.md` — LoreMaster product vision, identity, requirements, and shell/game boundary.
- `docs/loremaster-roadmap.md` — LoreMaster programme tracker.
- `docs/loremaster-roadmap-boundary.md` — adopted Option 1 separation between the LoreMaster programme and the existing main-game roadmap.
- `docs/phase0-source-reexamination.md` — source audit and verified existing contracts.
- `docs/phase1-design-specification.md` — detailed Phase 1 design and acceptance criteria, if present on the active branch.
- `docs/phase1-design-note.md` — narrower shell/Cover handoff design note, if present on the active branch.
- `docs/roadmap.md` — separate Large Symbolic World / main-game roadmap; read for dependencies only and do not edit it as part of LoreMaster Phase 1.

### 1.1 Resolve document authority before implementation

The detailed Phase 1 design specification is the primary Phase 1 requirements document when it exists and is consistent with the product blueprint and adopted roadmap boundary. The Phase 1 design note is a supporting design record for shell/Cover handoff details; it must not silently override the specification. If the two disagree, record the exact conflict and resolve it against the product blueprint, current source, and explicit product decisions before implementing the affected behavior.

Do not rely on section numbers, file paths, symbols, or repository state copied from an earlier report. Re-open the actual files on the active branch and verify each citation against source. In particular:

- Verify that every referenced blueprint section (including any §15.2 / §15.4 references) actually exists in the active version and points to the stated material. Correct stale cross-references in LoreMaster documentation only where necessary and justified.
- Reconcile every path/symbol cited by the Phase 0 report with the current repository. Replace nonexistent paths with the actual source locations only after confirming them.
- Confirm the actual branch, HEAD, remotes, working-tree state, package scripts, test commands, and build commands before relying on historical reports.
- Preserve `docs/roadmap.md` unchanged. Its title and scope should be described accurately; do not silently relabel or rewrite it.
- Preserve unrelated user files and changes, including `nah_italic_report.json` if it is still present.
- Do not delete either Phase 1 design document merely to eliminate overlap. Record which document is primary and which is supporting.

Stage 0 must produce a concise source-of-truth note or update this plan with verified paths, commands, unresolved decisions, and the exact design document selected. Do not begin implementation while a conflict materially affects the next stage.

## 2. Product and architecture invariants

These constraints apply to every stage:

1. LoreMaster is the modern application layer over the existing OpenWorld monorepo; the OpenWorld engine and game remain authoritative for simulation and gameplay.
2. Keep the modern application shell visually distinct from the pixel-art game renderer and in-game HUD. Do not replace gameplay pixel art with shell artwork.
3. Keep the existing game title/Cover system. Do not delete or casually rewrite `packages/runtime/src/ui/cover.ts`, its callbacks, or its handoff contracts.
4. Reuse the existing save, slot, summary, import/export, start/resume, settings, and character-creator systems. Do not create parallel save storage or a second visual character creator.
5. Retain the existing pixel-art character creator in `packages/runtime/src/ui/creator.ts`. Any AI assistance recommends compatible existing appearance data; the player remains able to inspect and edit the result.
6. Never invent body, part, palette, slot, or other identifiers that the current content/runtime contracts cannot resolve. Clearly represent approximate or unsupported recommendations.
7. Do not assume a first-class engine Act entity, species field, or existing `act_cover` asset slot exists. Verify current source; introduce only the smallest application/content-level metadata needed for Phase 1.
8. Do not import Dreamville code. Its documented patterns may be used as design references only, subject to the product blueprint.
9. Keep AI optional and failure-safe. Do not silently substitute a live provider or fallback. A deterministic test seam must exist for repeatable acceptance tests; unavailable AI must be communicated and any non-AI fallback must respect the player's consent.
10. Do not expand into Phase 2+ features, a world marketplace, a full world-authoring UI, species implementation, or gameplay renderer redesign.
11. Keep web and Android on the existing shared web application path unless source verification proves the design requires a narrowly scoped change. Do not claim Android build/release support is verified until the relevant build is actually run successfully.
12. Avoid unrelated refactoring. Every change must trace to a Phase 1 requirement or a necessary integration/test dependency.

## 3. Sequential stage protocol

Execute Stages 0–8 in order. A stage is not complete merely because code exists or a command was attempted.

For every stage:

1. Read the relevant source and tests before editing.
2. State the stage's intended outcome in the persistent implementation log.
3. Implement only that stage's scope.
4. Run the narrowest relevant tests first, then required regression checks.
5. Inspect the resulting diff and verify that the behavior is connected to the real application entry points.
6. Fix failures caused by the stage before proceeding. Do not suppress, skip, weaken, or delete tests to obtain a green result.
7. Record changed files, commands, results, known limitations, and checkpoint commit SHA in the persistent implementation log.
8. Create a small, descriptive Git checkpoint after the stage passes. Never force-push, rewrite shared history, or discard unrelated work.
9. Proceed automatically to the next stage only when all mandatory exit criteria pass.

If a failure is demonstrably pre-existing and unrelated, capture a reproducible baseline and evidence, isolate it, and proceed only if it cannot invalidate the next stage. If the failure blocks confidence in the next stage, stop safely. If interrupted by session/runtime limits, leave a durable log and checkpoint; on resumption, inspect HEAD, working tree, log, and tests, then continue from the first incomplete stage without repeating completed work unnecessarily.

## 4. Implementation stages and exit criteria

### Stage 0 — Source and design reconciliation

**Outcome:** a reliable implementation baseline and one unambiguous Phase 1 requirements authority.

Tasks:
- Inspect the active repository, branch, HEAD, remotes, working tree, package manager, scripts, CI configuration, and current test/build status.
- Read the Phase 1 blueprint/specification/note and Phase 0 audit in full.
- Verify all source paths and symbols that the plan relies on, including Cover, saves, worker protocol, runtime entry, creator, game configuration, story state, look contracts, web entry, Capacitor configuration, and UI tests.
- Resolve design-note/specification overlaps and open decisions that affect implementation. At minimum explicitly resolve shell boot/entry ownership, the post-game return path, story-to-slot mapping, story/current-act metadata, the first curated world/story, AI provider availability and consent/fallback, and image-generation dependency boundaries.
- Identify which acceptance criteria are feasible in this phase and which are blocked by unavailable services/build tooling. Do not silently downgrade required behavior.
- Correct only demonstrably stale LoreMaster documentation references. Do not edit `docs/roadmap.md`.
- Create/update a durable Phase 1 execution log with the verified baseline and decisions.

**Exit criteria:**
- All implementation-critical paths/contracts are verified against active source.
- Design authority and conflicts are explicitly resolved or marked as blockers.
- Test/build commands are confirmed from repository scripts/configuration.
- A stage-by-stage file/contract map and test map exists.
- No runtime/application feature changes have been made in Stage 0.

### Stage 1 — Shell foundation and boot integration

**Outcome:** a minimal LoreMaster application shell that starts reliably without breaking the existing game entry.

Tasks:
- Implement the agreed shell boot model using the actual current web/runtime entry architecture.
- Establish a clear boundary between application shell and existing game runtime/Cover.
- Add shell routing/state and shared layout foundations only as required by the approved design.
- Preserve the existing direct game entry path during integration or provide a deliberate, tested route to it.
- Add deterministic tests for shell boot, loading/error states, and shell-to-game handoff boundaries.

**Exit criteria:**
- The application boots into the intended LoreMaster entry on supported web viewport sizes.
- The existing game remains reachable and its Cover lifecycle still works.
- No duplicate runtime, save manager, or game-start pipeline has been introduced.
- Relevant typecheck, unit, and targeted UI tests pass.

### Stage 2 — Visual identity and reusable design system

**Outcome:** a coherent, reusable modern LoreMaster visual language.

Tasks:
- Implement the approved brand treatment and reusable design tokens/components: typography, colour, spacing, surfaces, buttons, cards, navigation primitives, focus/disabled/loading states, and icon treatment.
- Use modern/non-pixel art direction for the application shell. Retain pixel art for the actual game and in-game entities.
- Ensure readable contrast, keyboard focus, semantic controls, and reduced-motion behavior where applicable.
- Avoid introducing a large component framework if existing project primitives are suitable.

**Exit criteria:**
- Shared components are used by actual shell screens, not merely added unused.
- Visual states and responsive behavior are covered by tests or a documented manual checklist.
- No gameplay renderer/HUD art changes occur.
- Relevant lint, typecheck, unit, and visual/UI checks pass.

### Stage 3 — LoreMaster opening and branding

**Outcome:** the approved opening/branding experience.

Tasks:
- Implement the logo/name/title treatment and opening sequence specified by the approved design.
- Define loading, first-run, returning-user, and failure behavior.
- Ensure the opening sequence can be skipped or does not trap returning players, according to the approved design.
- Transition to the correct shell destination without creating a second game title screen.

**Exit criteria:**
- First launch and returning launch follow deterministic, tested paths.
- Branding is displayed correctly at desktop and mobile widths.
- The existing OpenWorld game title/Cover remains a distinct reachable game surface.
- Motion and skip behavior do not block navigation or accessibility.

### Stage 4 — Home, story cards, library, and progress presentation

**Outcome:** the story-centred home and library backed by existing save data.

Tasks:
- Implement the featured/continue story card and smaller story cards from the approved design.
- Implement story library navigation and empty, loading, saved, and error states.
- Derive progress/resume information from existing save summaries and slot contracts; define only the minimum story-to-slot association required.
- Show current-act information only when a verified metadata mapping exists. Do not fabricate an Act model in the engine.
- Make Resume invoke the verified existing start/resume contract.
- Ensure multiple saves, missing summaries, deleted/unavailable slots, and world mismatch cases are handled safely.

**Exit criteria:**
- Existing saves appear through the existing save contract; no parallel save database exists.
- Resume starts the correct existing slot through the existing handoff.
- Empty and error states are usable.
- Story progress/current-act labels are grounded in saved state and explicit metadata.
- Save/import/export behavior remains intact and regression tests pass.

### Stage 5 — World discovery and selection

**Outcome:** a small curated world discovery/selection experience, not a marketplace.

Tasks:
- Implement the approved curated world list and world-selection details using the agreed world identity/cover metadata.
- Provide a clear path from a selected world into the existing new-game flow.
- Keep future special-world packs extensible through data/contracts, without implementing their systems now.
- Use only assets already available or generated through an explicitly configured, verified capability. Do not invent image URLs or claim image generation works without testing it.
- Handle unavailable/missing artwork with a designed fallback.

**Exit criteria:**
- The curated world can be discovered, selected, and passed to the correct existing game/new-game path.
- World identity is data-driven enough to avoid hardcoding UI per world.
- No marketplace, world editor, or unsupported game bundle mechanism is added.
- Navigation and fallback states pass targeted tests.

### Stage 6 — Existing character creator and AI recommendation integration

**Outcome:** optional AI-assisted appearance recommendation that feeds the existing pixel creator.

Tasks:
- Reuse the existing creator and its real look/body/part/color compatibility rules.
- Define a validated recommendation contract using only identifiers available in the selected world's current look data.
- Track recommendation provenance and player-locked/edited fields so later AI suggestions cannot overwrite player choices.
- Provide an explicit AI-unavailable/error state and a consent-respecting non-AI path.
- Use a deterministic fake/mock provider for automated tests; do not make acceptance dependent on live API availability.
- Keep the player's ability to edit and approve the final appearance.

**Exit criteria:**
- The existing creator renders the recommendation using valid current look data.
- Invalid or unknown identifiers are rejected safely.
- Player edits remain intact.
- AI unavailable, timeout, malformed response, and cancellation paths are handled.
- No second visual creator or Dreamville CharacterGenesis UI is introduced.
- Relevant creator and integration tests pass.

### Stage 7 — Responsive, touch, accessibility, and platform integration

**Outcome:** the same shell works across desktop and mobile web and is prepared for the existing Android packaging path.

Tasks:
- Verify layout at agreed desktop, tablet, and narrow mobile viewport sizes.
- Verify touch navigation and practical tap targets; avoid hover-only interactions.
- Verify keyboard navigation, focus visibility, semantic labels, and reduced motion.
- Verify the current Capacitor configuration and webDir remain correct.
- Run Android build only if the required SDK/toolchain is available; otherwise record the exact blocker and do not claim it passed.

**Exit criteria:**
- Critical shell flows work at all agreed viewport sizes.
- No horizontal overflow or inaccessible primary navigation in the tested layouts.
- Android packaging configuration remains consistent with the shared web build.
- An actual Android build passes, or its unavailability is transparently recorded as an outstanding limitation.

### Stage 8 — End-to-end integration, regression, and Phase 1 closeout

**Outcome:** the complete Phase 1 journey works and evidence is recorded.

Required end-to-end journey:
1. Launch LoreMaster.
2. View/complete the opening sequence.
3. Reach Home.
4. Browse the curated world/story experience.
5. Start or resume a story.
6. For a new game, enter the character description/recommendation path when available.
7. Preview and edit the recommendation in the existing pixel creator.
8. Approve the look and continue through the existing new-game/slot/start flow.
9. Enter the existing game and confirm the game title/Cover and gameplay renderer remain intact.
10. Return through the explicitly approved post-game path.
11. Confirm saves, resume, settings, and import/export remain functional.

Tasks:
- Run all relevant unit, integration, typecheck, lint, UI/browser, build, and Android checks available in the repository.
- Separate passing tests from failing, skipped, unavailable, and pre-existing failures. Never describe a partial suite as fully passing.
- Inspect the final diff for scope creep, duplicate systems, dead code, security issues, accessibility problems, and broken boundaries.
- Update the LoreMaster roadmap Phase 1 status only when its acceptance criteria are genuinely demonstrated.
- Produce a final closeout report with stage outcomes, commits, changed files, exact commands/results, screenshots or test artifacts where available, known limitations, and any deferred criteria.

**Exit criteria:**
- Every mandatory Phase 1 acceptance criterion in the approved design is passed or explicitly marked blocked with evidence and user-visible impact.
- No known Phase 1 regression remains unresolved.
- The final diff and Git history are reviewed.
- Phase 1 is marked COMPLETE only if all mandatory acceptance criteria are demonstrated. Otherwise mark it PARTIAL or BLOCKED with precise evidence.

## 5. Checkpoints, recovery, and reporting

### Git checkpoints
- Use a dedicated implementation branch if the active workflow permits it; otherwise follow the repository's established branch policy.
- Make one descriptive checkpoint commit after each stage passes.
- Do not commit unrelated files or include unrelated user changes.
- Do not force-push, reset away user work, rewrite shared history, or claim a commit exists until Git confirms it.
- Keep each checkpoint small enough to identify the stage and revert safely.

### Persistent execution log
Maintain `docs/phase1-execution-log.md` (or the repository's established equivalent) with:
- active branch and starting HEAD,
- approved design authority and resolved decisions,
- current stage and stage status,
- completed stages and checkpoint SHAs,
- files changed per stage,
- exact commands and test outcomes,
- known baseline failures and blockers,
- next action required for safe resumption.

Update the log at each stage boundary, before any potentially interruptible long operation, and immediately after a successful checkpoint.

### Reporting policy
- Do not send routine progress summaries, interim stage reports, or requests for approval between stages.
- Continue automatically through all stages when their exit criteria pass.
- Do not stop because a stage takes a long time; work methodically and preserve resumability.
- If the execution environment imposes a hard session/runtime limit, save the log and checkpoint, then resume from that record when execution can continue.
- Stop only for a genuine blocker, destructive/ambiguous decision that cannot be resolved from approved requirements, security/safety issue, or a failure that makes further work unsafe or invalid.
- If blocked, do not conceal it or claim completion. Preserve all completed work and provide a concise blocker report.
- Otherwise, provide exactly one comprehensive final report after Stage 8 and the final verification are complete.

## 6. Definition of Phase 1 completion

Phase 1 is complete only when the LoreMaster application identity and shell, opening experience, home/story library, world discovery/selection, existing save/start/settings integration, existing creator integration with safe optional AI recommendation, responsive behavior, and the approved end-to-end journey are implemented and verified against the acceptance criteria.

A document, mockup, successful dev-server response, typecheck alone, or a build from an older commit is not proof of Phase 1 completion.
