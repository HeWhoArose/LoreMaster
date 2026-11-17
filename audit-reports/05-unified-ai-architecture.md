# REPORT 05 – Unified AI Architecture

**Repository:** Project A – OpenWorld (`SihanXU/openworld`), branch `main`, commit `e3cadf35e655f370963181b387fba60e139b692a`; Project B – Corvus Story Core (`JustLateNightAI/Corvus-Story-Core`), branch `main`, commit `8e5e7345eb349581febfd9d73bd45d4edea59717`.
**Audit date:** 2026-11-16.

---

## 1. AI architecture across both projects

| Dimension | OpenWorld | Corvus Story Core | Unified design |
|---|---|---|---|
| **Number of providers** | 8 (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, custom + 2 others) | 1 (LMStudioSettings, one model for all tasks) | 5-8 providers (inherit OpenWorld's list); add local LMStudio as fallback |
| **Model routing** | Per-category capability detection (`ai/src/modder/detect.ts:121` `Detector`; `engine/src/quality.ts` `AI_LEVELS`, `AI_WAIT_MS`); probe-based recommendation per work category | No routing; one model for narrator, GM, summarizer, design chat, image prompts | Per-category routing from OpenWorld; GM and narrator requests route through Corvus's two-pass shape but with OpenWorld's provider selection |
| **Structured output** | `validatePatch` (`mod.ts:1313`) enforces: artefact shape; id hygiene; condition-reference only carried tags; economy LP; exact object shapes; locality (host-only writes) | `parseGameMasterOutput` lenient: strip fences, first `{` … last `}`, `JSON.parse`; coerce keys to `[]` if not array; empty object on any failure; **no schema validation** | Replace Corvus's lenient parsing with OpenWorld's `validatePatch`; schema-validated structured output is the **single most critical change** |
| **Tool calling** | `grep -rinE "tool_call|tools:"` over `ai/` finds capability descriptors but no runtime tool calling in this phase; provider list includes tool-capable models | `grep -rinE "tool_call|tools:"` server/ → **0 matches** | Adopt OpenWorld's model of capability descriptors; prohibit untyped open-ended JSON from GM |
| **Jailbreak prompt** | Global `jailbreakPrompt` prepended as extra system message (`lmStudio.ts:52-59`) | Same: prepended to **every** request including GM and summariser (`lmStudio.ts:52-59`) | Retain but **warn**: jailbreak prompt can silently corrupt structured output; must not be applied to `validatePatch` requests |
| **Cost/usage tracking** | Per-model cost, daily limits per user, model allowlist (`ai/src/`); `maxTokens` per category | No cost/usage tracking whatsoever | Inherit OpenWorld's cost tracking; add per-task budgeting for narrator + GM |
| **Retries / backoff / 429 handling** | Not verified in this phase (no runs) | `grep -rinE "retry|backoff|429"` server/ → **0 matches** | Implement from OpenWorld's design docs; essential for production use |
| **Token estimation** | `ceil(chars/4)` (`contextAssembler.ts:16-19`) | Same `ceil(chars/4)` (`contextAssembler.ts:16-19`) | Keep both; unify to real token counter when model supports it |
| **Prompt format** | Prompts in `packages/ai/src/`; large behaviour-critical prompts (`modder/prompts.ts`); per-category | Prompts built in `orchestrator.ts`, `narrator.ts`, `gameMaster.ts`; block format `[Narrator]`, `[Character: Name]` | Combine: OpenWorld's prompt library + Corvus's block-format narrator prompt; new "narration port" prompt bridges the two |
| **Streaming** | `chatCompletionStream` SSE (`lmStudio.ts:171-319`) | Same SSE streaming + `ThinkStreamStripper` + `stripThinkingTags` + `stripProseReasoning` (`orchestrator.ts:203-234`) | Keep Corvus's streaming hygiene (stripper pipeline); add OpenWorld's structured output post-strip |
| **Model temperature** | Per-config; `AI_WAIT_MS = 20_000` (`quality.ts`) is "how long the world stands still for the player's own question" | GM: temp 0.2, `maxTokens ≥max(4096, cfg.maxTokens)` (`gameMaster.ts:160-165`); narrator: configurable | Differentiate: GM at temp 0.2 for deterministic JSON; narrator at higher temp for prose; both have separate budgets |
| **Max tokens** | Per-config; `maxTokens ≥4096` implied | GM: `maxTokens = max(4096, cfg.maxTokens)`; narrator/other: config | GM at ≥4096 for full state change JSON; narrator budget separate |
| **Agent/RSI harness** | `ai/src/agent/*`; `games/openworld/ai/*`; `docs/rsi*.md`; research apparatus, not gameplay | None | Defer agent harness to later phase; not core to unified AI architecture |
| **Autonomous creator** | `/creator/*` job API + MCP tools; host-only guarded (`ai/src/service/server.ts:96-169`) | None | Defer; not core to unified AI architecture |
| **BYOK in player** | `runtime/src/ownModel.ts`; key stays in browser; sent only to chosen service | None (single local LMStudio config) | INHERIT OpenWorld's BYOK; key stays in browser, never sent to Corvus |
| **Model capability detection** | `engine/src/quality.ts:1-40`; `ai/src/modder/detect.ts:16,45,121` | None (one model fits all) | INHERIT OpenWorld; add narrative-specific levels if needed |

---

## 2. The "narration port" – the unified AI's core interface

The central design question is: **what does the AI say, and in what form, in the fused system?**

### 2.1 Permitted AI vocabulary

The AI's permitted vocabulary in the fused system must be exactly **three forms**, in order of precedence:

| Form | Description | Destination |
|---|---|---|
| **(a) Rule patch** | A `Patch` emitted through `ModPort` / `validatePatch` (`mod.ts:29`, `mod.ts:1313`). The AI proposes a rule to fill a `hole` in the rule coverage. The engine validates, replays in sandbox, and executes. | `Engine` → deterministic kernel |
| **(b) Act request** | An `Engine.act(...)` attempt (`engine.ts:622` `actEvent`). The player or NPC proposes an action; the engine resolves it via rule evaluation, effects, and the write guard. | `Engine` → kernel resolution → `Writer` guard |
| **(c) Prose** | A narrative text block, tagged for speaker: `[Narrator]` or `[Character: Name]`. This is the only form that directly writes **prose state**, not authoritative state. | Narration port → prose output → `splitIntoSpeakerBlocks` → per-speaker `ChatMessage` persistence |

**Never** a delta to `WorldState`. Never a direct state write. Never an unvalidated JSON patch.

### 2.2 Narration port flow

```
Player intent
    ↓
Engine.act(...) attempt (or narrative continuation)
    ↓
Engine resolves via rule evaluation + effects + Writer guard
    ↓
If action is valid, outcome is serialisable (already in WorldState)
    ↓
Narration port receives the resolved outcome
    ↓
Narration port generates prose: [Narrator] text + [Character: Name] blocks
    ↓
ThinkStreamStripper → stripThinkingTags → stripProseReasoning
    ↓
splitIntoSpeakerBlocks (case-insensitive name match, coalesce same speaker)
    ↓
Persist each block as ChatMessage (type: narrator|character)
    ↓
SSE stream returns tokens + gm_update (with player, characters, worldState, summary)
```

### 2.3 GM call in the fused system

The Game Master call is retained but **replaced** with OpenWorld's structured output:

```
System prompt: "You are the hidden GAME MASTER. Read the most recent exchange
between the player and the story response, and emit a structured JSON object
describing any state changes that should happen."

Output schema (OpenWorld validatePatch shape):
{
  statChanges: [{field, operation: set|add|subtract, value, reason}],
  newItems: [{name, description, quantity}],
  removedItems: [{name, quantity}],
  relationshipUpdates: [{id, disposition, notes, revealedName}],
  newCharacters: [{...NPCCharacter fields}],
  worldStateUpdates: [{event, location, timestamp}],
  characterUpdates: [{id, ...patch}],
  currencyChanges: [{name, operation, value, reason}]
}

Parsing: strict — any failure (missing field, wrong type, unknown field name)
causes the whole call to be rejected and retried with a different model or
higher temperature, NOT lenient fallback to empty object.

Temperature: 0.2 (same as Corvus) for deterministic JSON.
Max tokens: max(4096, cfg.maxTokens) (same as Corvus).
```

### 2.4 Provider selection per task

| Task | Provider selection |
|---|---|
| Narrator prose | Round-robin or cost-aware from OpenWorld's 8 providers; model chosen by per-category capability detection |
| GM structured output | Same; but **must** be a model capable of strict JSON output (OpenRouter `response_format` or Anthropic `tool`/JSON mode) |
| Summariser | Same as narrator, or dedicated cheap model |
| Design chat / agent | Same as narrator |
| Image prompts / TTS | Deferred; separate provider configuration |

---

## 3. Prompt architecture

### 3.1 Narrator system prompt (adapted from Corvus `buildNarratorSystemPrompt`)

```
[Narrator] block budget: 1-3
[Asterisk/quote format: *text* or "text"]
"Do not speak for the player"
Group/single-speaker lockdown:
  - If explicit character and no group → single-speaker mode
  - If groupParticipantIds → group mode, restrict to listed participants
Continuation framing: empty input → "advance the scene" without saving empty bubbles
```

### 3.2 GM system prompt (replaced with schema-validated version)

```
You are the hidden GAME MASTER. Read the most recent exchange between the
player and the story response, and emit a structured JSON object describing
any state changes that should happen.

The JSON schema is strictly validated. Emit ONLY the JSON object, no prose,
no fences, no extra text. The schema is:

{
  "statChanges": [{ "field": string, "operation": "set"|"add"|"subtract", "value": number, "reason": string }],
  "newItems": [{ "name": string, "description": string, "quantity": number }],
  "removedItems": [{ "name": string, "quantity": number }],
  "relationshipUpdates": [{ "id": string, "disposition": number, "notes": string, "revealedName": string }],
  "newCharacters": [{ "id": string, "name": string, "revealedName": string, "status": "active"|"pending"|"disabled", "image": { "basePrompt": string, "coreAppearance": string, "defaultOutfit": string, "baseNegative": string, "identitySeed": string } }],
  "worldStateUpdates": [{ "event": string, "location": string, "timestamp": number }],
  "characterUpdates": [{ "id": string, "patch": { [key: string]: any } }],
  "currencyChanges": [{ "name": string, "operation": "set"|"add"|"subtract", "value": number, "reason": string }]
}
```

Temperature 0.2, maxTokens ≥4096. **Any deviation from the schema causes the call to be retried or rejected.**

### 3.3 Context assembler (unified)

Keep Corvus's priority order (system → world → player → relevant NPCs → world state recent events → summaries → recent messages) with OpenWorld's token estimate. Replace the char/4 estimator with a real token counter when the provider supports it; otherwise keep `ceil(chars/4)` as fallback.

Ordered degradation: drop summaries oldest-first, then NPCs from the least relevant end. If the system part alone is over budget, drop before dropping NPCs.

---

## 4. Summary of unified AI architecture

The unified AI architecture **inherits OpenWorld's provider layer, structured output, cost tracking, and capability detection**, while **adopting Corvus's two-pass narrator/GM orchestration shape** with critical modifications:

1. **Structured output replaces lenient parsing** – the GM call uses OpenWorld's `validatePatch` schema, not Corvus's lenient JSON extraction.
2. **Narration port beside ModPort** – the AI's three permitted forms are (a) rule patch, (b) act request, (c) prose; never a direct state write.
3. **Provider layer supersedes Corvus's single-model config** – 8 providers with per-category routing.
4. **Jailbreak prompt retained but flagged** – must not be applied to structured-output requests.
5. **Streaming hygiene kept** – `ThinkStreamStripper`/`stripProseReasoning`/`splitIntoSpeakerBlocks` from Corvus.
6. **BYOK preserved** – key stays in browser; never sent to Corvus-like components.

The AI's vocabulary is exactly three forms: rule patch, act request, prose. This is the core constraint that prevents the AI from directly corrupting authoritative state while still enabling rich narrative output.

---