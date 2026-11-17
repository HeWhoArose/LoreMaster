# Structural analysis: OpenWorld and Corvus Story Core

This document records what the two source trees actually contain, as inspected in this repository
(`openworld-work/`-era code now lives in the ordinary tracked packages described below;
`corvus-reference/` is the untouched reference copy).

## 1. OpenWorld (the game foundation)

OpenWorld is a TypeScript monorepo (npm workspaces) with these layers:

| Layer | Path | Responsibility |
| --- | --- | --- |
| Engine | `packages/engine/src` | Authoritative simulation: `World`, `Engine.act`, verbs (`use`, `put`, `take`, `hands`, `move`, `craft`, `learn`), rules, effects, ticks, calendar, RNG, `Resolution`. |
| Save format | `packages/format/src` | World/campaign file format, schema, save and load. |
| Content | `games/openworld/content/src` | The actual game: rules, items, NPCs, maps, quests, looks. |
| Web client | `games/openworld/client` | Vite build, Phaser renderer, art baking, `world/index.json` and map chunks under `public/world`. |
| Runtime | `packages/runtime/src` | Browser shell: the Web Worker that owns `Game`, the message protocol, the HUD/menus, IndexedDB storage, the cover/title, input, audio. |
| Android | `android/` + `capacitor.config.ts` | Capacitor shell (`appId com.openworld.rpg`) wrapping `games/openworld/client/dist`. |

### 1.1 Runtime execution flow (before this work)

1. `main.ts` creates the worker once and installs `worker.onmessage`.
2. The title (`ui/cover.ts`) runs a **backdrop**: it sends `{t:'backdrop'}` and draws the frames the worker
   sends back. While `backdropOn` is true, every worker message except `ready`/`incompatible` goes to
   `onBackdrop`.
3. Starting a slot sends `{t:'init', base, save, difficulty, look, ...}`. The worker's `begin()` loads the
   world, `Game.load`s the save, fetches map chunks, posts `{t:'ready'}` and only then starts the tick loop.
4. Player input is keyboard/mouse in the canvas; the worker simulates and sends `{t:'frame'}` deltas that the
   renderer applies. Menus (inventory, dialogue, codex, map, workshop) are DOM panels driven by worker messages.
5. Persistence is IndexedDB via `kvGet`/`kvSet` (`packages/runtime/src/storage.ts`), one record per save slot,
   plus the world index cached in storage.

The important property for this mission: **the worker is the only place with a live `Game`**, and every
mutation of the world happens inside it. Anything that wants to change the world must send it a message.

### 1.2 The pre-existing narration scaffold

`packages/narration` already existed with contracts (`ActionProposal`, `NarrativeOutput`, `RulePatch`),
`act/` (proposal → engine action) and `digest/`. It was **not connected to anything**: no runtime import, no
provider, no turn orchestration, no persistence, no UI. `contracts/index.ts` did not parse (stray `]`, a missing
type import, and validators that referenced fields the types did not have), and `act/index.ts` resolved an
ambiguous proposal by taking the highest-confidence candidate and executing it — the exact behaviour the
mission forbids. The package had no `main`/`types`, so it could not be imported as `@openworld/narration`.

## 2. Corvus Story Core (the narrative source)

`corvus-reference/` is a two-part Node application:

| Part | Path | Responsibility |
| --- | --- | --- |
| Server | `server/index.ts`, `server/routes/*` | Express API: games, chat, characters, settings, images, TTS, agents, ComfyUI. |
| Services | `server/services/*` | The narrative logic: `contextAssembler`, `narrator`, `character`, `gameMaster`, `stateManager`, `summarizer`, `speakerSplitter`, `orchestrator`, `fileManager`, `lmStudio`. |
| Types | `server/types/index.ts` | `NPCCharacter`, `PlayerCharacter`, `WorldState`, `Summary`, `ChatMessage`, `GameMasterOutput`. |
| Client | `client/src` | React UI (`useChat`, `useGames`, `useGameState`, `dialogueSplit`, `chatColors`). |

### 2.1 Corvus turn flow

`orchestrator.ts` builds a character/narrator/group context, calls LM Studio (OpenAI-compatible), splits the
streamed reply into `[Narrator]` / `[Character: Name]` blocks with `speakerSplitter.ts`, then runs a hidden
"game master" JSON pass (`gameMaster.ts`) whose `GameMasterOutput` is applied by `stateManager.ts`. Long
histories are condensed by `summarizer.ts`; everything is stored as JSON chapter files through
`fileManager.ts` (per-game directory, per-game lock, `messages.json`, `characters.json`, `worldState.json`, …).

### 2.2 Why it cannot be dropped in

* Storage is Node `fs` with paths built from a user-supplied `gameId` — not usable in a browser or in Capacitor,
  and the path handling is a traversal risk.
* The API surface is Express with permissive CORS and a settings route that returns provider configuration;
  the client holds the key and calls providers itself. The mission forbids reproducing these.
* Corvus's "game master" writes state directly from model output. OpenWorld must stay authoritative, so that
  step is replaced by `ActionProposal` → validation → `Engine.act`.
* Corvus is a chat application: its state is prose plus a loose `WorldState`, with no simulation to be
  authoritative about. Its *narrative* parts (context shape, character cards, speaker tags, memory, summaries)
  are the reusable material.

## 3. What the fusion therefore had to be

* OpenWorld keeps the simulation, save format, input, rendering and IndexedDB.
* Corvus's narrative ideas are re-implemented as a **pure, dependency-free package** (`packages/narration`) that
  talks to the world through a narrow `EnginePort`, so the same orchestration runs against a fake engine in
  tests and against the real `Game` in the worker.
* Structured model output is validated *before* it can reach the engine, ambiguity is surfaced to the player,
  and the narrative layer only ever describes what `Engine.act` actually returned (`OutcomeDigest`).
