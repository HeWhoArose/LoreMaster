# REPORT 00 — Audit Setup, Repositories, Method

**Audit phase:** read-only reverse engineering (no implementation started).
**Audit date:** 2026-11-16.
**Output directory:** `C:\Dev\Portal\audit-reports\` — outside both source repositories.

---

## 1. Repositories under audit

| | PROJECT A — OpenWorld | PROJECT B — Corvus Story Core |
|---|---|---|
| URL | https://github.com/SihanXU/openworld | https://github.com/JustLateNightAI/Corvus-Story-Core |
| Branch | `main` | `main` |
| Commit audited | `e3cadf35e655f370963181b387fba60e139b692a` | `8e5e7345eb349581febfd9d73bd45d4edea59717` |
| Commit subject | "Merge pull request #277 from Takamatsu-Hikaru/codex/autonomous-creator" | "Update README.md" |
| Clone location (isolated) | `/tmp/openworld-audit` | `/tmp/corvus-audit` |
| Reported repo size | 689,482 KB (≈689 MB; art/audio committed, no Git LFS) | small (≈750 KB tree) |
| Primary language | TypeScript (Node 24, npm workspaces) | TypeScript (Node 18+, Express + React/Vite) |
| Code licence | MIT (with explicit asset carve-outs — see Report 08 later) | MIT |

### Clone note (important for reproduction)

OpenWorld is a 689 MB repository because pixel art, portraits and audio are committed. A normal
shallow clone over the audit machine's link did not complete. The audit clone therefore used a
**blobless, sparse checkout of code only**:

```
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/SihanXU/openworld.git
git sparse-checkout init --cone
git sparse-checkout set packages games/openworld/content games/openworld/client \
  games/openworld/tools games/openworld/ai games/openworld/wiki games/starter docs .github bench
git checkout main
```

Result: 55 MB on disk, complete source for both packages and game content. Binary art under
`games/openworld/public/` was deliberately **not** fetched; consequently no asset-level claims in
these reports are based on inspecting pictures. Any finding that depends on art is marked accordingly.

Corvus cloned normally (`git clone --depth 1`); its assets are small.

---

## 2. Read-only guarantees observed

The audit did **not**:

- modify, format, refactor or move any file in either repository;
- install dependencies (no `npm install`, `npm ci`, `bun install`);
- run builds, typechecks or test suites;
- create branches, commits or pull requests;
- start either application;
- write to `~/corvus-data` or any save file.

All inspection was `cat`, `sed`, `grep`, `ls`, `find`, `wc`, `git log/rev-parse` against the
isolated clones, plus read-only GitHub REST/raw fetches. Because dependencies were not installed,
**no claim about whether either project builds or passes its tests is a verified claim**. Those are
recorded as `NOT VERIFIED` and the commands/CI wiring that exist are documented instead (Report 09
later in the programme).

---

## 3. Evidence legend used in these reports

| Tag | Meaning |
|---|---|
| `SRC` | Verified by reading the source file at the cited path (line numbers from the audited commit). |
| `DOC` | Stated in repository documentation/README/CLAUDE.md; not independently executed. |
| `GEN` | Verified indirectly: generated artefact is not committed, so the claim rests on the generator's source. |
| `TEST` | A test file exists that asserts the behaviour; the test was **not** executed. |
| `NOT VERIFIED` | Could not be established in this phase (usually needs install/run). |

Status vocabulary is the one mandated by the audit brief: COMPLETE AND VERIFIED /
IMPLEMENTED BUT LIMITED / PARTIALLY IMPLEMENTED / DOCUMENTED BUT NOT IMPLEMENTED / PLACEHOLDER /
EXPERIMENTAL / NOT FOUND / NOT VERIFIED. Note that "COMPLETE AND VERIFIED" can never be claimed in
this phase for runtime behaviour, because nothing was executed; where source and tests both exist
and agree, the report says **COMPLETE (source-verified, runtime NOT VERIFIED)**.

---

## 4. Deliverables in this pass

| Report | Status |
|---|---|
| 00 — Setup and method | this file |
| 02 — OpenWorld complete architecture audit (Agent 1) | written |
| 03 — Corvus complete AI narration audit (Agent 2) | written |
| 01, 04–12 | not started — they depend on Agents 3–7 and on the decisions to be taken after these two investigations |

---

## 5. First-order facts that reframe the whole programme

These are the findings that already change the shape of the eventual project, stated once here and
evidenced in Reports 02 and 03:

1. **OpenWorld is not "a game with an AI bolted on"; it is an engine, a project format, an editor, a
   deterministic simulation kernel and a separate AI package that the game can be built without.**
   The engine is 22,643 lines across 49 source files; the AI package is 12,729 lines; the runtime
   32,018; the editor 10,352; the game content 14,878. Its CI has a job that deletes both AI folders
   and still typechecks, tests, plays two headless game days and builds.
2. **Corvus is a ~13.8 kLOC localhost web application** whose "world state" is a JSON document of
   free-form strings. It has no spatial model, no rules engine, no combat, no quests (the word
   "quest" does not occur in its server or client source), no schema validation of model output, no
   tests, and no tool calling. It is an excellent reference for *narration orchestration*, not for
   world simulation.
3. Therefore the two projects are **complementary at different layers, not peers**. OpenWorld owns
   the authoritative world; Corvus contributes a proven pattern for narrator/GM separation. The
   "unified data model" work is almost entirely *adding narrative state to OpenWorld*, not merging
   two equal schemas.
4. OpenWorld already contains most of the AI-provider architecture the brief asks for as future work
   (provider list, BYOK, capability detection per work category, tool specs, structured JSON,
   cost/usage, hedging). Corvus's provider layer is a single `LMStudioSettings` shape. Recommendations
   about "the unified provider system" must start from OpenWorld's `packages/ai/src/models/`.
