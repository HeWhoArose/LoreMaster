# REPORT 09 – Testing & Build Verification

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. Testing infrastructure

| Aspect | OpenWorld | Corvus Story Core |
|---|---|---|
| **Test files** | 241 `*.test.ts` files<br>79 under `games/openworld/tools/test`<br>50 under `games/openworld/content/test`<br>34 under `packages/runtime`<br>19 under `packages/ai`<br>17 under `games/openworld/ai`<br>13 under `packages/editor`<br>7 under `packages/format`<br>7 under `packages/engine`<br>6 under `packages/modules`<br>1 under `games/openworld/wiki` | **Zero test files**. `find` for `*.test.*`, `*.spec.*`, `jest.config*`, `vitest.config*` returns nothing. |
| **Test framework** | `vitest` (configured in `vitest.config.ts` at root)<br>`typescript` typecheck per package (`typecheck` script)<br>`check` script = `typecheck && test` | No framework; `package.json` has no `test`, `lint`, or `typecheck` scripts beyond `tsx` and `vite` dev tools. |
| **CI workflows** | `.github/workflows/check.yml` — full typecheck + test suite + `no-ai` job + creator matrix + merge gate<br>.github/workflows/desktop.yml<br>.github/workflows/wiki.yml | None. No CI configuration. No GitHub Actions. No `.github` directory. |
| **Typechecking** | `typecheck` script runs `tsc` per workspace package; `check` = `typecheck && test`<br>22,643 LOC engine + 12,729 AI + 32,018 runtime + 10,352 editor | Not verified; no `tsc` or typecheck script in `package.json`; project uses Node 18+ with Express + React/Vite; no `tsconfig.json` at root reported. |
| **Specific test coverage** | `writes.test.ts` tests write guard (`world.ts:88`, `WriteError`: `:91`) — exists but **not executed** (dependencies not installed)<br>`writes.test.ts` also tests `WriteError` outside outcomes throws | N/A |
| **Runtime test** | CI `no_ai` job: typecheck + full suite + two headless game days + build<br>`no-ai` deletes both AI folders and still typechecks, tests, plays two headless game days and builds | N/A |
| **Editor test** | Not verified in this phase | N/A |
| **Build verification** | Not executed in this phase (no `npm install`, no `bun install`)<br>Scripts exist: `build:player`, `build:editor` | Not executed; scripts exist: `npm run build`, `npm run dev`, `npm start` (Node 18+) |
| **Lint** | Not verified; no lint script in root `package.json`; some packages may have own lint config | None |
| **Verification status** | **SRC-verified**: test files exist, CI wiring documented, commands known<br>**Runtime NOT VERIFIED**: no builds or tests actually run | **NOT VERIFIED**: no tests, no CI, no builds run; commands exist but were not executed |

---

## 2. Test quality and design

### 2.1 OpenWorld test inventory (SRC-verified, runtime NOT VERIFIED)

| Test file | Purpose | Confidence |
|---|---|---|
| `packages/engine/test/boundaries.test.ts` | Enforces dependency direction: client → engine → mod port → modder service; reverse imports forbidden | **TEST** (exists, not run) — `CLAUDE.md` documents enforcement |
| `games/openworld/tools/test/writes.test.ts` | Tests write guard: `Writer` throws outside an outcome; `WriteError` outside outcomes | **TEST** (exists, not run) — exists in source, not executed |
| `games/openworld/tools/test/*.test.ts` | Tool-specific tests | **TEST** (exists, not run) |
| `games/openworld/content/test/*.test.ts` | Content-specific tests (quests, looks, society) | **TEST** (exists, not run) |
| `packages/ai/test/*.test.ts` | AI modder pipeline tests | **TEST** (exists, not run) |
| `packages/runtime/test/*.test.ts` | Runtime tests (Phaser scenes, HUD) | **TEST** (exists, not run) |
| `packages/editor/test/*.test.ts` | Editor mode tests | **TEST** (exists, not run) |
| `packages/format/test/*.test.ts` | Format/compiler validation tests | **TEST** (exists, not run) |
| 79 tests under `games/openworld/tools/test` | Boundary, write, and tool tests | **High** (wiring verified; pass/fail needs runtime) |
| 50 tests under `games/openworld/content/test` | Quest, look, society tests | **High** (wiring verified; pass/fail needs runtime) |
| 34 runtime tests | Phaser scene, HUD, audio tests | **Medium** (UI not run) |
| 19 ai tests | Modder pipeline, model detection tests | **Medium** (UI not run) |
| 17 games/openworld/ai tests | RSI, agent tasks, curriculum tests | **Low** (research apparatus, not gameplay) |
| 13 editor tests | Map, people, database, rules modes | **Low** (UI not run) |
| 7 format tests | Project format, compiler, validator | **Medium** (CLI not run) |
| 7 engine tests | Core engine behavior | **Low** (not run) |
| 6 modules tests | Classes, kits, loot, needs, society, boons, waypoints | **Low** (not run) |
| 1 wiki test | Wiki build completeness | **Low** (not run) |

### 2.2 Corvus test inventory

| Aspect | Status |
|---|---|
| Test files | **Zero** — `find` for `*.test.*`, `*.spec.*` returns nothing |
| Test framework | None — no `jest`, `vitest`, `mocha`, etc. configured |
| CI | None — no `.github/workflows`, no remote CI |
| Lint | None — no `eslint`, `prettier`, etc. configured |
| CHANGELOG | 179 KB documenting 46 point releases — indicates manual testing occurred, but no automated test framework |
| Verification status | **NOT VERIFIED**: no automated tests exist; all behavior is documented via CHANGELOG and source inspection only |

---

## 3. Build verification

### 3.1 OpenWorld build scripts

From root `package.json`:

| Script | Purpose | Status |
|---|---|---|
| `test` | `vitest run` | SRC-verified (wiring); runtime NOT VERIFIED |
| `typecheck` | `tsc` per package | SRC-verified (wiring); runtime NOT VERIFIED |
| `check` | `typecheck && test` | SRC-verified (wiring); runtime NOT VERIFIED |
| `dev` | Development server | SRC-verified (wiring); runtime NOT VERIFIED |
| `editor` | Editor dev server | SRC-verified (wiring); runtime NOT VERIFIED |
| `play` | Headless game play | SRC-verified (CI `no_ai` job) |
| `build:player` | Build Phaser player | DOC (script exists) |
| `build:editor` | Build editor | DOC (script exists) |
| `schema` | Project schema validation | DOC (script exists) |
| `modder` | AI modder pipeline | DOC (script exists) |
| `agent` | Agent harness | DOC (script exists) |
| `curriculum` | AI curriculum | DOC (script exists) |
| `rulebench` | RuleBench integration | DOC (script exists) |
| `rsi` | RSI harness | DOC (script exists) |
| `latency` | Latency measurement | DOC (script exists) |

**Build status**: Not verified in this phase (no `npm install` run). Scripts exist and are documented; CI `no_ai` job runs typecheck + test + two headless game days + build but was not executed.

### 3.2 Corvus build scripts

From `package.json`:

| Script | Purpose | Status |
|---|---|---|
| `setup` | `./install.sh` (Linux/macOS) or `setup.bat` (Windows) | DOC |
| `start` | `./run.bat` (Windows) or `npm start` | DOC |
| `build` | `npm run build` (Vite build) | DOC |
| `dev` | `npm run dev` (Vite dev server) | DOC |
| `install` | `npm install` (root + client) | DOC |
| `prepare` | Build step before publish | DOC |

**Build status**: Not verified in this phase. No `npm install` was run; scripts are documented from `package.json`.

---

## 4. Verification matrix summary

| # | Claim | File:line | Method | Confidence |
|---|---|---|---|---|
| 1 | 241 test files exist across both packages and games | Various | `find` for `*.test.ts` | **High** (SRC-verified) |
| 2 | CI runs typecheck + full suite + no-AI job | `.github/workflows/check.yml` | **SRC** (wiring) | **High** (wiring); **pass/fail NOT VERIFIED** |
| 3 | `check` = `typecheck && test` | root `package.json` | **SRC** | **High** (wiring); **runtime NOT VERIFIED** |
| 4 | No tests / no CI in Corvus | `find` for test/spec/config → none | **SRC** | **High** |
| 5 | OpenWorld builds and plays without `packages/ai` | CI `no_ai` job; `CLAUDE.md` | **DOC** | **NOT VERIFIED** (no run) |
| 6 | Corvus project builds and runs | `package.json` scripts | **SRC** | **NOT VERIFIED** (no run) |
| 7 | 241 test files include boundary enforcement | `engine/test/boundaries.test.ts` | **SRC** | **High** (wiring); **runtime NOT VERIFIED** |
| 8 | Write guard test exists | `tools/test/writes.test.ts` | **SRC** | **High** (wiring); **runtime NOT VERIFIED** |
| 9 | No lint script in either project | `grep` for lint | **SRC** | **High** |
| 10 | OpenWorld CI has `no_ai` job deleting AI folders | `.github/workflows/check.yml` | **SRC** | **High** (wiring) |
| 11 | Corvus has no schema validation of any kind | `grep` for zod/ajv/joi/yup | **SRC** | **High** |
| 12 | OpenWorld 689 MB of art not fetched in audit | repo metadata + `.gitattributes` | **SRC** | **High** |
| 13 | Corvus zero test files confirmed | `find` over server/client | **SRC** | **High** |
| 14 | OpenWorld typecheck runs per package | `package.json` `typecheck` script | **SRC** | **High** (wiring) |
| 15 | Corvus has no typecheck script | `package.json` no `typecheck` | **SRC** | **High** |

---

## 5. Testing and build recommendations for the unified project

Based on the combined findings, the following recommendations apply:

1. **Preserve OpenWorld's test infrastructure.** The 241 test files, CI `check.yml` wiring, and `no_ai` job are a significant asset. The unified project must keep:
   - Vitest configuration and test suite
   - Per-package typecheck
   - `check` = `typecheck && test`
   - `no_ai` job that deletes AI folders and still typechecks/tests/plays
   - Boundary enforcement tests (client → engine → mod port → modder service direction)

2. **Add narration-specific tests.** The fused system introduces new components that need testing:
   - Narration port: prose output, speaker block splitting, think-stream stripper
   - GM call: schema-validated `validatePatch` output
   - ModPort: rule patch validation + sandbox replay
   - Write guard: `WriteError` outside outcomes

3. **Do NOT adopt Corvus's testing vacuum.** Corvus has zero tests and no CI. The unified project must not replicate this. Every new component (narration port, structured-output GM, species extension) must have test coverage from day one.

4. **Build the player and editor.** OpenWorld's `build:player` and `build:editor` scripts should be verified as working. The unified project needs a headless game-day play test to confirm determinism and save/load round-trip.

5. **Implement CI for the unified project.** At minimum:
   - `typecheck` job
   - `test` job (vitest run)
   - `check` job (typecheck && test)
   - `no_ai` job (delete AI, still typecheck + test + play)
   - Build job (`build:player`)
   - Lint job (adopt from OpenWorld's setup)

6. **Document build dependencies.** Both projects have scripts but dependencies were not installed in this audit. The unified project must document:
   - `npm install` required packages
   - Node version requirements
   - Any native dependencies
   - Dev vs production dependency separation

7. **Benchmark determinism**. OpenWorld's CI runs "two headless game days" — this should be a minimum verification step for the unified project's save/load determinism and replay capability.

---