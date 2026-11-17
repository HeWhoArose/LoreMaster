# REVISION 2 — Corrected Unified AI Architecture

**Corrections in this document:** C-01 (the central error), C-02 (undefined act contract), C-10
(effects applied from a patch), C-15 (provider list), and the AI halves of C-11/C-12.
**Evidence:** clean clone at `e3cadf3`, source-read. Nothing executed (`NOT RUN`).

---

## 1. The error this document exists to fix

Report 05 (§2.1, §2.3), Report 10 (§2.3, §2.5), Report 08 (§4.4) and Report 12 (§2.2) all assert that
Corvus's `GameMasterOutput` — `{statChanges, newItems, removedItems, relationshipUpdates,
newCharacters, worldStateUpdates, characterUpdates, currencyChanges}` — is "validated by OpenWorld's
`validatePatch`" and that this is "the single most critical change".

It is not possible. The two structures share no field, no concept and no purpose:

```ts
// packages/engine/src/mod.ts:22, 29  (SRC)
export type Artifact =
  | { kind: 'rule';   rule: Rule }
  | { kind: 'type';   type: TypeDef }
  | { kind: 'status'; status: StatusDef }

export interface Patch {
  artifacts: Artifact[]              // rule / type / status DEFINITIONS
  scope?: 'save'
  note?: string
  author?: string
  trigger?: 'player' | 'world'
}

// packages/engine/src/mod.ts:1313  (SRC) — total: a result, never a throw
export function validatePatch(patch: Patch, ctx: ValidateCtx): ValidationResult
// ValidationResult = { ok: boolean; errors: string[]; warnings: string[] }
```

What `validatePatch` actually checks (all `SRC`, `check()` at `mod.ts:1319`+): that `artifacts` is a
non-empty array; artefact kinds; id hygiene via `idProblem` (`:1302`); new type/status problems; the
rule DSL (host selector, condition tree, roles, exact object shapes); that condition tags exist in
the world (`checkTag`, with open families `skill|profession|faction|tool|liquid|material|quality|
element|role:`); locality (a rule writes only its host); economy LP (`ai/src/checks/economy.ts`).

There is **no code path, and no field, by which a stat change, an item, a coin, a disposition, an NPC
or a line of prose passes through this function.** A `GameMasterOutput` handed to `validatePatch`
fails at the first artefact: `artifact[0]: unknown artifact kind`. Reports 05/10/12 would have
instructed an implementer to build a validator that rejects 100% of its inputs, or — worse, because it
looks like progress — to loosen `validatePatch` until it accepted them, destroying the one gate that
protects the world.

### 1.1 What replaced it, and why three contracts and not one

The fusion needs model output for three genuinely different jobs, with different trust levels:

| Job | Trust | Frequency | Gate |
|---|---|---|---|
| Define what happens when the world has no rule | lowest (it becomes *engine behaviour*) | rare (only at undefined leaves) | `validatePatch` + sandbox replay + economy LP |
| Try to do something in the world | medium (it is a *request* the engine may refuse) | every turn that is an action | ActionProposal validation + the engine's own resolution |
| Say what happened | none (it cannot change anything) | every turn | structural NarrativeOutput validation |

Collapsing these was the original mistake. One gate cannot be simultaneously a rule compiler, an
intent parser and a prose filter; and a design that pretends it can has no place to put the refusal
case ("the action was not possible"), which is the case the objective most needs.

---

## 2. Contract A — RulePatch

**Identity.** OpenWorld's `Patch` and nothing else. Not extended, not aliased, not re-typed.

**When it may be produced.** Only in response to a `ModRequest` built by `ModPort` from an engine
event that fell into an undefined leaf (`Resolution.hole` / `.open`, `rules.ts:453-470`). The port
asks per *hole and class of event*, not per turn: `buildRequest` (`mod.ts:994`), `signatureOf`
(`:443`) de-duplicates, `AGAIN_AFTER = 3` / `AGAIN_WITHIN = 1200` implement "ask again when the
player keeps trying".

**Pipeline (verified):**

```
event → resolveEvent → undefined leaf → UndefinedSink.raise(ev,res)  [engine.ts:35, :427]
      → ModPort.buildRequest → model → Patch
      → validatePatch(patch, ctx)                                    [mod.ts:1313]
      → sandbox replay of the triggering event + the patch's own derived tests
        (buildSandbox, sandbox.ts:26; Scenario/Expectation)          [sandbox.ts]
      → accepted → library (append-only log; placePatch at the hole key, mod.ts:802)
      → the event is re-resolved with the new rule
      → if refused / timed out / no model: run the hole's default    [engine.ts:431]
```

**Hard constraints (design, not source):**

1. A RulePatch is **never** produced to change a defined outcome. The hole system guarantees this
   structurally: the rule is placed at a hole key and consulted only where the world says undefined.
2. A RulePatch is **never** the general path for "the player bought a sword". A purchase is a defined
   interaction (`act('hands', …, {say:'buy'})` resolving through the merchant's own rules). If a
   purchase is undefined, the patch fills *that hole for that host type*, and it must be written as
   "what a merchant does when asked to sell a thing at this hole", not "give the player a sword".
3. New types and statuses may accompany a rule (that is what `Artifact.kind: 'type' | 'status'` is
   for), and they are validated as definitions, not as instances.
4. The model must not be asked to emit a Patch in the same call that writes prose. Two prompts, two
   schemas, two purposes.

**What it cannot express, ever:** stat deltas, inventory additions, currency, regard, spawning an
instance, moving a specific entity, creating an NPC, or any prose. Those are effects inside rule
outcomes, resolved by the engine when the event occurs.

---

## 3. Why "the validated patch is then applied" is also wrong (C-10)

Report 06 §2.1 drew `validatePatch → EffectRunner applies → Writer → WorldState`, listing effect
primitives as if they were the patch's vocabulary. Nothing applies a patch's contents directly:

- The library is a map of rules by hole key (`RuleLibrary`, `rules.ts:613`; `placeKey`, `:477`;
  `patchKey`, `:480`). Acceptance *installs* a rule.
- Effects run only inside `Engine.run(effects, ev, ruleId)` (`engine.ts:482`), under the write guard,
  with the rule id that produced them, when an event resolves to that rule's leaf.
- There is no `apply(effects)` API, deliberately: an effect array outside a resolution has no host,
  no roles, and no legitimate writer.

So the corrected sentence is: **a validated patch becomes a rule; a rule becomes an outcome; an
outcome becomes effects; effects write state — and only then does anything exist to narrate.**
Four steps, each with its own gate, none of them model-shaped.

---

## 4. Contract B — ActionProposal

### 4.1 Why it is needed

OpenWorld has no conversational input path. The player acts through `Controls` methods driven by the
HUD (`controls.ts`), each of which makes one `Engine.act` call with a fixed parameter shape (V5).
A player who types "I'll give the guard my father's ring" must reach `act('put', player, {e:guard},
{instrument:{e:ring}})` — the same call the gift panel makes — without inventing an engine API and
without letting the model choose arbitrary effects.

### 4.2 The schema (new, strict, no free-form fields)

```ts
type ActionProposal =
  | { kind: 'action';
      actorId: Id;                  // the seat that owns the turn, or an NPC id being driven
      verb: 'use'|'put'|'take'|'hands'|'move'|'craft'|'learn';
      target: { e: Id };            // Ref is exactly this shape (types.ts:1766)
      instrument?: { e: Id } | null;
      params: ProposalParams;       // allow-listed below
      intentText: string;           // the player's words, echoed for the log; never parsed again
      confidence: number;           // 0..1, for the ambiguity policy only
    }
  | { kind: 'no-action'; reason: 'talk'|'question'|'emote'|'nothing' }
  | { kind: 'ambiguous'; candidates: ActionProposal[]; question: string };
```

`ProposalParams` is a closed record — every key below is taken from a verified `act(` call site:

| Key | Type | Verbs | Source call site |
|---|---|---|---|
| `say` | string ≤ 64 | `hands` | `controls.ts:1357` (talk), `:1379` (trade buy/sell) |
| `quest` | Id | `hands` (with `say:'quest'`) | `controls.ts:1360` |
| `topic` | string ≤ 32 | `hands` (with `say:'quest'`) | `controls.ts:1360` |
| `choice` | string ≤ 64 | `hands` | `controls.ts:1361` |
| `item` | Id | `hands` (with `say:'buy'`) | `controls.ts:1379` |
| `into` | `'contents'` | `take` | `controls.ts:1411` (pocket) |
| `dir` | `'up'\|'down'\|'left'\|'right'` | `move` | `engine.ts:1248` |
| `skill` | Id | `learn` | `controls.ts:1428` |
| `profession` | Id | `learn` | the profession form of the same `learn` call; its exact call site was not located — **to be confirmed in Phase 1** (if it does not exist, `profession` is not proposable) |
| `recipe` | Id | `craft` | `controls.ts:1475` |
| `at` | Id | `craft` | `controls.ts:1475` |

Explicitly **not** proposable (engine-computed or internal): `attack`, `power`, `element`, `quiet`,
`reach`, `swap`, `sealed`, `news`, `by`, `of`, `creation*`. These are set by the engine, by the
combat system, or by a control with a guard rail (theft's guilt pre-check, `controls.ts:1408`).

### 4.3 Validation (four layers, none of them a model)

1. **Schema.** Types, closed params, lengths, `verb` in the seven, `kind` discriminants.
2. **Referents.** `actorId` exists and is the seat that owns the turn (or an NPC the turn is
   authorised to drive). `target.e` / `instrument.e` exist and are **visible to the actor** (same map
   or in reach — the narration path may propose what the player can see, not what the model infers
   exists). Ids are opaque; they come from the context projection, never invented.
3. **Legality.** `verb` supported for that target class (talk to a person = `hands`; use on a thing =
   `use`), params allowed for that verb, `say` values that carry required companions
   (`buy` ⇒ `item`; `quest` ⇒ `quest` + `topic`), and talk verbs checked against the same source the
   talk panel uses (the person's available verbs), not against a model's guess.
4. **Authority.** The actor may act: not the wrong seat, not jailed/busy by the engine's own rules
   (the engine re-checks these; the validator's job is to fail early with a clear reason).

Then exactly one call, mirroring `controls.ts`:

| Proposal | Call |
|---|---|
| conversation, topic, question | `act('hands', actor, {e:who}, {instrument:null, params:{say, choice?}})` |
| buy | `act('hands', actor, {e:merchant}, {instrument:null, params:{say:'buy', item}})` |
| sell | `act('hands', actor, {e:merchant}, {instrument:{e:item}, params:{say:'sell'}})` |
| give | `act('put', actor, {e:who}, {instrument:{e:item}})` |
| take / steal | `act('take', actor, {e:item}, {instrument:null, params:{into:'contents'}})` — *through* the guilt pre-check, not around it |
| attack / use | `act('use', actor, {e:target}, {instrument:{e:item} \| null})` |
| move | `act('move', actor, {e:actor}, {instrument:null, params:{dir}})` |
| craft | `act('craft', actor, {e:actor}, {instrument:null, params:{recipe, at?}})` |
| learn | `act('learn', actor, {e:actor}, {instrument:null, params:{skill \| profession}})` |

**Never:** a direct `WorldState` write, an effect array, a `Patch` (that is Contract A, a different
trigger), or an "interact" pseudo-verb (the engine's `interact` helper at `engine.ts:721` merely
chooses `use` or `hands`; the proposal must name the real one).

### 4.4 Rejection and ambiguity policy

The proposal layer must have a *refusal* outcome that is not a hallucinated success:

- **Malformed** (schema/params): one repair retry with the validator's error text. Then treat as
  `no-action` and ask the player to phrase it differently. Never "best effort" coerce.
- **Unknown referent**: `no-action` with the reason "no such thing here" — the digest records it, and
  the narrator may say the character looks around, not that they acted.
- **Illegal for that target** (`use` on a person without a weapon context, `buy` from a non-merchant):
  rejected; the engine would return `defined:false` anyway, but rejecting early yields a better message.
- **Ambiguous** (two plausible targets, e.g. "the sword" with two swords in reach): return
  `ambiguous` with candidates and a question. The player disambiguates. Do not guess: a wrong guess
  mutates the world wrongly, and no layer downstream can tell.
- **Engine refusal** (`{defined:false}`: busy, out of reach, frozen target, protected holder —
  `engine.ts:660-676`): a *failed action*, narrated as failure. This is a feature, not an error path.

### 4.5 NPC proposals

The same contract serves NPC-driven turns (an AI companion, a scripted NPC reasoning about an
intention) with `actorId` set to the NPC. The engine already computes `origin: actorId === player ?
'player' : 'world'` (`engine.ts:638`), so provenance is automatic. The narrator must not voice an
NPC's intention as a decision the engine refused: the digest distinguishes "tried and failed" from
"did not try".

---

## 5. Contract C — NarrativeOutput

### 5.1 Shape

```ts
interface NarrativeOutput {
  turnId: string
  blocks: NarrativeBlock[]          // ordered; at least one
  meta: { model: string; purpose: 'narration'; keptTokens?: number }
}

type NarrativeBlock =
  | { speaker: { kind: 'narrator' }; text: string }
  | { speaker: { kind: 'character'; entityId: Id }; text: string; mood?: Mood };
// Mood is the engine's own union (types.ts:800): neutral|happy|sad|angry|surprised|shy
```

### 5.2 What it may not contain or do

- **No state.** The narrator returns text and speaker ids. There is no field that could be read as a
  mutation, and nothing parses prose for state (the removed Corvus GM pass is *not* reinstated).
- **No unknown speakers.** `entityId` must be an entity the turn's context offered (active map,
  present, or explicitly known). Inventing an NPC in prose is forbidden; inventing one in the world
  requires a rule with a `spawn` effect, authored or learned, not a narrator.
- **No player impersonation.** Blocks may not be attributed to the player entity. (Corvus's prompt
  rule "do not speak for the player" becomes a structural check.)
- **No new facts beyond the digest.** This one is *instructed*, not enforceable structurally, and
  must be stated as such: the validator can reject unknown ids, wrong speakers, overlength and
  empty output, but it cannot prove that a sentence is faithful to the digest. The mitigation is
  ordering (prose after resolution), not validation. Any claim that prose is "verified truthful" is
  false.

### 5.3 Structural limits (enforced, `SRC`-free — new code)

| Limit | Value | Why |
|---|---|---|
| Blocks per turn | 1–6 | Corvus's 1–3 narrator budget was a prompt rule; as a hard cap it prevents runaway multi-voice turns |
| Characters per block | ≤ 1200 | bounded latency and storage |
| Character speakers | must be present on the active map or in the scene's cast list | prevents speaking for absentees |
| Mood | engine union only | portrait faces are indexed by it (`faceFrame`, `runtime/src/assets/looks.ts:16`) |
| Empty output | rejected | a silent turn is a bug, not a style |

On rejection: one repair retry with the specific violation; then a **code-composed fallback line**
built from the digest (e.g. "You take the ring. The guard looks at it."). Degrading to no prose is
acceptable; degrading to invented success is not.

### 5.4 Storage

One record per turn in the narrative store (R2-03 §4.2). Delivered to the client after the
authoritative save (R2-03 §2.2, T10). Never written into `WorldState` — the `narrativeProse` /
`narrativeScene` / `narrativeTurnId` fields of Report 10 §2.3 are withdrawn.

---

## 6. Enforcement map

| Invariant | Where it is enforced | Status |
|---|---|---|
| A model cannot change rules outside a hole | hole keys + placement (`rules.ts:477-485`) | exists (`SRC`) |
| A model's rule cannot write outside its host | `validatePatch` locality + `Writer`/`WriteError` (`world.ts:88,91`) | exists (`SRC`, test exists `NOT RUN`) |
| A model cannot propose arbitrary effects | ActionProposal has no effect vocabulary | new |
| A model cannot write world state | no API exists; single-writer worker | exists (`SRC`) |
| A model cannot invent an outcome | ordering (engine first) + digest-only prose | new (design) |
| A model cannot invent speakers | NarrativeOutput validator | new |
| Prose is faithful to the digest | **not enforceable**; instructed + ordered | limitation, stated |

---

## 7. What the AI is never given

- `WorldState` (only projections: `EntityInfo`, tiles, anchors, `View`, `lookWords`)
- a writer, a mutator, or an effect array
- the save slot, the library file, or file paths
- a credential (see R2-05: BYOK lives in the page's modder worker; server keys live in the Node
  process; neither crosses into a prompt)
- authority to choose its own model tier at play time beyond the player's setting (`AiQuality`,
  `quality.ts:25-56`) and the server's allow-list

---

## 8. Corrections to specific original sections

| Original | Corrected |
|---|---|
| Report 05 §2.3 "GM call … output schema (OpenWorld validatePatch shape)" | GM output does not exist; the three contracts replace it (§2, §4, §5) |
| Report 05 §3.2 GM prompt with `statChanges` etc. "strictly validated" | Withdrawn entirely. No prompt emits state deltas |
| Report 05 §2.1 "(b) act request … `engine.ts:622 actEvent`" | `actEvent` is real but internal; proposals go through `act` (§4.3). `actEvent` builds the event; `act` resolves it |
| Report 05 §1 "8 providers … + 2 others" | Exactly eight, enumerated: `openrouter, anthropic, openai, deepseek, moonshot, gemini, ollama, custom` (`providerList.ts:28-36`) |
| Report 05 §1 "no runtime tool calling in this phase" | `ChatOptions.tools` / `ToolSpec` / `ToolCall` exist (`model.ts:9-30`); the agent harness uses them (`agent/loop.ts:197`) |
| Report 06 §2.1 flow | Replaced by R2-03 §2 |
| Report 08 §4.4 "GM/narrator output schema-validated against validatePatch format" | Replaced by the three-contract split |
| Report 10 §2.3 "`GameMasterOutput` … replace lenient schema with validatePatch schema" | Replaced by ActionProposal + NarrativeOutput |
| Report 12 §2.2 "GM call replaces lenient parse with validatePatch" | Phase 1 no longer contains any GM call; it contains the contract layer |
