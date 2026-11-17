# REVISION 2 — Corrected Security and Credential Architecture

**Corrections in this document:** C-04 (deployment architecture removed), C-05 (credential
contradiction), C-12 (retries/hedging/tool claims), plus the security half of C-07 (no lock in
OpenWorld).
**Evidence:** `docs/byok.md`, `packages/ai/src/models/`, `runtime/src/ownModel.ts`,
`packages/ai/src/service/server.ts` header, `docs/design.md`. Nothing executed (`NOT RUN`); the
loopback gate's implementation was not read line-by-line and is marked accordingly.

---

## 1. Two contradictions, one removal

### 1.1 C-04 — the deployment architecture that was never required

Report 10 §4 introduced, as if decided:

| Introduced | Evidence it was ever needed |
|---|---|
| Cloudflare Sites hosting, preview/production environments | none in either repository |
| D1 (SQLite) and R2 (object storage) bindings | none — OpenWorld's saves are **IndexedDB** (`runtime/src/storage.ts`); Corvus's are JSON files |
| Durable Objects / `env.REALTIME` | none — OpenWorld has **no networking or multiplayer** (Report 02 §8.7, re-verified: no netcode) |
| OpenNext + Next.js | none — OpenWorld is Vite + Phaser 4; no Next.js anywhere |
| Freebuff authentication (`FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`) | none — neither project has accounts; both are single-player, local |
| `compatibility_date: 2026-11-16` | an artifact of the audit date, not a design decision |

The actual architecture (`docs/design.md:38`): **"Runs in the browser from a URL; static client + one
API service."** The client builds to a static site (`:1518`); the API service is a loopback-only Node
HTTP modder service (`packages/ai/src/service/server.ts:1-22`); the editor is Vite + Electron.

**Decision:** the Cloudflare/Next.js/Freebuff stack is **removed from the approved design**. Hosting is
presented as undecided alternatives in R2-06 §6. Freebuff is the development environment, not a
platform requirement, and no platform-specific service or identity provider is adopted on that basis.

### 1.2 C-05 — "all credentials must be environment variables" vs browser BYOK

Report 08 §2.3 and §4.2 state: *"API keys must never be stored in plaintext or returned to the
client. Use environment variables injected by the deployment platform."* Report 05 §1 simultaneously
preserves OpenWorld's BYOK, whose entire design is *the key lives in the player's browser and is sent
only to the player's chosen service*.

Both cannot hold. Environment variables belong to a server process; BYOK exists precisely because a
published game may have **no server-side model at all** (`docs/byok.md`: "a published game needs no
server-side model"). The corrected model is four credential classes with different homes, not one
rule.

---

## 2. Trust boundaries of the real system

```
┌──────────────────────────── browser (the player's machine) ────────────────────────────┐
│  page (UI, CSP: own origin only)                                                       │
│    ├── engine worker  ── WorldState, rules, saves(IndexedDB) ── no network ──          │
│    └── modder worker  ── the player's key ──HTTPS──▶ chosen provider                  │
│                              ▲ MessagePort: health, resolve, progress, patches       │
└──────────────────────────────┼────────────────────────────────────────────────────────┘
                               │ (optional) HTTP, loopback only, same-origin
┌──────────────────────────────┴────────────────────────────────────────────────────────┐
│  modder service (Node, 127.0.0.1)  ── owner's key from env (model-node.ts)             │
│    /health /resolve /patches /stats /progress   (any caller)                          │
│    /create /draft /adopt /quality/detect        ("this host only" per its header)     │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Three boundaries matter:

1. **page ↔ provider.** The key must cross only this one, and only to the service it was issued for.
2. **page ↔ local service.** Any *page* the player visits can reach `127.0.0.1` unless the service
   checks `Origin`. This is Corvus's fatal flaw (CORS reflecting any origin with credentials,
   Report 03) and the reason Report 08's CORS finding was right even though its deployment advice
   was not. OpenWorld's service documents a "this host only" gate (loopback address, no Origin or a
   localhost one, JSON only) in its header — evidence that the boundary is considered; the
   implementation is `NOT VERIFIED`.
3. **model ↔ world.** No credential crosses this boundary, and no model output crosses it either
   except through Contract A validation (R2-02 §2).

---

## 3. Credential classes (corrected)

| # | Class | Lives in | Transmitted to | Readable by | Rotation | Never |
|---|---|---|---|---|---|---|
| **1** | **Player BYOK** (the default for a published game) | the page's **modder worker**; persisted only if the player chooses "in this browser" → IndexedDB store `lsw-modder`, apart from saves; otherwise memory until the page closes. The page keeps only a hint (`sk-or-…1234`) | the chosen provider's endpoint, in the header it expects, and nowhere else | the player; anyone using the same browser profile (the UI says so); any script running on the game's own origin (hence CSP) | player clears it / **Forget the key** | never in a save, the rule library, the engine port, a log, an error, or a prompt |
| **2** | **Owner / server-managed key** | the Node service process, from the environment (`modelFromEnv`, `models/model-node.ts`) | the provider, server-side | the machine's owner; the process | restart with a new env value | never in the client bundle, never in a response body, never in the static build |
| **3** | **Local model endpoint** (no key) | configuration: `ProviderDef.keyless`; e.g. Ollama at `http://localhost:11434/v1` with `OLLAMA_ORIGINS` allowing the page's origin | the local endpoint | the local machine | n/a | must not be reachable from a page whose origin the local runtime does not allow |
| **4** | **Shared hosted inference** (a hosted modder service paid by the owner) | the hosting operator's environment | the upstream provider | the operator | operator | the player's key must **not** be sent to it; the player must be told whose account pays; per-user limits and a model allow-list are **required** (they do not exist yet — see §7) |

### 3.1 What this corrects

- Report 08's "env vars only" applies **only** to classes 2 and 4. Class 1 is explicitly a
  browser-resident secret with a documented threat model (`docs/byok.md §2`: same-profile users and
  same-origin scripts can read it; nothing else can).
- Report 10's settings routes (`GET/POST /api/settings` with "no API key fields") describe a
  *server-side* settings store that OpenWorld does not have. In the corrected design the player's
  model settings are client-side; there is no settings route that could return a key.
- The key must be scrubbed from every surfaced error (`scrub`, per `docs/byok.md`), and it must never
  appear in a narration prompt (the narrator receives prose context and a digest, not configuration).

### 3.2 BYOK is not "insecure because it is in the browser"

The alternative is worse for the published-game case: a server-managed key in a browser-delivered
game either ships in the bundle (catastrophic) or requires every player's traffic to pass through the
owner's server (cost, privacy, availability). BYOK's actual risk — a same-origin script or a
same-profile user — is mitigated by CSP, by not persisting the key unless asked, and by scoping the
key to one provider id. The design must state these three mitigations as requirements, not as
assumptions.

---

## 4. Provider abstraction with role-based routing

### 4.1 What exists (verified)

| Fact | Evidence |
|---|---|
| Eight providers, enumerated, each with `kind: 'openai'\|'anthropic'`, optional `baseUrl`, `model`, `keyless`, `keys`, `note` | `ai/src/models/providerList.ts:8-36` |
| One model interface for everything: `complete`-style calls with `messages`, `tools`, `json`, `temperature`, `purpose`, `reasoning` | `ai/src/models/model.ts:22-46` |
| Call-level latency control: `hedgeMs` (second request after N ms), `deadlineMs`, `retries` | `model.ts:38-41`; used by the agent harness (`agent/loop.ts:202`) |
| Per-call accounting: `usage{input,output,cost,reasoning}`, `ms`, `provider`, `hedged`, `finishReason` | `model.ts:48-56` |
| AI setting per work category: `AiQuality{things, people, world, create, prefetch}` × `off|low|medium|high`; `AI_WAIT_MS = 20_000` | `engine/src/quality.ts:18-56` |
| Tier of a learned answer (low/medium/high) is stored with it and composed upward | `quality.ts:34`, `rules.ts` tier composition |

**Correction (C-12):** Report 08 §2.1's "retries/backoff/429 — not verified" and Report 05's "no
runtime tool calling" understate this layer. Hedging, deadlines, retries, tool specs, JSON mode and
usage cost all exist in the model interface. What does **not** exist is a *policy* mapping work roles
to providers — the thing this section specifies.

### 4.2 Roles to route (new)

`purpose` already exists as a free-form string on `ChatOptions`. The corrected design fixes a closed
set of purposes, one per contract:

| Purpose | Contract | Needs | Temperature | Budget | Fallback if unavailable |
|---|---|---|---|---|---|
| `intent` | ActionProposal | strict JSON, fast | ~0 | small (≤ 512 out) | deterministic control paths only; typed input is refused with "try the panel" |
| `rule` | RulePatch (mod port) | strong model, the existing `ModSpec` prompt | low | existing modder budget | hole default runs (engine already does this) |
| `narration` | NarrativeOutput | prose quality, streaming | 0.7–0.9 | medium | code-composed line from the digest |
| `summary` | chapter summary | cheap, long input | low | medium | skip summary this turn |
| `memory` | memory extraction (if used) | strict JSON, cheap | ~0 | small | derive memories from the digest only |
| `detect` | capability probe | existing `Detector` | n/a | existing | keep last known tier |

### 4.3 Routing rules

1. **Class 1 (BYOK) wins for player-facing roles** (`intent`, `narration`, `summary`, `rule` when
   the player's modder is in use): the player's chosen provider and model, at the player's tier.
2. **Class 2/4 are used only when the game is hosted with a server-side model**, and only for the
   roles the operator enabled. A hosted game may route `narration` to a cheap model and `rule` to a
   strong one; that split is configuration, not code.
3. **Class 3 (local endpoint)** is a provider choice like any other; keyless, and it must be reachable
   from the page's origin (CORS on the local runtime, not on our service).
4. **No role may silently upgrade its own model.** The tier is the player's setting
   (`AiQuality`) or the operator's allow-list.
5. **A role's failure degrades to a defined non-model behaviour** (§4.2 fallback column). No role
   degrades to "invent something".

---

## 5. Threat model (corrected)

| # | Threat | Who | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| T1 | Player's provider key stolen by a same-origin script | malicious content/extension in the game's page | key misuse, cost | CSP own-origin only; key in a worker not the DOM; no third-party scripts; scrub from errors | partly exists (`SRC`: CSP per `docs/byok.md`), needs verification test |
| T2 | Any web page calls the local modder service | any site the player visits | world/library mutation via `/adopt`, `/draft`; model spend via `/resolve` | "this host only" gate (loopback + Origin + JSON), origin-locked CORS — **must be tested**, both allowed and refused cases | documented in code header (`SRC` comment), implementation `NOT VERIFIED` |
| T3 | Hosted service run with the owner's key by strangers | public users | uncontrolled cost | auth or signed session, per-user rate limit, model allow-list, hard budget — **none exist yet** | missing (Report 02 §8; Report 08 §4.7) |
| T4 | Prompt injection via world text / NPC lines / player input | content or player | bad proposals, wasted calls, wrong-but-legal actions, bogus rules | (a) `validatePatch` limits rules to host-local effects; (b) sandbox replay; (c) ActionProposal can only request acts the engine may refuse; (d) prose is post-hoc. **Residual:** an injected proposal can still choose a legal-but-unwanted action | bounded, not eliminated — say so |
| T5 | Model writes authoritative state | model | world corruption | no model→state channel exists (R2-03 §6) | structural |
| T6 | Save tampering | local user | cheating in a single-player game | none (no checksum/signature); out of scope unless multiplayer ships | accepted |
| T7 | Two tabs, one slot | player | lost turns (last write wins) | slot lease + `navigator.locks`; refuse second writer | missing, Phase 3 |
| T8 | Prose rendered as HTML (XSS from model output) | model / injected content | script execution in the game origin | render text nodes only; never `innerHTML` for prose; sanitise any markup | **new requirement** — the narration UI is new code and this is its first security rule |
| T9 | Key or prompt content in logs | developer / operator | secret leakage, privacy | log digests and purposes, never keys or raw prompts by default; a debug flag that is off in published builds | new requirement |

---

## 6. Invariants (what must never be true of the finished system)

1. No credential in a save file, the rule library, a chat/prose record, a URL, or a client response
   body.
2. No `innerHTML` (or framework equivalent) for model-authored text.
3. No route that accepts a path/id from the client without validating it against the id hygiene rule
   already used by `idProblem` (`mod.ts:1302`) — the corrected design has no file paths at all, which
   removes Corvus's traversal class entirely.
4. No "any origin with credentials".
5. No hosted deployment that spends the owner's key without a per-user limit.
6. No model output reaching state except through Contracts A and B.

---

## 7. What must be built (security work, not yet done)

| Item | Why | Phase |
|---|---|---|
| Loopback gate tests (allowed and refused origins) for the modder service | T2 | 0 (verify) / 3 |
| Per-user limits + model allow-list for any hosted mode | T3 | 5 (only if hosting is chosen) |
| Slot lease / single-writer guard | T7 | 3 |
| Prose rendering rules + a test that model text is never parsed as markup | T8 | 1 |
| Log redaction policy and a scrubbing test | T9 | 1 |
| CSP review of the narration UI surface | T1 | 1 |
| Explicit statement in-product of who pays for inference in each mode | fairness/consent | 4 |
