# Verifying the workspace

One command, one log per check, one honest summary. This is how a change to the game, the runtime, the shell or the
Android packaging is verified without a partial run being mistaken for a pass.

```bash
npm run verify              # world → types → unit → build
npm run verify:ui           # the same, then the Playwright suite
npm run verify:android      # the same, then the native sync and the debug APK
node scripts/verify.mjs --only=world,build     # some steps
node scripts/verify.mjs --list                 # what the steps are
```

`scripts/verify.mjs` runs its steps in order, in this shell, with a per-step time limit and its own log under
`verify-logs/<timestamp>/`. A step's exit code is the step's own; the runner keeps going after a failure so the summary
shows every step's result, and exits non-zero if any of them failed. `verify-logs/` is gitignored; the logs are the
evidence for a report, not part of the tree. `summary.json` records the commit whose tree was verified.

Two things the runner learned the hard way. A step over its limit has its **whole process tree** stopped: the step runs
under a shell, so killing the shell reaches only the shell, and on Windows `npm`, `node` and `vite` keep running and
keep the log's pipe open, which leaves the runner waiting past its own limit — `taskkill /T` (and a detached group on
POSIX) stops the tree, and the log is closed after the kill whether or not the pipes shut. And an **unknown step name,
or a selection that matches nothing, is an error** (exit 2): `--only=uis` used to select zero steps and print `PASS`.

## The steps

| Step | Command | What a pass means | What it does not mean |
| --- | --- | --- | --- |
| `world` | `npm run gen:world` | the 1170-map world and the 1650-type bundle regenerated from content and tools | nothing about the game's behaviour; the files are gitignored build input |
| `types` | `npm run typecheck` | every project compiles under its own tsconfig, including the package boundaries | no runtime behaviour |
| `unit` | `vitest run shell.test.ts boundaries.test.ts --testTimeout=180000` | the shell's act mapping and recommendation rules, and the package dependency rules | no page, no rendering, no layout |
| `build` | `npm run build -w @openworld-game/client` | the shipped web client builds, `dist/` has `index.html`, `shell.html` and the game's pages | that any page renders correctly |
| `ui` | `playwright test` | see "The UI suite" below | nothing about Android |
| `android-sync` | `npx cap sync android` | `dist/` copied into the Android project and `capacitor.config.json` rewritten | that the APK runs |
| `android-apk` | `gradlew assembleDebug` (JDK 21) | the debug APK builds | that it installs or plays — see `docs/phase1/android-device-test.md` |

`npm run verify:android` finds a JDK 21 (from `ANDROID_JAVA_HOME`, or a `jdk-21*` under the usual Windows install roots)
because the machine's default `JAVA_HOME` here is JDK 17, which cannot compile Capacitor's `sourceRelease 21`.

Prefer `npm run verify:ui` over `npm run test:ui` on a machine that already has a dev server: `test:ui` regenerates the
world *while* the server is running, and the file churn has been observed to wedge a long-running Vite process. `verify`
regenerates the world first and lets Playwright start or reuse the server afterwards.

## Continuous integration (GitHub Actions)

`.github/workflows/verify.yml` runs these checks on GitHub's Ubuntu runners, so verifying a change does not need Linux,
WSL2, Docker or a VM on this machine. It is deliberately **not** `npm run verify`: that runner is this machine's — it
regenerates the world and bundle in front of everything, finds a JDK 21 under `C:\Program Files`, and can build the APK.
The workflow keeps the checks, drops the local and device steps (Android is below), and runs them as four independent
jobs so a slow check does not wait behind another.

| Job | Command | What a pass means | Timeout |
| --- | --- | --- | --- |
| `typecheck` | `npm ci` then `npm run typecheck` | all 16 tsconfig projects compile, boundaries included | 30 min |
| `test` | `npm test -- --testTimeout=120000` | the whole vitest suite, including the Docker-driven `games/openworld/ai/test/repo.test.ts` (a GitHub-hosted Ubuntu runner has Docker) | 45 min |
| `build` | `npm run build` then `ls` the pages | `gen:world` and the client's vite build produce `dist/index.html`, `shell.html`, `boss-gallery.html`, `looks.html` | 30 min |
| `ui` | `npx playwright test --workers=2` | the 26 Playwright specs, at their own budgets (`UI_BUDGET` unset) | 60 min |

Every job installs with `npm ci --no-audit --no-fund` from `package-lock.json` (lockfileVersion 3) and `setup-node`
caches the npm download cache on that lockfile; the UI job also caches `~/.cache/ms-playwright` on it. A step's exit
code is the job's: `npm ci`, `tsc`, vitest, the build and Playwright each fail the run on their own, and the build job
additionally fails if `dist/` lacks a page. Only the UI job uploads artifacts (`test-results/` and the dev server's log,
kept 7 days); every other job's evidence is its log.

The `test` job checks out two commits (`fetch-depth: 2`) because
`games/openworld/ai/test/drivers.test.ts` builds a workspace of `HEAD~1`: a shallow checkout has no parent, and that
test then fails for the checkout rather than for the code.

### The suite that job runs is red on `master`, and is not narrowed

`npm test` is run as it is. A CI job that selects only the passing files hides exactly what it exists to find, so the
`test` job reports the repository's state: on 2026-11-20 at `43515f2a` the full suite has **10 failed tests in two
files**, and the same two files fail on this Windows host when run alone
(`npx vitest run games/openworld/ai/test/modder-affordance.test.ts packages/format/test/schema.test.ts` →
`10 failed | 2 passed`), so this is the tree, not the runner:

- `packages/format/test/schema.test.ts` — `packages/format/schema/map.schema.json` is stale: it lacks the `environment`
  property the generator now emits from `packages/format/src/files.ts` (`npm run schema` rewrites the committed
  schemas).
- `games/openworld/ai/test/modder-affordance.test.ts` — the patch the test places is not accepted, so its later cases
  assert on records that never arrived (`Cannot read properties of undefined` in `placePatch`, `packages/engine/src/mod.ts:804`).

Until those two are fixed the `test` job — and therefore the run — is red. That is the check telling the truth; the
workflow is not to be made green by dropping files from the command.

### Triggers, and running it by hand

A push to `master`, a pull request into `master`, and `workflow_dispatch` all start it; pushes to `ci/**` start it too,
so a change to the workflow itself can be proven before it is merged. One run per branch at a time, and a newer push
replaces the run it supersedes (a fix pushed while a run is in flight would otherwise wait behind it); runs on `master`
are never cancelled, because they are the record of what landed. The four jobs are independent — one failing does not
stop the others, so a red run still shows every check's result.

- **Inspect:** GitHub → Actions → `verify` → the run → a job → its step. The failing step is the one marked red; its log
  is the same output the command gives locally.
- **Rerun:** *Re-run failed jobs* on the run page keeps the successful jobs' results. With the GitHub CLI:
  `gh run list --workflow=verify.yml`, `gh run view <id> --log-failed`, `gh run rerun <id> --failed`.
- **By hand:** Actions → `verify` → *Run workflow* (branch `master`), or
  `gh workflow run verify.yml --ref master`.

### The UI job's server

`playwright.config.ts` starts its own server with `npm run dev:client -- --host 127.0.0.1`, and npm passes those
arguments to itself rather than to vite: vite then binds `localhost`, which resolves to `::1` on the runner, while the
config polls `127.0.0.1:5173`. The job therefore starts the client itself (`npx vite --host 127.0.0.1 --port 5173
--strictPort` in `games/openworld/client`) and waits until `ui-lab.html` answers, then runs the suite **with `CI` unset**
so `reuseExistingServer: !process.env.CI` keeps that server instead of starting a second one. The strict port makes a
stale server fail the step rather than move to 5174. If a spec fails there, the uploaded `playwright-failure` artifact
has the screenshot, `error-context.md` and the server's output; the budgets are the specs' own on a runner this fast, so
a timeout means the boot got slower, not that the scale should be raised. Observed so far: the job passed in 4.5 minutes on
2026-11-20 (run 44747293399); an earlier run of the same job on the same machine class failed at the suite step, and its
`playwright-failure` artifact — not a raised `UI_BUDGET` — is where to look if that recurs.

### Why the root typecheck never finished here (it does now)

Measured on 2026-11-20 on this Windows host, one `tsc -p` per project: `packages/engine` 46 s, `packages/engine/test`
57 s, `packages/stdlib` 42 s, `packages/format` 36 s, `games/starter` 44 s, `packages/modules` 22 s, `packages/bridge`
22 s, `packages/runtime` 16 s, `packages/editor` 15 s, `games/openworld/content` 16 s, `games/openworld/client` 24 s,
`games/openworld/tools` 22 s, `games/openworld/wiki` 28 s, `packages/narration` 20 s, `packages/ai` 32 s,
`games/openworld/ai` 22 s — **464 s in total, every project exit 0**, a small fraction of the one-hour limit in
`verify.mjs`. So the earlier "it never finished in an hour" was load and contention (a dev server, browsers and the UI
suite running beside it), not a project that hangs; the limit stays generous, and a loaded machine is not a reason to
raise it.

## The UI suite, and what it costs on this machine

Measured on 2026-11-19 on this Windows host (Chromium, `?lang=zh&modder=off`):

| Measurement | Value |
| --- | --- |
| The title's menu becomes clickable | 31–41s (headless), 31s (headed), 33s from the production build |
| Begin adventure → a player in the world | 55–65s from `goto` |
| Slow or failed network requests during boot | none (the slowest is a ~650 ms module transform) |
| `world/index.json` (1.4 MB) read + parse in Node | ~35 ms |
| `bundle.json` (2.5 MB) read + parse in Node | ~65 ms |

So the time is not the dev server (the production build is equally slow), not software rendering (a real window is
equally slow), and not a failing request. The title is **designed** to hold its menu until the worker has built the world
and drawn the first frame behind it (`cover.booting`; `BOOT_MS = 60_000` in `packages/runtime/src/ui/cover.ts` is the
outer limit). That construction takes tens of seconds here and a few seconds on a fast machine. The specs' budgets were
written for the fast case: 60s (title settings), 90s (companion panels), 120s (game windows), 240s (character creation).

### `UI_BUDGET`

The suite's assertions are unchanged; only the time allowed is scalable:

```bash
UI_BUDGET=6 npx playwright test     # the same assertions, six times the time
```

`tests/ui/budget.ts` holds the scale (default `1`, so CI's budgets are exactly as written). Use it — and say so in the
report — when a machine's boot is slower than the budgets; never by loosening an assertion. On a Linux CI runner the
default should be enough; if it is not, the machine is telling you the boot got slower, not that the test is wrong.

### Last full run on this host

2026-11-20, `UI_BUDGET=3 UI_WORKERS=1 npx playwright test`: **26 passed in 17.2 min**, exit 0
(`verify-logs/ui-full3.log`). Slowest: `creator.spec.ts` (zh 5.7 min, en 2.9 min) and `game.spec.ts:16` (4.3 min).
Repeated after the blip below on a quieter machine: **26 passed in 14.5 min**, exit 0 (`verify-logs/ui-final.log`);
slowest `game.spec.ts` 6.6 min and `creator.spec.ts` 6.3 min as files, `game.spec.ts:16` 3.5 min.
`UI_BUDGET=2` is not enough for that last one here — it needs 3.5–4.5 min — so **3 is the local setting**; the assertions
are identical at any scale.

A later `node scripts/verify.mjs --only=ui` run on the same host lost the browser in both creator specs
(`Target page, context or browser has been closed`, 771 s, tests 1–19 and 22–26 green); rerunning only those two specs
passed them at 4.6 and 4.4 min. That is the infrastructure signature described under "Reading a failure" — rerun the
spec, do not change it. The next full run, same settings, closed the loop at 26/26.

Each step is slow because of the protocol round trip, not the page. In the same loop driven directly against the server,
a keystroke took 653 ms and a bounding-box query 2.7 s at 1366×768 (0.1–0.2 s at 390×844): the browser's main thread is
competing with everything else on this machine. On a quiet or CI machine the same loop finished in 164 s total, 30 s of
which was the title's boot.

### Reading a failure

- `Test timeout of … exceeded` — the budget ran out. Note which wait was in flight (Playwright's call log names it) and
  compare with the table above before calling it a product bug.
- A named assertion (`expect(…).toBeVisible()`, `toHaveText`, …) — a behaviour difference. The failing snapshot in
  `test-results/<spec>/error-context.md` shows what the page actually had.
- `… intercepts pointer events` — an element sits over the one being clicked. This is how the real defect below was
  found; it is never "flaky", it is a stacking/overlap bug.
- `Target page, context or browser has been closed` — infrastructure, not behaviour: the browser process died
  mid-test. There is no assertion mismatch and no page snapshot to read, because the page is gone. On this host it
  happened once, on both creator specs within a single `verify --only=ui` run, on a machine with other browsers and
  IDEs open (2026-11-20); the same two specs passed 4.6 and 4.4 min on an immediate rerun
  (`verify-logs/creator-rerun.log`), and the earlier full run was 26/26. Remedy: rerun the affected spec before
  reading anything into it, and when a run dies this way, close other browsers first. Only if it recurs on a quiet
  machine is there something in the page to chase (renderer OOM), which the browser's stderr would show.

### Four things the suite itself needed

- **`waitForFunction` polled on `requestAnimationFrame`.** A page Chromium treats as hidden throttles rAF, so the gate on
  `lsw.frame.player` could never evaluate even though the game was running — the failure snapshot showed the HUD and an
  open world. It now polls on a 250 ms timer (`tests/ui/game.spec.ts`).
- **Two browsers on one machine starve each other.** With `workers: 2` a page loses frames and panels take tens of
  seconds to appear; budgets expire with the game running. `UI_WORKERS` sets the count (`playwright.config.ts`), and the
  verification runner uses one. The CI workflow tries one for the same reason: with two, its UI job failed at the suite
  step on two of four runs on a four-core runner, and passed on the other two.
- **`.first()` bound to a window that was fading out.** The spec opened the next window 150 ms after closing the
  previous one, and while the old window faded out `.first()` could still resolve to it: `expect(…).toBeVisible()`
  passed, the element then disappeared, and the following `boundingBox()` waited for a match until the test's budget was
  gone (`Test timeout … exceeded` naming `locator.boundingBox`). The spec now waits for the match count to settle at one
  — which is also the behaviour it means to assert, one window at a time — and expects zero after Escape.
- **Playwright's tracing cost more than the game (2026-11-20).** `trace: 'retain-on-failure'` records a screencast of
  every rendered frame, and this page draws a world, a minimap and canvas windows continuously. Measured on the same
  host and the same spec (`game.spec.ts:16`, 24 window/viewport pairs): **12.0 min with tracing on — the 360 s scaled
  budget ran out and teardown failed with a truncated trace zip**; **3.5 min with `--trace off` — passed**. The same
  loop driven outside the runner took 2.7 min, so nothing in the page was slow. Tracing is now off unless `UI_TRACE=1`,
  which is the setting to use for a run you expect to fail and want artifacts from; a failing run otherwise still
  leaves its screenshot and `error-context.md` under `test-results/`.

## Defects this process has caught

- **2026-11-19 — the Story button covered the character creator's Next at 360 px.** `#app.on-cover ~ .narr-btn` is now
  hidden while the title owns the screen (`packages/runtime/src/ui/game.css`). Before the fix
  `document.elementFromPoint` at the centre of `#cvNext` at 360×640 returned `BUTTON.narr-btn`; the creator spec retried
  the click until its budget expired. The same button also floated over an open window's footer, so it now sits at
  z-index 39, below the windows (40). `tests/ui/creator.spec.ts` covers it.
- **2026-11-19 — the inventory overflowed its body at 390 px.** The bag's ten-to-a-row grid kept a 36 px floor per slot,
  which is 438 px of row in a 314 px column; the window body reported 456 px of content in 350 px. Under 799 px the grid
  now takes its width from the column (`inventory.css`), and `tests/ui/game.spec.ts` asserts no horizontal overflow in
  every window at 1366×768, 390×844 and 844×390.

## What is still not covered by any step here

- Live AI: no model service is contacted; the offline recommender is what the tests exercise.
- Android at runtime: the APK builds, but install/launch/play is a device test (`docs/phase1/android-device-test.md`).
- The editor and desktop packaging (`npm run editor:build`, `npm run desktop`), which have their own workflows.
