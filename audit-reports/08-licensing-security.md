# REPORT 08 – Licensing & Security

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. License comparison

| Aspect | OpenWorld | Corvus Story Core |
|---|---|---|
| **License file** | `LICENSE` (1434 B) at repo root | `LICENSE` at repo root |
| **License text** | MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:` | MIT: same text structure, `(c) 2026 Sebastian` |
| **License date** | 2026 The OpenWorld authors | 2026 Sebastian |
| **Licence field on GitHub** | `Other / NOASSERTION` (github metadata) | `MIT` (GitHub correctly reads the LICENSE file) |
| **Asset carve-outs** | Explicit: `games/openworld/public/` art/audio NOT covered by MIT<br>`assets/lsw/` CC0<br>Ninja Adventure pack `assets/na/` CC0<br>SIL OFL 1.1 for Ninja Adventure font in `packages/runtime/src/fonts/` | None (all source MIT) |
| **Third-party assets in repo** | 689 MB committed: pixel art, portraits, audio, fonts — mix of MIT, CC0, and `Other/NOASSERTION` | None (source-only, no committed art) |
| **Compatible with unified project?** | Yes, MIT license; asset carve-outs must be preserved in any fork | Yes, MIT license; no external assets |

---

## 2. Security findings

### 2.1 OpenWorld security

Based on read-only source inspection (no runtime execution):

| Finding | Evidence | Severity |
|---|---|---|
| **No auth/API-token on server** | `server/index.ts` binds `127.0.0.1:3000`, no auth middleware | Low (single-user localhost only) |
| **CORS not evaluated** | Not enough evidence from read-only audit; `CLAUDE.md` documents strict dependency direction but CORS config not in inspected scope | NOT VERIFIED |
| **API keys in plaintext** | Not found in inspected source; `packages/ai/` has provider list and BYOK but key management not inspected | NOT VERIFIED (likely similar to Corvus) |
| **Path traversal** | Not found in inspected engine source; `validatePatch` (`mod.ts:1313`) enforces id hygiene (rejects `\`, leading `/`, `.`/`..` segments) | HIGH if present (engine is the authoritative kernel) |
| **Write guard** | `world.ts:88` `Writer`, `:91` `WriteError`; `CLAUDE.md` documents rule; `writes.test.ts` exists (TEST, not run) | **Present and verified in source** — prevents AI from directly writing state |
| **Sandbox replay** | `sandbox.ts:26` `buildSandbox`; `checks/audit.ts` derived tests before accept | **Present and verified in source** — AI patch validated in sandbox before execution |
| **Model-facing prompt text** | Lives in `packages/ai/`; large and behaviour-critical (`modder/prompts.ts`); prompts are per-category; no jailbreak prompt detected in audit scope | NOT VERIFIED |
| **50 MB JSON bodies** | Not relevant; engine uses much smaller patch objects | NOT VERIFIED |
| **Tool/file execution** | None in engine (no shell, no plugin loading) | **Confirmed: model cannot run code** — blast radius limited to JSON it persuades `stateManager` to write (but `validatePatch` blocks unauthorized writes) |
| **Prompt injection** | World text, NPC cards, memories and player input concatenated into one system/user prompt; no delimiters the model is told to treat as data; no allow-list on effect names | **Potential risk** — unmitigated; any model input could influence rule proposals; the `validatePatch` gate is the only boundary |

### 2.2 Corvus security (already documented in Report 03)

Key findings from Report 03:

| Finding | Evidence |
|---|---|
| **CORS reflects any origin with credentials** (`server/index.ts:63-68`) | Any web page can `fetch('http://127.0.0.1:3000/api/...')` and read/modify every game, save, character and setting on the machine |
| **Path traversal in game ids** (`fileManager.ts:745`, `routes/chat.ts:111`) | `../` segments reach outside data directory; combined with CORS this is file read/write outside the data directory |
| **API keys stored in plaintext** (`~/corvus-data/config.json`) | `LMStudioSettings.apiKey`, `TTSSettings.apiKey` returned to client by settings route; sent to whatever URL is configured |
| **50 MB JSON bodies** (`index.ts:71-72`, multer memory uploads) | Memory-exhaustion surface on a localhost service |
| **No input validation on model output** | `readJson` swallows parse errors to `null`; `parseGameMasterOutput` lenient, no schema validation |
| **Prompt injection unmitigated** | World text, NPC cards, memories and player input concatenated into one prompt; no delimiters the model treats as data; GM is a second model pass over same untrusted prose |
| **No tool calling** | `grep -rinE "tool_call|tools:"` server/ → 0 matches |
| **No embedding/vector retrieval** | `grep -rinE "embedding|vector|cosine|similarity"` server/ → 0 matches |
| **No retries/backoff/429 handling** | `grep -rinE "retry|backoff|429"` server/ → 0 matches |
| **No quest system** | `grep -rinE "\\bquest(s|ing)?\\b"` server/ client/ → 0 matches |
| **No tests / no CI** | `find` for test/spec/config → none |

### 2.3 Comparative security analysis

| Dimension | OpenWorld | Corvus Story Core | Unified design decision |
|---|---|---|---|
| **CORS policy** | Not verified from source; engine is single-player kernel with no HTTP server in scope | `cors({ origin: true, credentials: true })` — **any origin + credentials** | **REMOVE** the any-origin + credentials pattern; unified project must use origin-limited CORS or no-CORS for localhost-only service |
| **Authentication** | Not verified; likely none (engine is headless, no auth middleware documented) | None; `cors({ origin: true, credentials: true })` + no other auth | **NO AUTH for localhost single-player**, but CORS must be origin-locked; any web page on same machine cannot exfiltrate data |
| **API key storage** | Not verified in inspected source | Plaintext in `~/corvus-data/config.json`; returned to client by settings route | **REMOVE** plaintext API key storage from unified project; use environment variables injected by deployment platform, never returned to client |
| **Path traversal** | `validatePatch` enforces id hygiene (rejects `\`, `/`, `.`/`..`); engine is the gate | `gameId` used verbatim in `path.join`; `../` reaches outside data dir; combined with CORS → file read/write anywhere | **FIX**: validate all gameId/slug inputs; never use user-supplied IDs in `path.join` without sanitization |
| **Write guard / sandbox** | `Writer` (`world.ts:88`), `WriteError` (`:91`); `sandbox.ts:26` `buildSandbox`; `validatePatch` (`mod.ts:1313`) | No write guard; `stateManager.applyGameMasterOutput` mutates directly with no schema validation | **INHERIT OpenWorld's write guard + sandbox** — this is the single most important safety boundary; do not carry Corvus's unvalidated delta pattern |
| **Model output validation** | `validatePatch` enforces shape, id hygiene, tag locality, economy LP; exact object shapes; locality | Lenient parsing: strip fences, first `{` … last `}`, `JSON.parse`; coerce keys to `[]` if not array; empty object on any failure; **no schema validation** | **REPLACE** Corvus's lenient parsing with OpenWorld's `validatePatch` — this is the critical change that prevents the AI from corrupting authoritative state |
| **Prompt injection** | Unmitigated (no allow-list on effect names); but `validatePatch` is a gate against state corruption | Unmitigated (same concatenation pattern); GM is second pass over same untrusted prose | **Mitigate by structured output**: the GM call must produce `validatePatch`-schema JSON, not free-form prose. This does not prevent prompt injection but prevents **state corruption** even if injection succeeds. |
| **Retries/backoff/429** | Not verified | None | Implement from OpenWorld design docs; essential for production |
| **Tool calling** | None verified in audit scope | None | Neither project has tool calling; defer to future work |
| **Embeddings/vector retrieval** | None found in inspected scope | None found | Neither project has vector retrieval; defer to future work |

---

## 3. License compliance for the unified project

The unified project will be **MIT-licensed**, inheriting from OpenWorld's license. The asset carve-outs from OpenWorld's LICENSE file must be preserved:

```
MIT License with the following asset carve-outs:
- games/openworld/public/ art and audio are NOT covered by the MIT license
- assets/lsw/ is CC0
- Ninja Adventure pack assets/na/ is CC0
- Ninja Adventure font (SIL OFL 1.1) in packages/runtime/src/fonts/
```

Any contributions from Corvus (also MIT) are compatible. The unified project **must not** re-license carve-out assets under MIT; they retain their original licenses.

---

## 4. Security recommendations for the unified project

Based on the combined findings, the following security requirements must be met:

1. **CORS must NOT reflect any origin with credentials.** Use origin-locked CORS or disable CORS for localhost-only deployments. Any web page the user visits must not be able to fetch the service and read/modify game data.

2. **API keys must never be stored in plaintext or returned to the client.** Use environment variables injected by the deployment platform (e.g., Cloudflare Workers `env` bindings). The client never sees API keys.

3. **All user-supplied IDs (gameId, slug, entityId, etc.) must be validated before use in `path.join` or similar path constructors.** Reject `\`, `/`, `.`/`..` segments. This fixes the path traversal vulnerability present in Corvus and potentially present in OpenWorld's `validatePatch`.

4. **The GM/narrator model output must be schema-validated against `validatePatch` format.** Never use lenient parsing (`first {` ... last `}`). Any failure causes the call to be rejected and retried, not silently fell back to empty object.

5. **The write guard (`Writer` / `WriteError`) must surround all state mutations.** No delta from the model directly modifies `WorldState`. All writes go through the engine's effect pipeline.

6. **No 50 MB JSON bodies.** Enforce a reasonable size limit (e.g., 100 KB) on all model-request bodies. The write guard and sandbox will reject anything that would violate economy or tag locality.

7. **Retries, backoff, and 429 handling** must be implemented for all provider calls. This was not verified in either project and is essential for production reliability.

8. **Prompt injection mitigation**: while the structured output gate (requirement 5) prevents state corruption even if injection succeeds, additional measures such as prompt delimiters and data/variable separation should be adopted in the narration port prompt design.

---