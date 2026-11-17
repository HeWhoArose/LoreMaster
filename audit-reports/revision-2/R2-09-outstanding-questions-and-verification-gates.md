# REVISION 2 — Outstanding Questions and Verification Gates

**Corrections in this document:** C-14 (test counts), and the replacement of Report 09's
"recommendations" with executable gates.
**Evidence:** `.github/workflows/check.yml` (read verbatim), root `package.json`, clone at `e3cadf3`.
**Status of every gate below: `NOT RUN`.** Nothing in Reports 00–12 or in Revision 2 has installed,
built, typechecked or executed either repository. No build or test pass is claimed anywhere.

---

## 1. Why this document exists

Reports 01, 09 and 12 spoke about build health in the conditional ("would pass", "CI wiring verified")
and then planned phases as though the baseline were known-good. It is not known. The corrected
programme starts by measuring, and every later phase is gated on a measurement.

Two facts make this urgent:

1. The full suite takes **about 30 minutes** by the workflow's own comment, and CI allows 45. A
   regression hunt is not something to discover mid-implementation.
2. `games/openworld/public/world/` and `bundle.json` are **git-ignored** (`.gitignore:3-4`), so a
   fresh clone cannot play until `npm run gen:world` runs. Any "it starts" claim without that step is
   false.

### 1.1 Correction C-14 — test inventory

Report 09 §2.1 gave per-directory counts. Verified counts:

| Directory | Report 09 | Actual |
|---|---|---|
| `packages/engine` | 7 | **6** |
| `packages/modules` | 6 | **0** |
| `games/openworld/ai` | 17 | **19** |
| `packages/ai` | 19 | 19 |
| `packages/runtime` | 34 | 34 |
| `packages/editor` | 13 | 13 |
| `packages/format` | 7 | 7 |
| `games/openworld/tools` | 79 | 79 |
| `games/openworld/content` | 50 | 50 |
| `games/openworld/wiki` | 1 | 1 |
| `games/starter` | 6 | 6 |
| **Total** | 241 | **241** |

The total reproduces; three per-directory figures do not. Not material to any decision, but it is the
kind of detail that shows the original counts were partly recalled rather than counted.

---

## 2. Disposable clone procedure (mandatory)

Never run any of this in the working repositories. Create a throwaway directory per attempt.

```bash
# A. code-only clone (fast, ~55-63 MB; no artwork) — the audit's own method
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/SihanXU/openworld.git ow-gate
cd ow-gate
git sparse-checkout init --cone
git sparse-checkout set packages games/openworld/content games/openworld/client \
  games/openworld/tools games/openworld/ai games/openworld/wiki games/starter docs .github bench
git checkout main
git rev-parse HEAD        # must record: e3cadf35e655f370963181b387fba60e139b692a (or note the new HEAD)

# B. full clone (needed if any art/portrait gate is to run)
git clone --depth 1 https://github.com/SihanXU/openworld.git ow-gate-full
```

Rules:

- Record `git rev-parse HEAD` and the `package-lock.json` hash with every result.
- Do not reuse a clone between gate attempts; a stale `node_modules` invalidates G1.
- Delete the clone when the run is recorded. Nothing is pushed, committed or branched.
- The Corvus clone is only needed for G7's provenance comparisons; it is not required for any gate
  that this revision actually blocks on.

---

## 3. Environment baseline

| Item | Value (this machine, measured) |
|---|---|
| Node | v24.19.0 |
| npm | 11.17.0 |
| OS | Windows (win32), Git Bash shell |
| Lockfile | `package-lock.json` present |
| CI reference | `ubuntu-latest`, Node 24, `npm ci --no-audit --no-fund` |

Note the platform difference: CI runs Ubuntu; local runs are Windows. The workflow has a
`creator-portable` job that runs on `windows-latest` and `macos-latest`, so Windows is an intended
platform — but its job does **not** run `npm run typecheck` on non-Linux (`if: runner.os != 'Linux'`),
which means a Windows-only type error would not be caught by CI. Local typecheck on Windows is
therefore a real gate, not a formality.

---

## 4. Verification gates

Every command below must be run with its exit status preserved and inspected. Do not pipe into
`head`/`tail` without `set -o pipefail`. Record stdout/stderr to a log file per gate.

### G1 — Clean dependency installation

```bash
set -o pipefail
cd ow-gate
rm -rf node_modules packages/*/node_modules games/*/*/node_modules
npm ci --no-audit --no-fund 2>&1 | tee ../g1-install.log; echo "EXIT=$?"
```

**Pass:** exit 0; no `ERESOLVE`; no postinstall that downloads a model or artwork; `node_modules`
present in the workspace roots.
**Watch for:** the repo is 689 MB with assets; a code-only clone will not have them and some build
steps may demand them. Record, do not work around.

### G2 — Type checking

```bash
npm run typecheck 2>&1 | tee ../g2-typecheck.log; echo "EXIT=$?"     # game + ai + openworld/ai
npm run typecheck:game 2>&1 | tee ../g2b-typecheck-game.log; echo "EXIT=$?"
```

**Pass:** exit 0 on both. `typecheck` is the CI gate; `typecheck:game` is what the `no-ai` job runs.

### G3 — Unit tests (baseline)

```bash
npm test -- --testTimeout=120000 2>&1 | tee ../g3-test.log; echo "EXIT=$?"
```

**Pass:** exit 0. Expect ~30 minutes. Record: total files, passed, failed, skipped, duration.
**If failures exist:** they are *baseline* failures. Catalogue them (file, assertion, whether they
touch engine/rules/effects/looks/saves) before any implementation begins. Do not "fix" them in the
gate clone.

### G4 — Integration / portability suites

```bash
npm run test:creator 2>&1 | tee ../g4a-creator.log; echo "EXIT=$?"
npm run test:creation 2>&1 | tee ../g4b-creation.log; echo "EXIT=$?"
```

**Pass:** exit 0. `test:creator` is the cross-platform job CI runs on three OSes; it is the closest
thing to an integration suite.
**Also verify the `no-ai` claim** (Report 09 #5, currently `DOC` only) — this is the single most
important structural claim about the engine's independence:

```bash
cd ow-gate && git stash list >/dev/null   # ensure clean tree
rm -rf packages/ai games/openworld/ai
npm install --no-audit --no-fund
npm run typecheck:game && npm test -- --testTimeout=120000 && npm run check:world
echo "EXIT=$?"
```

**Pass:** all three succeed with both AI folders deleted. If they do not, the "engine is independent of
the AI" claim is false and the corrected architecture's separation (R2-06 §2) needs re-examination.

### G5 — Runtime startup and build

```bash
npm run gen:world 2>&1 | tee ../g5a-world.log; echo "EXIT=$?"     # required: world/ is git-ignored
npm run check:world 2>&1 | tee ../g5b-checkworld.log; echo "EXIT=$?"
npm run build:player 2>&1 | tee ../g5c-build.log; echo "EXIT=$?"
npm run play          # dev server; expect a URL on 5173, world loads, no console errors
```

**Pass:** world generation completes; `check:world` passes; the player build emits a static site; the
dev server serves a playable page (manually confirmed: a map draws, the player moves, a spoken line
appears). **`npm run play` alone does not prove startup** — without `gen:world` it serves an empty
world.

### G6 — Narration pipeline (new code; Phase 2 gate)

No existing command. The gate is a new test suite with a **scripted model** (no network):

| Case | Assertion |
|---|---|
| conversation, no action | `TurnResult.outcome = 'resolved'`, `digest.mutated = false`, prose speakers ⊆ cast |
| question the engine answers with a keyed line | digest contains the `say` fact; prose does not contradict it |
| proposal accepted | digest records the verb/target; engine state changed exactly as the act resolved |
| proposal rejected | `outcome='rejected'`, **no** engine call made, prose does not claim success |
| act refused (`{defined:false}`) | `outcome='refused'`, prose is a failure description |
| undefined outcome, ScriptedModel returns a Patch | `validatePatch` ok → sandbox ok → rule installed → event re-resolved → digest `filledHole=true` |
| undefined outcome, model returns garbage / times out | hole default ran; `filledHole=false`; prose reflects the default |
| invalid prose (unknown speaker, too long, player impersonation) | repair retried once, then code-composed fallback used |
| model unavailable entirely | turn completes with fallback line; digest persisted |

**Pass:** all nine. **Fail condition to watch:** any test that passes because the prose "looks right" —
prose assertions must be structural.

### G7 — Engine action resolution (the contract's footing)

Run against `buildSandbox` (`sandbox.ts:26`), not against a live save:

```bash
npx vitest run <new narration act tests> --reporter=verbose
```

| Verb | Scenario | Assertion |
|---|---|---|
| `use` | actor with instrument vs thing | resolves; effects' fx and touched props change |
| `put` / `take` | item into container, out of container | containment changes; `Writer` guard not tripped outside the outcome |
| `hands` | talk to a person with `say:'chat'` | person's line selected (`people.ts` scoring); no state mutation beyond memory |
| `hands` + `say:'buy'` | merchant, affordable / unaffordable | purchase resolves / refuses; coin and item consistent |
| `move` | `{dir}` and `{map,x,y}` | place changes; walls/portals honoured |
| `craft` | recipe with and without ingredients | crafted / refused |
| `learn` | skill with/without points | learned / refused |
| refusal classes | busy actor, out-of-reach target, frozen target, protected holder | `{defined:false}` and the correct reason class in the digest |

**Pass:** every row asserted from engine data (props/place/statuses), not from prose.

### G8 — Save / load

```bash
npx vitest run packages/engine/test games/openworld/tools/test --reporter=verbose
```

Plus a new round-trip test:

| Step | Assertion |
|---|---|
| save a sandbox world at tick N | `SaveData` shape `{version:1, world, state, library, savedAt, codex}` |
| load it | identical `WorldState` (deep equal), identical RNG state, identical library |
| load a save with another `world` version | refused (version gate) |
| save with a pending ModPort question, reload | the question's default runs; no crash (`saves.ts:7-42`) |
| narrative store round-trip | blocks/memory/summaries restored; `turnId → revision` intact |
| crash-point matrix (R2-03 §5.3) | each case lands in a *detectable* state |

**Pass:** all rows. **Note:** "determinism" here means *same state + same recorded event sequence →
same result*. It does not mean a re-generated turn reproduces itself (the model is not deterministic).

### G9 — Security

| Test | Assertion |
|---|---|
| loopback gate, allowed origin | request from the page's origin succeeds |
| loopback gate, foreign origin | refused (403/400), no state change |
| key handling | no key in save, log, error, response body (scan the artifacts) |
| prose rendering | model text containing `<script>` renders as text, not markup |
| prompt injection fixture | injected content cannot produce a Patch writing outside its host, nor a proposal outside the closed param set |
| id hygiene | `idProblem` rejects `..`, `/`, `\` — asserted directly (`mod.ts:1302`) |
| write guard | a write outside an outcome throws `WriteError` (`world.ts:91`) |

**Pass:** all. **Blocked:** any hosted-mode test (H3) until R2-09 Q6 is answered; record as blocked,
not passed.

### G10 — Character rendering (visual; human)

```bash
npm run play     # then, in the browser: create a player, open the look editor, walk, talk, open a portrait
```

**Pass:** a human confirms a figure walks on all four facings, an idle frame exists, the portrait bust
appears in the dialogue box, and a worn garment changes the sprite. **This gate cannot be passed by an
agent.** No artwork was fetched or inspected in either audit; every art claim in R2-04 is about the
pipeline, not the pictures.

### G11 — Species compatibility (Phase 5 gate)

| Test | Assertion |
|---|---|
| `lookProblems` accepts the new part only on its declared bodies | engine test |
| every existing look unchanged | `lookCode` diff over a fixed sample of people = empty |
| sprite composition | the new part appears on the declared bodies' frames, all four facings |
| portrait | a bust exists for each body, and each declared mood |
| equipment | a worn piece still composes, or is refused by `bodies` — asserted, not assumed |
| no silent fallback | an unknown body or catalog key is a compile/test failure, not a villager |

**Pass:** all rows, plus human visual review. **Explicitly not covered:** new bodies, new slots,
Class C actors (Phase 6).

---

## 5. Outstanding questions (human decisions)

These are not analysis gaps; each changes the design if answered differently.

| # | Question | Options | What changes | Blocks |
|---|---|---|---|---|
| **Q1** | Does narrative state survive a content-version change (the save gate discards saves from another `world` version)? | (a) discard with the save; (b) keep and mark orphaned; (c) keep keyed by world version | the narrative store's key shape and the "load failed" UX | Phase 3 |
| **Q2** | Regeneration policy for mutating turns | (a) snapshot ring (last N), (b) no regeneration after mutation, (c) full event log + replay | Phase 3 scope; storage growth; whether `mutated` even needs to be recorded | Phase 3 |
| **Q3** | Ambiguity policy for action proposals | (a) ask the player to disambiguate, (b) pick the highest-confidence candidate and show what it did, (c) refuse and require panel input | intent prompt, UX, test matrix | Phase 2 |
| **Q4** | Is memory rule-based or model-extracted? | (a) derive from digests (no model), (b) a `memory` purpose call, (c) both | cost per turn, a sixth prompt, test shape | Phase 4 |
| **Q5** | Should the narrator be a different model from the intent parser? | (a) same model, two purposes; (b) separate configs | provider routing config; BYOK UX ("one key, two models") | Phase 4 |
| **Q6** | Hosting: is a hosted inference service (H3) in scope at all? | (a) no — H1/H2 only; (b) yes, later; (c) desktop (H4) instead | whether auth/limits/budget work ever exists; whether Cloudflare-style services are ever needed (they are not required by the architecture either way) | Phase 6 |
| **Q7** | Is a distinct dwarf/orc **body** (Class B) a product requirement, or is species-as-culture (Class A) enough? | (a) Class A only; (b) one Class B body; (c) several | art workstream size; whether the runtime body union changes | Phase 5/6 |
| **Q8** | Does the narrator have licence to add sensory detail not in the digest? | (a) strict (digest-only, terse), (b) bounded embellishment (environment, mood, no outcomes) | narration prompt; the "faithfulness" limitation's practical size | Phase 2 |

Recommended defaults, if the human prefers not to decide now: **Q1a, Q2a (N=10), Q3a, Q4a, Q5a,
Q6a, Q7a, Q8b.** Each default is the smallest thing that can be built and tested without committing
the project to infrastructure it does not need.

---

## 6. Limitations of this revision (stated, not hidden)

1. **Nothing was executed.** Not a build, not a typecheck, not a test, not either app. Every gate in
   §4 is `NOT RUN` and every build-health statement inherited from Reports 01/09/12 remains
   unverified.
2. **No artwork was fetched or viewed.** The audit clone is code-only; the baked catalog and world are
   generated. All species claims are about data contracts, code paths and asset counts — not about how
   anything looks.
3. **Corvus was not re-read for this revision.** Its facts are Report 03's, and are labelled as such.
   The corrections in this set do not depend on new Corvus evidence; they depend on OpenWorld source,
   which was re-read.
4. **The loopback gate's implementation was not read line-by-line** — only its documented intent
   (`service/server.ts:1-22`). Marked `NOT VERIFIED` wherever it is relied on (R2-05 T2).
5. **Prose faithfulness is not verifiable.** The design makes invention *structurally* hard (engine
   first, digest-only input) and *detectably* wrong only in the cases the validator can see. Any claim
   that narrated text is verified true would be false.
6. **Line counts differ by method.** Report 00's figures (engine 22,643; ai 12,729) reproduce when
   test files are excluded (22,643; 13,098); including tests gives 23,385 and 16,605. Neither is
   wrong; the method was unstated.

---

## 7. Final decision (restated)

**PROCEED WITH MODIFICATIONS** — not as originally proposed.

- **OpenWorld** is kept as the authoritative engine, essentially intact (42 of 68 matrix rows are
  PRESERVE; the rest of its rows are deferred, not removed). Nothing found weakens its write guard,
  hole system, sandbox, determinism or provider layer.
- **Corvus** is a reference for narration orchestration only: eight patterns adapted, five contracts
  replaced, four defects forbidden. It is not a dependency.
- **The single-contract design is rejected.** Three contracts replace it: RulePatch (validated by
  `validatePatch`, used only at holes), ActionProposal (validated against world state, translated to
  verified `Engine.act`/`Controls` calls), NarrativeOutput (speaker-tagged prose, structurally
  validated, never authoritative).
- **One lifecycle, engine first.** The narrator never runs before the engine resolves, and never sees
  `WorldState`.
- **The Cloudflare/Next.js/Freebuff deployment architecture is removed**, and hosting remains undecided
  (H1–H4) with no platform-specific dependency in the core path.
- **No implementation begins** until G1–G5 pass in a disposable clone and Q1–Q3 are answered.

**Approval needed for:** the three contracts (R2-02), the lifecycle (R2-03 §2), the narrative-store
boundary (R2-03 §4), the corrected dispositions (R2-07), and the defaults for Q1–Q8 (§5 above).
