# Live AI activation (deferred by design)

The fusion ships with **no live model**. `MockNarrativeProvider` is the only provider constructed, no network
call is made, and no credential is read. This document describes how a live provider is added later without
touching the simulation, the validation boundaries or the UI.

## 1. The seam

`packages/narration/src/provider/index.ts`:

```ts
export interface NarrativeProvider {
  readonly name: string
  propose(request: ProposalRequest): Promise<ActionProposal>
  narrate(request: NarrativeRequest): Promise<NarrativeOutput>
}
```

A provider is created in one place: `createNarrativeRuntime` (`packages/runtime/src/narrative/index.ts`).
Replacing `new MockNarrativeProvider()` with a live implementation is the entire wiring change; the turn
machine, validation, digest, memory, history, persistence and panel are provider-agnostic.

## 2. What the provider receives

**ProposalRequest** — `{ turnId, intent, view, context, clarification? }`

* `intent`: the player's exact words and `classifyIntent`'s kind.
* `view`: the projection (`playerId`, `playerName`, `place`, `tick`, `hour`, `npcs`, `nearby`, `player`,
  `talkVerbs`) — the only world facts a model may reason about.
* `context`: the assembled `ContextPackage` sections (already budgeted).
* `clarification`: present when the player is answering a previous ambiguity; the model must choose among the
  offered candidates or decline.

**NarrativeRequest** — `{ turnId, intent, view, context, digest?, rejection?, clarification? }`

* `digest`: the `OutcomeDigest` built from the **engine's** resolution. The model must describe only these facts.
* `rejection`: why a proposal was refused, when it was.

## 3. What the provider must return (and what happens if it doesn't)

* `ActionProposal` — `{ verb: one of VERBS, target?: Id, params?: closed param set, confidence?, rationale? }`.
  It is validated by `validateActionProposal` against seat authority, visible referents, talk verbs and the
  closed parameter tables. An invalid proposal is rejected and the player sees why; it never reaches the engine.
* `NarrativeOutput` — `{ turnId, blocks: NarrativeBlock[], meta }`. `blocks` may only name speakers present in
  the view; at most 6 blocks / 1400 characters. Invalid output is replaced by prose derived from the digest
  (`fallbackLine`), and `meta.model` records the fallback, so a broken model cannot leave the game silent or
  let an absent NPC speak.

Neither return value can change the world. There is no field for it.

## 4. Suggested implementation

1. Add `packages/narration/src/provider/openai.ts` implementing `NarrativeProvider` over an
   OpenAI-compatible `/chat/completions` endpoint (OpenRouter, OpenAI, DeepSeek, Moonshot, Gemini-compatible
   gateways, Ollama, LM Studio, vLLM). Corvus's `lmStudio.ts` is the reference for the wire format; do not copy
   its key handling.
2. Two prompts, both JSON-mode:
   * **proposal prompt**: view + context + intent → one `ActionProposal` or `{ "verb": null }` for
     "this is only speech".
   * **narration prompt**: view + digest + NPC cards + recent transcript → `NarrativeOutput`.
   Strip ` thinking` blocks and prose preamble before parsing (`corvus-reference/server/services/thinkStripper.ts`
   is the reference), then `JSON.parse` inside a `try` and validate.
3. Map HTTP failures and timeouts to thrown errors; the director already converts those into a validated
   fallback line and the turn reports `failed`/`narrated` honestly.
4. Keep the deterministic provider for tests and for players who choose no model.

## 5. Configuration and BYOK rules

* The player supplies their own key. The existing title dialog (`ui/cover.ts`, "Choose the model the world
  asks") already stores it in the browser only; reuse it rather than adding a second configuration path.
* The key must never enter the save, the narrative record, any log, or any request the game's own server would
  see — there is no game server. Requests go from the browser/WebView straight to the endpoint the player chose.
* Keep a per-day spend cap and a model allowlist, as the existing AI settings do.
* Anything that needs an owner-managed key is out of scope: this project uses BYOK only.

## 6. Not to be ported from Corvus

| Corvus behaviour | Why not |
| --- | --- |
| Express routes and CORS for arbitrary origins | A page could spend the user's key. No server is added. |
| `/settings` returning provider config to the client | Key/config disclosure; the key already lives client-side by choice. |
| `gameId` in file paths | Path traversal; storage here is a namespaced IndexedDB key. |
| Model-driven state writes (`GameMasterOutput` → files) | OpenWorld must stay authoritative; use `ActionProposal` + `Engine.act`. |
| Unbounded history in prompts | `ContextBudget` and `VERBATIM_TURNS = 10` cap it. |

## 7. Acceptance criteria for switching live AI on

* `NarrativeProvider` implemented; mock still available and still the default in tests.
* Proposal and narration outputs validated (`validateActionProposal`, `validateNarrativeOutput`); rejection and
  fallback paths exercised with malformed JSON, unknown verbs, absent speakers and timeouts.
* Keys stay in browser storage; no key in the repository, save file, narrative record or logs.
* A turn with a live model still commits only through `Engine.act`, and the transcript's success claims still
  match the digest.
* Existing deterministic tests remain green (they must not require the network).
