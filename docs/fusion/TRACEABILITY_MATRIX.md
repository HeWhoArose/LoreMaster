# Traceability matrix

Each requirement from the mission plan, where it is implemented, and what verifies it.
Test files: `conformance` = `packages/narration/test/conformance.test.ts`, `turn` = `turn.test.ts`,
`recovery` = `recovery.test.ts`, `context` = `context.test.ts`.

| Requirement | Implementation | Verification |
| --- | --- | --- |
| §1 one functioning system, not docs only | `packages/narration` + `packages/runtime/src/narrative` + worker + `ui/narrative.ts` | Browser: turn sent, engine acted, panel updated (see VERIFICATION_REPORT) |
| §2 repo/source audit | `docs/fusion/STRUCTURAL_ANALYSIS.md`, `COMPONENT_EXTRACTION_MAP.md` | Source inspection |
| §2 preserve `corvus-reference/`, `openworld-work/` | No deletion; no import from them | `git status` (no removals) |
| §3 reuse over rebuild | extraction map classes each component | `COMPONENT_EXTRACTION_MAP.md` |
| §3A contracts: ActionProposal, NarrativeOutput, RulePatch, validation, speaker, provenance | `contracts/index.ts` (`VERBS`, `validateActionProposal`, `validateNarrativeOutput`, `validateRulePatch`, `meta.model`) | conformance (seat authority, closed params, talk verbs, cast limits, unknown speaker) |
| §3B digest from real simulation | `contracts/index.ts` `buildDigest`, `digest/index.ts` `buildTurnDigest`, `fallbackLine` | conformance (digest), turn (digest from engine result) |
| §3C context assembly + budget | `context/index.ts` `assembleContext`, `DEFAULT_BUDGET` | context (3 tests) |
| §3D NPC cards/personality/disposition | `memory/index.ts` `NpcCard`, `cardFor` in context; runtime projection reads `npc.person`/`npc.memory` | conformance/turn (card context section) |
| §3E NPC memory | `memory/index.ts` `NpcMemoryBook` (remember/recall/prune) | conformance (recall relevance, private per NPC), turn (memory updated) |
| §3F rolling summaries/chapter memory | `history/index.ts` (`VERBATIM_TURNS`, `summary`, `ChapterRecord`) | turn (summary after 10 turns, chapter on move) |
| §3G multi-NPC speaker attribution | `contracts` `NarrativeBlock.speaker`, `validateNarrativeOutput`; mock `multiNpc` scenario | conformance (speaker must be present), turn (multi-NPC output) |
| §3H narrative persistence | `persistence/index.ts`, runtime `kvGet/kvSet` | recovery (save/load, snapshot limit) |
| §4 engine authoritative | `engine/port.ts`; `RuntimeNarrativePort.act` → `engine.act` | conformance + turn: narrative has no mutation path |
| §4.1 proposal boundary + clarification | `act/index.ts` `mapProposal`, `turn.submit/clarify` | conformance (ambiguity not auto-resolved, invalid rejected), turn (clarification flow) |
| §4.2 RulePatch separate | `contracts` `RulePatch`, never applied | conformance (rule patch validation only) |
| §5 eleven-stage pipeline | `turn/index.ts` `submit/execute/narrateAndRecord`; `director`, `context`, `digest`, `memory`, `history`, `persistence` | turn (7 tests) |
| §5 stage 1 intent classification | `director/index.ts` `classifyIntent` | conformance (classification) |
| §5 stage 5 discriminated result | `ProposalMapping` union + `TurnResult.status` | conformance + turn |
| §6 repair scaffold | rewritten `contracts/index.ts`, `act/index.ts`; package `main`/`types`; runtime import | `tsc -p packages/narration`; conformance |
| §6 no highest-confidence ambiguity | `act/index.ts` returns `clarification_required` | conformance (explicit test) |
| §7 provider-neutral + deterministic mock, 18 scenarios | `provider/index.ts`, `provider/mock.ts` (`MOCK_SCENARIOS`) | turn/recovery test each scenario (see VERIFICATION_REPORT) |
| §8 failure handling/recovery | `TurnResult.failed/rejected`, `PendingTurn`, `load()` interruption notice | recovery (11 tests), turn (failure) |
| §9.1 content-version invalidation | `persistence.load` + `turn.load` invalidated branch | recovery (invalidated state, save untouched) |
| §9.2 regeneration restores snapshot | `turn.regenerate`, `SNAPSHOT_LIMIT=10` | recovery (restore before re-execution, limit) |
| §9.3 ambiguity | see §4.1 | conformance/turn |
| §9.4 authority boundary not judgement | proposal validation only; no "smartness" claims | conformance; docs state the limit |
| §9.5 Class A species scope | no species/looks change | `git status` shows no content/looks change |
| §10 persistence architecture | separate `narrative:<base>|<version>` record, IndexedDB, Capacitor same WebView storage | recovery; browser reload check |
| §11 security | no server, no CORS, no keys, bounded context, namespaced keys | extraction map "not carried over"; code review |
| §12 runtime integration | `worker.ts` `startNarrative`, message cases, `narrativeView`; `main.ts` panel | Browser smoke test |
| §13 UI minimum | `ui/narrative.ts/.css`: input, transcript, speakers, choices, status, retry | Browser smoke test (input/transcript/status); choices covered by tests |
| §14 web verification | build + dev server + browser | VERIFICATION_REPORT |
| §14 Android verification | `npx cap sync android`, `assembleDebug` with JDK 21 | VERIFICATION_REPORT (emulator unavailable) |
| §15 automated tests | 37 narration tests + full repo suite | VERIFICATION_REPORT |
| §16 phases | executed in order | git history / this doc set |
| §17 documentation | these seven documents | `ls docs/fusion` |
| §18 provider neutrality / BYOK | `NarrativeProvider`; `LIVE_AI_ACTIVATION.md`; no calls | code review |
| §19 git/GitHub | commits + push + remote verification | VERIFICATION_REPORT §GitHub |
| §20 final report | final message | — |
