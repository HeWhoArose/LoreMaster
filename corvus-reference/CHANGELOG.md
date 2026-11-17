# Changelog

All notable changes to Corvus Story Core are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/), and the
project follows [Semantic Versioning](https://semver.org/) for the externally
visible API surface.

## [1.1.46] — GitHub-ready README + screenshots

### Background

seb is putting this on GitHub. The previous README was fine for an
internal zip but didn't sell what Corvus actually does to someone
landing cold on the repo page. This version rewrites it as a proper
project README — with screenshots, feature highlights, and the kind of
table-of-contents that scans well on github.com.

### Added

- **`docs/screenshots/`** — six PNG screenshots captured from a fresh
  install with a seeded sample world (Neon Atrium / Kit Mercer / Mira
  Vance / Tasso). Captured at 1440×900 @ 2x DPR.
  - `01-home.png` — empty-state home with game library
  - `02-chat.png` — in-game chat with color-coded NPCs
  - `03-npc-card.png` — NPC card modal
  - `04-settings-llm.png` — LLM endpoint settings (with jailbreak
    prompt field visible)
  - `05-settings-tts.png` — TTS settings (devnen/travisvn dual-fork
    support visible)
  - `06-settings-engine.png` — engine / summarizer / context budget
    settings

### Changed

- **`README.md`** rewritten end-to-end:
  - Lead image + tagline at the top, screenshots in a dedicated
    section, and inline references throughout.
  - Highlights bullets reflect the actual feature set as of 1.1.45 —
    bring-your-own LLM, create-with-AI, TTS with per-NPC voices,
    one-click installers.
  - Troubleshooting expanded with the specific TTS error messages the
    1.1.43 work introduced (refused / unreachable / timed out).
  - Tech-stack and contributing sections.
  - Trailing changelog summary that points at CHANGELOG.md for detail.

### Notes

- Screenshots were captured with TTS / ComfyUI / LM Studio all
  unconfigured; nothing in them is gated behind external services
  being live.
- The README is owner-agnostic — no hard-coded GitHub username, repo
  name, or CI badges. Drop those in once the repo exists.

## [1.1.45] — one-click installers for Linux and Windows

### Background

Until now first-time setup meant knowing to run `npm install` in two
directories and then `npm run dev`. That's fine if you live in a
terminal, but seb wanted something a non-dev friend could double-click.
This ships the obvious thing: a pair of shell scripts for Linux/macOS
and a pair of `.bat` files for Windows.

### Added

- **`install.sh`** (Linux/macOS) — checks for Node 18+, installs root
  and `client/` deps, then builds the client. Idempotent; safe to re-run.
- **`start.sh`** (Linux/macOS) — auto-runs `install.sh` if
  `node_modules` is missing, then launches `npm run dev` (server + Vite
  HMR). Set `CORVUS_PROD=1` to serve only the built bundle via
  `npm run start`. Honors `PORT` and `HOST` env vars (defaults
  `127.0.0.1:3000`).
- **`setup.bat`** (Windows) — Windows equivalent of `install.sh`. Uses
  `where node` / `where npm` for PATH checks and bubbles up non-zero
  exit codes from each `npm install` step.
- **`run.bat`** (Windows) — Windows equivalent of `start.sh`. Same
  `CORVUS_PROD` / `PORT` / `HOST` env-var contract.

### Notes

- The scripts only orchestrate `npm` — they don't bundle Node itself.
  The install steps fail fast with a clear message and a link to
  nodejs.org if Node is missing or older than 18.
- All four scripts `cd` to their own directory first, so they work
  regardless of where you double-click them from.
- Linux/macOS scripts are shipped with the executable bit set; if your
  unzip tool strips it, run `chmod +x install.sh start.sh` once.

### Verified with these patterns

- Fresh clone → `./install.sh` → `./start.sh` → server reachable at
  `http://127.0.0.1:3000`.
- Existing checkout → `./start.sh` skips install, goes straight to dev.
- Windows: `setup.bat` then `run.bat` from File Explorer double-click.

## [1.1.44] — devnen Chatterbox-TTS-Server support

### Background

Seb is running [devnen/Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server),
not the travisvn fork I designed against in 1.1.42. The two servers share
`/v1/audio/speech` but disagree on everything else — devnen exposes a real
voice catalog via `/get_predefined_voices` and `/get_reference_files`,
defaults to port `8000`, and only supports `wav` / `opus` output. The
1.1.43 fix correctly degraded to free-text input, but it left devnen users
without the dropdown they should be getting.

### Added

- **devnen endpoint support**: `listVoices()` now probes
  `/get_predefined_voices` and `/get_reference_files` in parallel
  alongside `/v1/voices`, then de-dups + tags each voice with its
  `source` (`predefined` / `reference` / `openai`).
- **Grouped voice dropdown** in the TTS settings panel: predefined and
  cloned reference voices appear under separate `<optgroup>` headers so
  it's obvious which are server presets vs. uploaded clones.
- **Per-NPC voice dropdown** when the server publishes a catalog (devnen
  case). Free-text input is retained as a fallback for travisvn-style
  servers without a catalog.
- **Voice-filename pretty-printing**: `female_01.wav` shows as `female 01`
  in the dropdown while still being stored as the raw filename.

### Changed

- **`testConnection()` now probes a candidate list**:
  `/get_predefined_voices` → `/health` → `/docs` → `/`. First 2xx wins.
  Network-level errors (refused / unreachable / timed out) short-circuit
  the loop so you don't burn 30 seconds on a dead host.
- **Voice payload normalizer** accepts devnen's two shapes (bare
  filename array OR `{ filename, display_name }` objects) in addition
  to the existing OpenAI shapes (`{ voices }`, `{ data }`, bare array).
- **Default config**: server URL now `http://localhost:8000`, format
  `wav`. Both match devnen defaults; travisvn users just change the port
  to 4123.
- **Audio format dropdown** labels `mp3` and `flac` as "(travisvn only)"
  so devnen users don't pick a format their server can't produce.
- **Settings panel** quietly refreshes voices on mount when TTS is
  already enabled (silent failure if the probe fails) so the dropdown
  is populated on first open without needing to hit Test.

### Migration

None required. Existing saves with `format: 'mp3'` and the old default
URL continue to work — the new defaults only apply to fresh installs.

### Verified with these patterns

- `tsc --noEmit` clean (server + client).
- Against devnen/Chatterbox-TTS-Server: Test connection finds
  `/get_predefined_voices`, dropdown populates with grouped predefined
  and cloned voices, NPC card swaps to a select.
- Against travisvn/chatterbox-tts-api: Test connection falls through to
  `/health`, no catalog returned, fields stay as free-text inputs.
- Against a dead host: "Connection refused…" surfaces immediately from
  the first probe; the remaining candidates are skipped.
- Against a wrong port that silently drops: "Connection timed out (8s)."

## [1.1.43] — Chatterbox TTS fixes (no voice catalog, real health probe)

### Background

Seb spun up chatterbox-tts-api at `http://192.168.18.7:1918`, hit Test, and
got a stream of `Connection refused` errors plus an empty voice dropdown.
Two unrelated bugs were stacked on top of each other:

1. **chatterbox-tts-api has no voice catalog.** Voices are server-side
   sample files (`voice-sample.mp3` by default), not named entries
   queryable from the API. Our settings panel was polling a `/v1/voices`
   endpoint that simply doesn't exist on that server, then surfacing the
   404 as a fatal error in the dropdown.
2. **The reachability test used the same nonexistent endpoint**, so
   "Connection refused" got mixed up with "endpoint missing" and the user
   couldn't tell which one was actually happening.

### Changed

- **`testConnection()` now hits `GET /health`** (with `/config`, `/docs`,
  and `/` as fallbacks for forks that don't expose `/health`). This is
  a definitive reachability check that works on every Chatterbox fork
  surveyed (travisvn, devnen, chatterboxtts.com). The voice list is
  pulled in as a best-effort side-effect, not a precondition.
- **`listVoices()` treats 404 / 405 as "this fork has no voice catalog"**
  and returns `{ ok: true, voices: [] }` instead of `{ ok: false }`. Only
  actual network failures (ECONNREFUSED, ENOTFOUND, EHOSTUNREACH,
  ETIMEDOUT, AbortError) are reported as errors, each with a distinct
  human-readable message.
- **Narrator voice + per-NPC voice are now free-text inputs** with an
  optional `<datalist>` autocomplete. When the server happens to publish
  a voice list, you get a dropdown; when it doesn't (the common case),
  you type the basename of a voice sample file on the server.
- **`GET /api/tts/voices` accepts `?url=` and `?apiKey=` query params**
  so the settings panel can probe a custom server before saving.
- Settings panel no longer auto-polls `/v1/voices` on mount — it only
  probes when the user explicitly hits Test connection. This eliminates
  the burst of "Connection refused" log lines that appeared while typing
  out a server URL.

### Migration

None required. The `narratorVoice` field is still a plain string; the
only difference is the UI no longer constrains it to dropdown options.
Existing per-NPC voice ids continue to work — they're now stored as
free-text values.

### Verified with these patterns

- `tsc --noEmit` clean (server + client).
- Pointing at an unreachable host → "Connection refused. Is the
  Chatterbox server running on that URL?" (only on actual ECONNREFUSED).
- Pointing at a wrong port that silently drops packets → "Connection
  timed out (8s)."
- Pointing at a real travisvn/chatterbox-tts-api server → "Connected ·
  server reachable (no voice catalog — use a sample filename)".
- Pointing at devnen/Chatterbox-TTS-Server (which DOES publish voices)
  → dropdown populated, free-text input still accepted.
- No background `/voices` polling visible in server logs while editing
  the settings form.

## [1.1.42] — Chatterbox TTS

### Background

Seb wanted text-to-speech for chat, hooked up to a local
[Chatterbox](https://github.com/resemble-ai/chatterbox) server — narrator and
per-NPC voices, polled voice list, a queue so two characters never talk over
each other, plus volume and a pause/resume control on the side. Defaults
stay conservative: TTS is **off** out of the box so existing saves aren't
affected, and an NPC without an explicit voice just falls through to the
narrator.

### Added

- **Server `chatterbox` client** (`server/services/chatterbox.ts`) targeting
  the OpenAI-compatible `/v1/audio/speech` endpoint plus `/v1/voices`.
  `normalizeVoices()` tolerates three shapes seen across forks of
  chatterbox-tts-api: `{voices: […]}`, `{data: […]}`, and a bare array;
  items may be strings or `{id, name, voice_id?}`. Bearer auth via the new
  `apiKey` setting; URL is trailing-slash safe like `lmStudio.buildUrl`.
- **`GET /api/tts/voices`**, **`POST /api/tts/synthesize`**, and
  **`POST /api/tts/test`** routes. The synthesize endpoint proxies raw
  audio bytes back to the browser so the client doesn't need direct CORS
  access to Chatterbox. Errors carry a stable `code: 'tts_unreachable' |
  'tts_error'` wire identifier, mirroring `lm_studio_unreachable`.
- **Client `useTTSEngine` + `TTSProvider`** (in `client/src/context/TTSContext.tsx`)
  give the whole app one shared queue, single `<audio>` element, and one
  volume slider. The dock, the per-message Play button, and the settings
  panel all act on the same engine.
- **Dialogue splitter** (`client/src/utils/dialogueSplit.ts`) — pure
  function, no DOM. Three passes: speaker-tag prefix (`Aria: "…"`),
  say-verb attribution (`"…" Aria whispered`), and bare quotes (narrator).
  Adjacent same-voice segments get coalesced so the queue doesn't fragment
  long narrator runs into dozens of clips. Accepts a first-token nickname
  match so `Aria Vex` still matches a `Aria:` tag.
- **TTS settings tab** (`client/src/components/settings/TTSSettings.tsx`) —
  enable toggle, server URL, optional API key, narrator voice dropdown
  (populated from `/tts/voices`), audio format (mp3/wav/flac/opus),
  volume, speed, autoplay, and a Test button that pings the server and
  refreshes the voice list in place.
- **Per-NPC voice controls** on the NPC card — a compact block under the
  existing "Voice / style" field. Toggle reads-aloud and pick a voice;
  defaults to enabled + narrator voice so existing saves still play.
- **`TTSDock`** (`client/src/components/common/TTSDock.tsx`) — floating
  bottom-right card visible whenever TTS is enabled. Status dot (idle /
  speaking / paused), now-speaking label, pause/resume, skip, clear, and
  a volume slider. Hidden when TTS is off so the chat surface stays clean.
- **Per-message Play button** on every assistant message. Single-speaker
  character messages are spoken with that NPC's voice; narrator/storyteller
  messages are routed through the dialogue splitter first.
- **Auto-play on stream finish** — `ChatPanel` watches the streaming
  falling edge and enqueues every assistant message since the last user
  turn. A `spokenRef` set keeps swipes and regenerates from re-triggering
  playback on the same message id.

### Changed

- `TTSSettings` added to `GlobalConfig` (`enabled`, `url`, `apiKey?`,
  `narratorVoice`, `format`, `volume`, `autoPlay`, `speed`). Defaults at
  `enabled: false`, `url: 'http://localhost:4123'`, `format: 'mp3'`,
  `volume: 1.0`, `autoPlay: true`, `speed: 1.0`.
- `NPCCharacter.tts?: { enabled, voice }` — both optional. Missing or
  empty `voice` falls through to `narratorVoice`; `enabled: false`
  forces narrator voice even if a voice is configured.
- Settings modal gains a fifth tab between Engine and Appearance.

### Migration

None required. Existing config files pick up the new `tts` block via the
legacy-merge path in `fileManager.ts`. Existing NPC files have no `tts`
field and therefore read aloud with the narrator voice (after TTS is
enabled and a narrator voice is chosen).

### Verified with these patterns

- Server `tsc --noEmit` clean.
- Client `tsc --noEmit` clean.
- TTS off (default): no dock visible, no Play buttons, no auto-play
  effect runs.
- TTS on, no narrator voice picked: server picks its own default voice.
- TTS on with mixed storyteller message: splitter routes `"Get back!"
  Aria yelled, but Bran just laughed.` as Aria-voice / narrator /
  narrator, coalescing the trailing narration.
- Skip during playback aborts the current item and advances to the next.
- Clear empties queue and stops audio; disabling TTS does the same.

## [1.1.41] — Global jailbreak prompt

Seb wants a single knob that injects a chunk of prompt text in front of every single LLM call — storytelling, GM extraction, the design-with-AI flows for both new games and new character chats, the summarizer, the image-chat agent, the From Image draft generator, all of it. The use case is partly classic uncensoring ("ignore prior content policies"), partly stamping a global persona ("always reply in the voice of an obsequious dungeon master"), and partly making the same prompt work across very different backends (LM Studio defaults vs. OpenAI's stricter system).

### Background

With v1.1.40 the codebase now talks to a half-dozen possible OpenAI-compatible endpoints, each with its own default behavior. Some refuse certain content out of the box; some lean very anodyne in their stock system; some can be steered with a single sentence at the top. There are eight distinct call sites in the server that build their own `messages` array — the storyteller stream in `orchestrator.ts` (two of them, for retries), the GM extractor in `gameMaster.ts`, the summarizer in `summarizer.ts`, the four agent routes in `agents.ts` (design-chat, design-character-chat, from-image, regen-image-prompt), and the image-chat agent's stream + non-stream fallback in `imageChatAgent.ts`. Asking every one of those to prepend the same prompt would be eight near-identical edits, eight chances to forget, and a hassle for every future call site.

The right place to do this is `lmStudio.ts` — the single chokepoint every caller already goes through. Every chat completion ends up in `chatCompletion` or `chatCompletionStream`; both already resolve settings from `fileManager` via `resolveSettings`; both already merge in caller overrides. Adding one helper that prepends a system message at index 0 covers every present and future call site without touching any of them.

OpenAI, LM Studio, vLLM, OpenRouter, llama.cpp's HTTP server, and Ollama's OpenAI shim all accept multiple system messages in the `messages` array and concatenate them in order. So the cleanest representation is a literal extra `{ role: 'system', content: <jailbreak> }` at index 0 — NOT a merge into the existing system message. Merging would require knowing whether the caller's system content is a string or a content-parts array (vision flows use the array shape), and it would entangle two unrelated prompts that the model is better off seeing as separate slots.

### Added
- **`jailbreakPrompt?: string` on `LMStudioSettings`** (server + client types). Optional. When trimmed-non-empty, it gets prepended as an extra `{ role: 'system', content: <trimmed> }` message at index 0 of every `messages` array sent through `chatCompletion` and `chatCompletionStream`. Blank string → nothing is prepended and behavior is bit-identical to v1.1.40.
- **`applyJailbreakPrompt(messages, settings)` helper** in `server/services/lmStudio.ts`. Pure function: takes the caller's `messages` array and the resolved settings, returns either the original array unchanged (no jailbreak configured) or a new array with the system message prepended. Both `chatCompletion` and `chatCompletionStream` now call this immediately after `resolveSettings(opts)` and use the result as the request body's `messages`. Single source of truth: every call site benefits without touching any caller.
- **Jailbreak Prompt textarea on the LLM Endpoint settings panel.** 6-row monospace textarea, no spellcheck, with hint text spelling out the scope: "Prepended as a system message in front of EVERY request — storytelling, GM, summarizer, design-with-AI, image-chat. Use to override model defaults or stamp a global persona. Leave blank to disable." Placeholder gives a concrete example so the user knows the input format.

### Changed
- **`chatCompletion` request log** now reports the post-jailbreak message count plus a `[jailbreak prepended]` marker when applicable, so it's obvious from the logs whether the prefix is active on a given request: `chatCompletion → ... messages=12 [jailbreak prepended]`.
- **`chatCompletionStream` request log** — same treatment for the streaming path.
- **No call-site changes.** The 8 existing chat-completion call sites (orchestrator x2, gameMaster, summarizer, agents.ts x4, imageChatAgent x2) are untouched. The jailbreak is applied centrally, so every present and future caller picks it up automatically.

### Migration
- **No on-disk migration needed.** `jailbreakPrompt` is optional. Existing saves load with the field undefined, the helper trims-and-checks for empty, returns the message array unchanged, and behavior is bit-identical to v1.1.40.
- **No defaults block change.** The default config in `fileManager.getDefaultConfig` doesn't set `jailbreakPrompt` — leaving the field absent on fresh installs means the helper short-circuits with zero allocations.
- **No API/route change.** This is a settings field that flows through the existing `GlobalConfig` PATCH endpoint and is read on every chat completion from `getFileManager().getConfig().lmStudio`. The wire shape gains an optional field; clients that don't know about it just don't set it.

### Verified with these patterns
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.
- **Leave the Jailbreak Prompt field empty** → every existing flow (storyteller stream, GM extraction, summarizer, design agents, image-chat) sends the exact same messages array as v1.1.40. Server log shows `messages=N` with no jailbreak marker.
- **Paste a jailbreak string and save** → next storyteller turn's server log shows `messages=N+1 [jailbreak prepended]`. The streamed response reflects the new persona / policy override.
- **Test the scope by triggering each flow** — (1) take a turn in an existing game (orchestrator stream), (2) wait for GM extraction to fire (gameMaster non-stream), (3) cross the summary threshold (summarizer non-stream), (4) open New Game → Design with AI and chat with the agent (agents.ts design-chat), (5) open New Character Chat → Design with AI (agents.ts design-character-chat), (6) From Image on either new-game or new-character (agents.ts from-image), (7) regenerate image prompt on an NPC (agents.ts regen-image-prompt), (8) generate a portrait via the image chat agent (imageChatAgent stream + fallback). All eight call sites log `[jailbreak prepended]`. All behave consistently with the prepended prompt.
- **Clear the field back to empty** → next request omits the prepended message. Reproducibility: the model behaves as it did before the jailbreak was set.
- **Whitespace-only input** (just spaces / newlines) → `trim()` makes the helper short-circuit; no message is prepended, log shows no marker. Effectively the same as empty.
- **Long jailbreak (~2k tokens)** → prepends fine; the request goes through; the model context window is just consumed by that much. No retries, no truncation magic — if the prompt is bigger than the window it's the user's call.
- **Vision flow with a content-parts user message** (From Image) → the new system message is a plain string and sits at index 0; the user message with its `image_url` content parts is untouched at index 1. LM Studio, vLLM, and OpenAI all parse this correctly.
- **Round-trip the settings modal** — type a jailbreak, click Save, reopen the modal → textarea still shows the saved text. Refresh the page → still there. Clear and Save → field saves as empty string, helper short-circuits on next request.

## [1.1.40] — OpenAI-compatible endpoints (vLLM, OpenAI, OpenRouter, …)

Seb is running models on vLLM now — partly because LM Studio is fine for desktop tinkering but doesn't really scale for the longer cultivation sessions, and partly because being able to point Corvus at OpenAI or OpenRouter for a one-off without rebuilding anything is just useful. The settings tab was titled "LM Studio" and the code was sending unauthenticated requests, so vLLM with its `--api-key` flag and OpenAI both 401'd immediately. Underneath, the lmStudio client was already calling a generic `/v1/chat/completions` — it just didn't know how to send a bearer token or a model id.

This broadens the LLM endpoint to anything OpenAI-compatible without renaming a single on-disk field. Two new optional settings (API Key, Model), a few honest label changes, no schema churn.

### Background

The chat client in `server/services/lmStudio.ts` has always hit POST `/v1/chat/completions` with the standard OpenAI request body (`messages`, `temperature`, `top_p`, `max_tokens`, `stream`). LM Studio implements that surface, but so does every other inference server worth mentioning. The blockers preventing "just point at vLLM" were narrow:

1. **No bearer-token auth.** Local LM Studio doesn't require one, so the client never sent `Authorization: Bearer ...`. OpenAI and any vLLM started with `--api-key` reject the request with 401.
2. **No model id in the request body.** LM Studio ignores the `model` field and just uses whatever is currently loaded, so the client never bothered setting it. vLLM (typically one model per server, but the field is required) and OpenAI (model is mandatory — it picks the deployment) both 400 without it.
3. **All user-facing copy said "LM Studio".** Reachability errors, the settings tab label, the From Image panel, every connection-test string. Pointing at vLLM and seeing "Could not reach LM Studio" is confusing even when it's true.

The `LMStudioSettings` type and the `lmStudio` config key are kept as-is. Renaming `lmStudio` → `llmEndpoint` everywhere would touch ~50 files and require a careful on-disk migration for every existing save's `config.json` — for zero functional gain. The historical name stays as an internal label; the UI tells the truth.

### Added
- **`apiKey?: string` on `LMStudioSettings`** (server + client types). When non-empty (after trim), the client sends `Authorization: Bearer <apiKey>` on every chat completion, streaming chat completion, `/v1/models` test ping, and `/api/v0/models` vision-capability probe. When blank, the header is omitted entirely so plain LM Studio (which 401s on unexpected headers in some builds) continues to work with zero changes.
- **`model?: string` on `LMStudioSettings`** (server + client types). When non-empty (after trim), the client writes it into `body.model` on chat completion / streaming chat completion requests. When blank, the field is omitted — LM Studio behavior preserved exactly.
- **API Key field in the LLM Endpoint settings panel.** `<input type="password">`, `autoComplete="off"`, with hint text spelling out "Sent as Authorization: Bearer — required for OpenAI / hosted vLLM, leave blank for local LM Studio." Saves through the same `updateConfig` PATCH the URL and other fields use; the on-disk shape just gains an optional `apiKey` key.
- **Model field in the LLM Endpoint settings panel.** Plain text input with the hint "Required by vLLM and OpenAI (e.g. 'gpt-4o-mini', 'meta-llama/Llama-3.1-8B-Instruct'). Leave blank for LM Studio."
- **`buildHeaders(settings, extra?)` helper** in `lmStudio.ts`. Single source of truth for what headers go on every outbound request — `Content-Type`, optional `Authorization`, plus per-call additions (the streaming path adds `Accept: text/event-stream`). Replaces the three previous inline header literals.
- **`providerLabel(settings)` helper** in `lmStudio.ts`. Reads the configured URL and returns a friendly provider name for logs and error messages: "OpenAI" for `api.openai.com`, "OpenRouter" for `openrouter.ai`, "LM Studio" for `localhost:1234`/`127.0.0.1:1234`, "LLM endpoint" otherwise. Cheap to compute, no network calls.

### Changed
- **Settings tab label** is now "LLM Endpoint" (was "LM Studio"). The component file name (`LMStudioSettings.tsx`) and the config key (`lmStudio`) are unchanged — only the user-visible string moved.
- **LLM Endpoint settings panel intro line** now says: "Works with any OpenAI-compatible `/v1/chat/completions` endpoint — LM Studio, vLLM, OpenAI, OpenRouter, llama.cpp's HTTP server, LocalAI, etc." with concrete example URLs in the API URL field hint.
- **`chatCompletion` and `chatCompletionStream`** — write `body.model = settings.model` when configured, send `Authorization: Bearer ...` when an API key is set, log the resolved provider name plus the model id (or `<loaded>` placeholder when the field is blank).
- **Error messages thrown from `lmStudio.ts`** now use the provider label instead of hardcoding "LM Studio". `${provider} error ${res.status}: ${text}` for non-stream failures, `${provider} stream error ${res.status}: ${text}` for stream failures. So pointing at OpenAI and getting a 429 surfaces as "OpenAI error 429: ..." not "LM Studio error 429: ...".
- **`testConnection`** — sends auth headers; distinguishes 401/403 from generic HTTP errors with a clearer message ("the endpoint rejected the API key. Check the API Key field in settings."); generic error strings no longer mention LM Studio ("Is the server running?" instead of "Is LM Studio running?").
- **`probeVisionCapability`** — sends auth headers on both the enhanced `/api/v0/models` probe and the fallback `/v1/models` listing. Preference order for picking the model to inspect is now: configured `settings.model` if the server lists it → configured `settings.model` even if not listed → first listed model → nothing. So a configured vLLM/OpenAI model id is the one we vision-check, not whatever happens to be at `data[0]`.
- **`POST /api/settings/test/lm-studio` body shape** still keys on `url`, but now also accepts `apiKey` and `model`. The route already spreads `req.body` straight into the settings override, so the wire change is just the client sending three fields instead of one.
- **`testLMStudio` API client signature** widened from `{ url?: string }` to `{ url?: string; apiKey?: string; model?: string }`. Same change propagated through `useSettings.ts` and the `SettingsPage` prop type so the draft API key and model in the settings modal are tested live, not the last-saved values.
- **User-facing error copy** — "Could not reach LM Studio" becomes "Could not reach the LLM endpoint" in `agents.ts` (4 strings), in `FromImagePanel.tsx` (4 strings), and in the LM Studio settings test result. The error `code: 'lm_studio_unreachable'` on the wire stays the same — it's a stable identifier the client switches on, renaming it would mean a coordinated server+client change for no gain.
- **From Image panel header strings** — "Connecting to LM Studio…" → "Connecting to the LLM endpoint…"; "LM Studio not reachable" → "LLM endpoint not reachable".
- **No-vision user message** in `agents.ts` no longer says "in LM Studio" — reads "Please load (or configure) a vision-capable model — e.g. LLaVA, Qwen2-VL, MiniCPM-V, Gemma 3, Pixtral, GPT-4o — and try again." so it's accurate whether the user is on LM Studio (load model) or OpenAI (configure model id).

### Migration
- **No on-disk migration needed.** Both new fields are optional — `apiKey?` and `model?`. The existing `lmStudio` block in every save's `config.json` reads back unchanged, both fields default to `undefined`, and behavior is bit-for-bit identical to v1.1.39 until the user touches the new settings.
- **No env-var migration.** Nothing was reading env vars for the endpoint; nothing reads env vars for the key. Both live in `config.json` (or the in-memory draft in the settings modal).
- **Config key name is preserved.** The on-disk JSON still has a `lmStudio: { url, ..., apiKey?, model? }` block. Renaming would require a careful one-time migration in `fileManager.getConfig` and a corresponding fallback path for old saves — not worth the churn for an internal label.

### Verified with these patterns
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.
- **Plain LM Studio on localhost:1234, no API key, no model** → settings page shows API Key (empty) and Model (empty) fields, Test connection still returns OK with the loaded model name, chat completions still stream, no `Authorization` header is sent. Bit-identical to v1.1.39 behavior.
- **vLLM at `http://localhost:8000/v1` started with `--api-key sk-fake-key` serving `meta-llama/Llama-3.1-8B-Instruct`** → paste the URL, key, and model id; Test connection returns OK; new games stream story responses; the GM JSON-extraction non-stream call also works. Settings page shows the password field masked.
- **vLLM with the API key, but the Model field left blank** → vLLM's `/v1/models` returns the served model id, and we still send no `body.model`. vLLM returns 400 "You must provide a model parameter" — user sees "LLM endpoint error 400: ...". Filling the Model field fixes it. Documenting the failure mode in the field's hint.
- **OpenAI at `https://api.openai.com/v1` with a real `sk-...` key and `gpt-4o-mini`** → Test connection returns OK and lists hundreds of models. Chat stream works end-to-end. Error messages now say "OpenAI error 429: ..." instead of mentioning LM Studio.
- **API key typo / forgotten key on a server that requires one** → Test connection returns "HTTP 401 — the endpoint rejected the API key. Check the API Key field in settings." rather than the bare "HTTP 401".
- **From Image panel against vLLM with a vision model loaded (Qwen2-VL)** → reachability check passes (sends the bearer token), image upload works, draft is generated. Heuristic vision detection still keys off the model name like before.
- **Image-prompt regeneration against OpenAI gpt-4o** → streaming auth header is sent, response streams normally, retry/abort still work.
- **Unreachable endpoint** → "Could not reach the LLM endpoint. Make sure it is running and the URL in Settings is correct." Wire code stays `lm_studio_unreachable` so the existing client-side switch still matches.
- **Round-trip the settings modal** — type a URL, key, and model, click Test (sees "Connected"), click Save, reopen the modal → all three fields are still populated. Refresh the page → still populated. Wipe the key field → saved as empty string, next request omits the Authorization header.

## [1.1.39] — "Design with AI" for character chats

Seb pointed out an obvious asymmetry: NewGameDialog has a "✨ Design with AI" tab that opens a chat with the design agent, you describe the vibe, it asks a couple of questions, then drops a JSON draft into the form. NewCharacterChatDialog (the 1-on-1 character-chat creator) had Manual + Import Card but no AI flow — if you wanted to riff on a character idea you had to either fill the form yourself or import someone else's card from chub.ai. This adds the same agent-chat flow to the character-chat dialog.

### Background

The game-design agent lives in `server/routes/agents.ts` as `POST /api/agents/design-chat` with a system prompt that walks the user through genre / setting / tone / stats / starting inventory, and emits a fenced JSON draft when the user says "make it". The client side is `DesignGameChat.tsx`, which manages the chat history, calls the endpoint, and renders a "Draft ready — Apply to form / Discard" card when the agent finally returns a `suggestion`. NewGameDialog wires it in as a third view (`'form' | 'chat' | 'image'`) with an apply callback that fills every form field from the draft and snaps back to the form for review.

The character-chat dialog needs almost exactly that flow, just with a different system prompt and a different draft shape — no world, no stats, no inventory, no abilities, just the seven CharFormState fields plus an optional opening line. The `extractDraft` parser in agents.ts already keys readiness on a top-level `name` field, which works for both the game payload (`name` = game title) and a character payload (`name` = character name), so the same extractor handles both.

### Added
- **`POST /api/agents/design-character-chat`** in `server/routes/agents.ts`. Mirrors `/design-chat` exactly — same `history` body, same `{ reply, suggestion }` response, same `extractDraft` parser. The system prompt is character-chat shaped: directs the agent to keep questions focused on who the character is (appearance, personality, background, known info, voice style, disposition), and to optionally suggest a chat title, player name, and starting message. Stresses that this is NOT a full open-world game so the agent doesn't try to invent stats or currency. Readiness sentinel is still a fenced JSON block with a top-level `name`.
- **`DesignCharacterDraft` interface and `designCharacterChat()` API client** in `client/src/api.ts`. Loose-typed shape (all fields optional) covering the seven CharFormState fields plus `chatTitle`, `playerName`, `startingMessage`, and `image.basePrompt`/`baseNegative`.
- **`DesignCharacterChat.tsx`** in `client/src/components/sidebar/`. Close mirror of `DesignGameChat.tsx` — same chat-history state machine, same `INTRO_MESSAGE` pattern, same Bubble / DraftPreview / Row primitives, same Enter-to-send / Shift+Enter-for-newline keybindings, same auto-scroll behavior. The draft preview shows Appearance / Personality / Background / Voice / Known info / Opening line instead of the game-shaped Setting / Tone / Era / Currency / Stats rows.

### Changed
- **`NewCharacterChatDialog.tsx`** — tab union widened from `'manual' | 'card'` to `'manual' | 'card' | 'design'`. New "✨ Design with AI" tab sits between Manual and Import Card. Selecting it renders `<DesignCharacterChat onApplyDraft={applyDraft} />` in the modal body. The existing Create button is still disabled outside the Manual tab with the existing tooltip, so the flow forces the user back to Manual to review before persisting.
- **`applyDraft(d: DesignCharacterDraft)`** added next to the existing `handleCardFile`. Writes only the fields the draft actually provides (preserves existing form state for omitted fields so a partial draft doesn't blank out a name the user already typed). `chatTitle` and `playerName` only overwrite when the draft has a non-empty trimmed value. A non-empty `startingMessage` seeds the existing greetings list with a single entry and selects it — reuses the Starting message picker section that already exists for imported cards, so the AI-suggested opening line gets the same review-and-toggle UX. Finally calls `setTab('manual')` so the user lands back on the form.

### Migration
- **No on-disk migration needed.** Pure UI + server-route addition.
- **No schema changes.** Character creation still goes through the existing `createGame` + `createCharacter` + `seedMessage` calls in `submit()` — the AI flow just pre-fills the same form the user would have filled by hand.
- **No client-state migration.** The dialog resets all its state on close, including the new `'design'` tab value; old saves and old dialog opens are unaffected.

### Verified with these patterns
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.
- **Open the dialog, switch to Design with AI** → the chat panel renders with the intro message, input area at the bottom, Enter to send. Manual / Import Card tabs still selectable.
- **Type a one-liner like "a grumpy elven librarian who secretly bakes"** → agent asks one or two clarifying questions (appearance? voice?) and does NOT emit a draft. Reply renders as an assistant bubble, no "Draft ready" card.
- **Reply "make it"** → agent emits the fenced JSON block, server's `extractDraft` strips the fence from `reply` and surfaces the parsed object as `suggestion`, the Draft ready card appears with Apply to form / Discard.
- **Click Apply to form** → dialog snaps back to Manual tab, every populated field shows the drafted text, the Create button enables (name is non-empty). Editing any field works as it did before.
- **Draft includes a `startingMessage`** → the existing Starting message section appears with one entry, defaulted to selected. Switching the radio to "No starting message" or back works.
- **Draft does NOT include `chatTitle` or `playerName`** → `setChatTitle`/`setPlayerName` are not called, existing values (including the default `'You'`) are preserved.
- **Click Discard inside the Draft ready card** → the card disappears, chat history is preserved, user can keep iterating with the agent.
- **Switch to Import Card after applying a draft** → card import flow still parses and overwrites form fields the same way it did before. (AI-drafted fields are not protected from card import — last-write wins, same as v1.1.38.)
- **Reopen the dialog after closing** → reset() returns the tab to `'manual'`, form to EMPTY_CHAR, greetings cleared, no leaked state from the previous AI session.

## [1.1.38] — Multi-currency support

Seb is running a cultivation game where the protagonist is supposed to be juggling low-grade, mid-grade, and high-grade spirit stones, and also has a separate xianxia-flavored gold/silver/copper coin system from mundane merchants. The v1.0 player card was built on the assumption that there is exactly one `money` value and a label for it, which worked fine for fantasy gold and sci-fi credits but falls apart the moment you need denominations. The GM was either lumping everything into `money` (lossy — "50 gold" might actually be "50 high-grade spirit stones") or sneaking denominations into `statChanges` (then they showed up in the stat row next to HP).

Fix is a second currency map on the player — `extraCurrencies: Record<string, number>` — plus a new `currencyChanges` channel in the GM output that the GM is now directed to use for ALL currency operations, primary included. The InfoPanel currency section becomes multi-row with rename / delete / add for the extras.

### Background

The player schema has carried a singular `money: { amount, currencyName }` since v1.0. Every save on disk has it, several screens render it, and the GM prompt already knows how to drive it. Renaming `money` or removing it would be a destructive migration for no good reason — the primary slot is fine, it just needed siblings.

The statChanges-as-currency hack was the obvious wrong workaround. statChanges already has a special-case branch for `field === "money"` in `applyStatChange` (legacy from before money was its own field), which is how the GM was getting away with "add 50 gold" via statChanges. But statChanges is keyed by stat name with no notion of separate denominations, so "50 gold + 3 silver" can't be expressed at all, and the storyteller has no UI affordance for the player's full purse — it would just see whatever leaked into `money`.

The right shape is the same one NPC inventory uses: a primary slot plus a free-form map keyed by human-readable name. The GM gets a dedicated currency channel so denomination semantics aren't smuggled through a stat-shaped hole.

### Added
- **`extraCurrencies?: Record<string, number>` on `PlayerCharacter`** (server + client types). Optional, keys are the human-readable currency names preserved case-sensitively as the GM or user first wrote them, values are non-negative integers (subtract floors at zero). Existing saves without the field continue to load — the map is treated as empty.
- **`GameMasterCurrencyChange` interface** — `{ name: string; operation: 'set' | 'add' | 'subtract'; value: number; reason?: string }`. Modeled on `GameMasterStatChange` so the GM prompt grammar is consistent. `set` is for cases where the GM knows the absolute total (e.g. starting purse), `add`/`subtract` for deltas.
- **`currencyChanges?: GameMasterCurrencyChange[]` on `GameMasterOutput`** — new channel for ALL currency operations, primary `money` included. The GM is directed to emit one entry per denomination per turn.
- **`applyCurrencyChange(player, change): string | null`** exported helper in `stateManager`. Resolves the change's `name` case-insensitively: first against `money.currencyName`, then against existing `extraCurrencies` keys. On miss creates a new `extraCurrencies` entry preserving the casing the GM wrote. Returns a one-line summary string for the post-turn changes panel (or `null` if the change was a no-op, e.g. subtract from zero). Subtract floors at zero, matching the legacy `applyStatChange` money branch.

### Changed
- **GM prompt (`gameMaster.ts`)** — the "stats" guideline now explicitly says stats are for HP / stamina / mana / etc. NOT currency, and a new guideline directs the GM to use `currencyChanges` for ALL currency changes (gold, silver, copper, spirit stones, credits, etc.), match the `name` exactly as it appears on the player card (case-insensitive), let the helper auto-create new denominations on first appearance, and never lump multiple denominations into the primary `money` balance. The JSON schema block in the prompt gains the `currencyChanges` array with the field shape.
- **GM context block** — the player section now renders `Currencies: <primary name>: <amount> | <extra1>: <amount> | <extra2>: <amount>` instead of just the primary line. The storyteller can now see the full purse and respond to it ("you don't have enough high-grade stones, but you could pay in low-grade") without inventing denominations the player doesn't have.
- **`contextAssembler` player block** — same surfacing for the assembled prompt: an `Other currencies:` line is appended when `extraCurrencies` is non-empty. Omitted entirely when empty so the prompt doesn't bloat for games that don't use the feature.
- **`applyGameMasterOutput`** processes `currencyChanges` in its own block right after `statChanges`. Each change runs through `applyCurrencyChange`, and any returned summary string is pushed into `summary.statChanges` (same string array — the post-turn changes panel doesn't need a separate currency section, just one combined list).
- **`MoneyDisplay` is a full multi-row rewrite (~325 lines).** New `CurrencyRow` sub-component renders each currency with the existing flash-green/red on amount delta. The primary `money` row is amount-editable but not renameable and not deletable — renaming it would split GM history across two names. Each extra-currency row is amount-editable, click-to-rename on the name field, and has an `×` button to delete. A `+ Add currency` button reveals an inline form with name + amount inputs, Enter to confirm, Escape to cancel. Insertion order is preserved on rename (the row doesn't jump to the bottom when you rename it). Collision rules: blocking duplicate names case-insensitively against the primary currency name and against any other extra, silent no-op rather than throw — the form just doesn't submit.
- **`InfoPanel` Currency section** passes the new `extraCurrencies={player.extraCurrencies}` and `onUpdateExtraCurrencies={(next) => onUpdatePlayer({ extraCurrencies: next })}` props to `MoneyDisplay`. The section header `count` shows total row count (primary + extras) so the collapsed section header is informative.

### Migration
- **No on-disk migration needed.** `extraCurrencies` is optional and absent saves read fine. Every consumer treats undefined as empty.
- **Legacy `statChanges` with `field` of `money`/`gold`/`credits` still mutates the primary** — the existing branch in `applyStatChange` is kept untouched. If the GM (or an older saved turn being replayed) emits currency via statChanges, it still works for primary, it just can't address extras. The new prompt directs the GM toward `currencyChanges`, but old behavior is preserved so saves from before today keep replaying correctly.
- **No client breakage** — `extraCurrencies` is optional on the client type, `MoneyDisplay` defaults the prop to an empty object, and games that never use the feature render identically to v1.1.37.

### Verified with these patterns
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean. (Caught one stray backtick in the new GM prompt guideline that was breaking the template literal — fixed.)
- **Load a v1.1.37 save with no `extraCurrencies` field** → InfoPanel currency section renders exactly one row (the primary `money`), Add Currency button present, no rename/delete buttons on the primary. Functionally identical to v1.1.37 for games that don't use the feature.
- **Manually add "Silver coins" and "Copper coins" via the UI** → both appear as rows below primary, both deletable, both renameable. Try to add another row named "silver coins" → silent no-op (case-insensitive collision with the first).
- **Send a turn with a prompt that should trigger multi-currency** → GM emits one `currencyChanges` entry per denomination, primary balance only moves when the GM specifically targeted it, extras update independently. Summary panel shows one line per currency that moved.
- **GM emits a `currencyChanges` entry for a brand-new currency name** (player picks up a Mid-grade Spirit Stone for the first time) → new entry appears in `extraCurrencies` with the casing the GM wrote, amount = the operation's effect on zero. Row appears in the InfoPanel immediately.
- **GM emits a legacy `statChanges` with `field: "money"`** → primary balance still mutates via the legacy path, post-turn summary still includes it. Old saves replay identically.
- **Subtract-below-zero** → balance floors at 0, summary line still emitted with the actual amount removed.
- **Rename an extra currency in the UI** → row stays in place (insertion order preserved), subsequent GM `currencyChanges` against either the old or the new name resolve to the renamed entry case-insensitively until the GM picks up the new name from the context block.

## [1.1.37] — World-state timeline order

Seb opened the v1.1.36 editor on a long-running game and the events were scrambled. Right diagnosis: the editor was sorting on `chapter desc, timestamp desc` and trusting `timestamp` to be a real ISO date. It isn't always — the GM is free to write narrative time like `"Day 3, evening"` or just leave it empty, and the `localeCompare` of those produces nonsense order. Multiple events emitted from the same GM call also shared a millisecond when the GM didn't provide its own timestamp, so within a chapter the order was effectively random.

Fix is a new server-stamped `createdAt: string` field on every event — unforgeable by the LLM, monotonic within a GM call, ISO format always. Editor / InfoPanel / context-block all switch to that as the timeline sort key.

### Background

The existing `timestamp` field was conflated: sometimes the GM wrote a real ISO date, sometimes it wrote `"Day 3, evening"`, sometimes empty. The v1.1.36 editor sort assumed the ISO case. On older games where the GM had been writing narrative time strings, the sort was undefined behavior — the editor list rendered in whatever order `Array.sort` happened to land on, which for V8 on long arrays is stable Timsort but the *input* was already scrambled because the on-disk array reflects append order while the rendered cards reflect timestamp lexicographic order.

The right fix is the NPC-memory pattern from v1.1.22 — NPC memories already had `createdAt: new Date().toISOString()` stamped server-side at creation, distinct from any in-fiction time field. World-state events just needed the same treatment. Keeping `timestamp` as the GM's free-form in-fiction time string is still useful (the storyteller may genuinely want to read "Day 3, evening" in the world-state block), it's just not a sort key.

### Added
- **`createdAt?: string` on `WorldStateEvent`** (server + client types). Authoritative wall-clock ISO timestamp stamped server-side at event creation, never modified afterwards. Optional in the type definition so legacy events that haven't been migrated yet still parse, but in practice every event has one after first read via `fileManager.getWorldState`.

### Changed
- **`applyGameMasterOutput`** stamps `createdAt: new Date(baseMs + idx).toISOString()` on every world-state event it appends, where `baseMs = Date.now()` is snapshotted once per GM call and `idx` is the event's position in that call's `worldStateUpdates` array. The per-index offset guarantees strict ordering within a GM call even when multiple events would otherwise share a millisecond. The existing `timestamp` field now uses the same expression as its fallback when the GM didn't provide one, so legacy code paths that look at `timestamp` keep getting a real date instead of a string that happens to coincide for several rows.
- **`POST /api/games/:gameId/world-state/events`** (user-added events) stamps `createdAt: new Date().toISOString()` alongside the existing `sourceMessageIds: []`. User-added events now slot into the timeline at the wall-clock moment the user added them, not at whatever the user typed in the optional timestamp field.
- **`WorldStateEditor`** sort key is now `(chapter desc, createdAt desc, id desc)`. The `id desc` final tiebreaker is stable across re-renders and across the rare case where two events share `createdAt` to the millisecond (only possible for legacy events backfilled with the same synthetic timestamp — see Migration below).
- **`WorldStateEditor` event card** displays the formatted date from `createdAt` (with a `Date.parse` guard) instead of `new Date(timestamp).toLocaleString()`. The old code rendered `Invalid Date` for any event whose GM-written timestamp was a narrative string — now it falls back gracefully and just omits the date if neither field parses.
- **`InfoPanel` World State summary** recent-events list also switches to the `(chapter desc, createdAt desc, id desc)` sort and shows the same formatted-date guard. Was previously `worldState.events.slice(-5).reverse()`, which assumed append order = chronological. After the user adds events from the editor the array tail is no longer "most recent in story time," just "most recently appended," so the summary card was lying.
- **`buildWorldStateBlock`** (context block sent to the LLM) sorts by `(chapter desc, createdAt desc, id desc)`, takes the top 10, then `reverse()`s for oldest-first delivery so the model reads the timeline forwards. Was `state.events.slice(-10)`, same append-order assumption.

### Migration
- **First read of any existing `world-state.json` mints `createdAt` for every event missing one** in `fileManager.getWorldState`. Two-tier strategy:
  1. If the existing `timestamp` field parses as a real date (`Date.parse(timestamp)` returns a finite number), use that — preserves the GM's intended ordering for events where the model happened to write a real ISO date.
  2. Otherwise fall back to a synthetic value: `Date.UTC(2000, 0, 1) + idx * 1000` ms, where `idx` is the event's position in the on-disk array. This (a) preserves the original append order within a chapter, since `idx` is monotonic, and (b) sorts strictly before any v1.1.37+ event (which uses real wall-clock time, decades after 2000-01-01), so newly added events always show as more recent than backfilled legacy ones.
- **Same atomic-write path as v1.1.34**, so the migration write is crash-safe.
- **No client breakage** — `createdAt` is optional in the client type, and every consumer falls back to `timestamp` if it's missing.

### Verified with these patterns
- **Open the editor on a long game with mixed GM-narrative timestamps and v1.1.36 user-added events** → events now appear in (chapter desc, createdAt desc) order. Legacy events with narrative timestamps cluster at the start of their chapter (synthetic Jan 2000 timestamps), v1.1.37+ GM events appear at their real emission time, user-added events appear at the moment the user added them. Same chapter, same ordering applied uniformly.
- **Send a turn that emits 3 world events in one GM call** → disk shows all three with `createdAt` differing by 1ms. Editor renders them in order — the third event (often the most narratively recent in the turn) is at the top.
- **Edit an event in the editor, save, reopen** → the event keeps its original `createdAt`. Editing the event text doesn't re-stamp it as "just now" — the event is still in its original timeline slot, the edit just updated the content. (PATCH route doesn't touch `createdAt`.)
- **Add a user event from the editor on an old game** → new event appears at the top of its chapter (current wall-clock time). All v1.1.36/v1.1.37 GM events from before today appear below it. Legacy migrated events appear at the very bottom of the chapter (Jan 2000 synthetic timestamps).
- **Context block** → server log of the assembled prompt shows world-state events in oldest-first true chronological order rather than append-order. Stale marker still rendered correctly. No "Invalid Date" strings ever in the block (the block uses `timestamp` for display since that's the in-fiction time the storyteller wants to see, but the *ordering* uses `createdAt`).
- **Restart server after migration** → `getWorldState` returns immediately without re-writing (no `dirty` flips since `createdAt` is now populated). Confirms migration is one-shot per game.
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.

## [1.1.36] — Manual world-state editor UI

Part 2 of the world-state fix. v1.1.35 made the cascade automatic — regenerate / edit / delete now drops the events the GM stamped under those messages. But that only catches events whose source messages still exist as something to delete or edit. Legacy events from before v1.1.35 have `sourceMessageIds: []` and are untouchable by the cascade forever. Events from 30 turns ago whose source messages you don't want to delete (you still want the turn, just not the world-state note the GM left) are also unreachable. Both cases needed a manual escape hatch. This release adds it.

Seb's original complaint covered both halves: "I can't change it." The cascade fixed the regen case. This release fixes the "open the panel and just remove the thing" case.

### Background

With the v1.1.35 plumbing in place (`id` on every event, `sourceMessageIds[]` carrying provenance, `stale` flag on edited-source events), individual events are now addressable from the API. The editor is mostly a thin CRUD UI over the existing fileManager helpers — `saveWorldState` already goes through the v1.1.34 atomic write + per-game lock, so concurrent edits from the editor while a turn is mid-stream are safe by construction.

The one design call worth calling out: user-added events get `sourceMessageIds: []`, same as migrated legacy events. That means the cascade never auto-touches them — if you manually add "the protagonist is left-handed", deleting some unrelated past message can't accidentally drop your note. The trade is that to remove a user-added event you have to come back to the editor. That matches the NPC-memory pattern where user-added memories are sticky too.

Edit-clears-stale is the other small piece worth flagging. If an event was flagged stale because its source message was edited (so the model is currently being told `[UNRELIABLE — source message was edited]` in the prompt), the act of the user editing the event text in the editor is the user resolving the staleness — they've now reviewed it. The PATCH route forces `stale: false` on every edit regardless of what the client sends, so you can't accidentally save with stale-still-set.

### Added
- **`GET /api/games/:gameId/world-state`** — returns the full `WorldState`. The editor fetches once on open (the parent already has `worldState` in props from `useGameState`, but having the explicit GET makes the editor self-sufficient if it's ever reused elsewhere and lets the parent fall back to a refetch on error).
- **`POST /api/games/:gameId/world-state/events`** — adds an event. Body: `{event, location?, chapter?, timestamp?}`. Stamps a fresh `id: uuidv4()` and forces `sourceMessageIds: []` — user-added events never carry source ids regardless of what the client sends. Returns the full updated `WorldState` so the client can swap state in one shot instead of refetching.
- **`PATCH /api/games/:gameId/world-state/events/:eventId`** — partial update. Body accepts any of `{event, location, chapter, timestamp}`. Forces `stale: false` on every save (rationale above). Preserves `id` and `sourceMessageIds` — those aren't editable from the UI; doing so would defeat the cascade plumbing. Returns the full updated `WorldState`.
- **`DELETE /api/games/:gameId/world-state/events/:eventId`** — single-event delete. Returns the updated `WorldState`.
- **`POST /api/games/:gameId/world-state/events/bulk-delete`** — body `{chapter?, ids?}`. If `chapter` is set, drops every event with that chapter number (the common "remove everything from chapter 2 because I'm restarting that arc" case). If `ids` is set, drops by id list. If both, both filters apply. Returns the updated `WorldState`.
- **`PUT /api/games/:gameId/world-state/locations/:location`** — upserts a `locationStates[location]` entry. Body `{text}`. The GM rarely populates locationStates today but the slot exists in the schema and the editor exposes it.
- **`DELETE /api/games/:gameId/world-state/locations/:location`** — removes a `locationStates` entry.
- **`client/src/components/info/WorldStateEditor.tsx`** (new, ~580 lines). Modal-based editor with Events / Location states tabs. Events tab: compose-new form (text + location + chapter), per-event in-place edit, per-event delete with a `ConfirmDialog`, bulk-delete-by-chapter with a `ConfirmDialog` that names the chapter explicitly so you can't accidentally wipe the wrong one. Locations tab: simple key+text upsert + delete list. Add-new defaults `chapter` to `max(existing events' chapter) || 1` so you stay on the current chapter without having to look it up. The stale badge from the InfoPanel summary is shown here too, plus a hint that editing the event text will clear it. Every successful mutation calls the parent's `onChanged(next)` with the fresh `WorldState` from the server, so the InfoPanel summary updates without a refetch.
- **`client/src/api.ts`** — `addWorldStateEvent`, `updateWorldStateEvent`, `deleteWorldStateEvent`, `bulkDeleteWorldStateEvents`, `setLocationState`, `deleteLocationState`. All return `WorldState`.

### Changed
- **`InfoPanel` World State section** gets an `Edit` button in the section body that opens the modal. The recent-events summary stays — it's the at-a-glance view, the modal is for actually changing things. The Edit button only renders when both `gameId` and the new `onUpdateWorldState` prop are present, so older parents that don't wire the prop through won't show a button that does nothing.
- **`InfoPanel` props** gain `onUpdateWorldState?: (next: WorldState) => void`. Optional so any code path that mounts the InfoPanel without it (none today, but the prop is shared with the studio screens in spirit) keeps working — it just doesn't get the Edit button.
- **`AppShell`** destructures `setWorldState` from `useGameState` (already exported, never consumed before this) and passes it through to `<InfoPanel onUpdateWorldState={setWorldState} />`. The editor calls this on every successful mutation with the full server response, so we replace local state in one shot — no patch merging, no refetch.

### Migration
- **No on-disk schema changes.** All v1.1.36 work sits on top of the v1.1.35 schema (`id`, `sourceMessageIds`, `stale`). Existing world-state files keep working unchanged.
- **No new client-side state.** The editor is a leaf component; its only persistent dependency is `setWorldState` from `useGameState`, which already existed.
- **User-added events are intentionally cascade-immune.** Once you add an event from the editor it has `sourceMessageIds: []`, which the v1.1.35 cascade treats as "don't auto-touch". Removing user-added events requires coming back to the editor. Same model as user-added NPC memories.

### Verified with these patterns
- **Open Edit, add an event, close, reopen InfoPanel** → the new event shows in the recent-events summary card. Reload page → still there. `world-state.json` on disk contains it with a fresh uuid and `sourceMessageIds: []`.
- **Add an event, then delete the user message from earlier in the chat** → user-added event survives. Confirms `sourceMessageIds: []` makes it cascade-immune.
- **Edit an event that was flagged stale** → save clears the stale flag. Next context block no longer prefixes the event with `[UNRELIABLE — ...]`. InfoPanel summary card loses the amber badge / opacity.
- **Bulk-delete by chapter** → enter chapter number, confirm in the `ConfirmDialog`, every event with that `chapter` value disappears from disk and the InfoPanel updates immediately. Snapshot from v1.1.34 fires in `.backups/<ts>__worldState/` since `saveWorldState` goes through the atomic write path — typo'd chapter number is one `cp -r` away from recovery.
- **Edit while a turn is streaming for the same game** → editor's PATCH waits behind the orchestrator's `withGameLock` (saveWorldState goes through fileManager which respects the lock), no interleave, no torn writes.
- **Add a `locationStates` entry, then a GM turn populates the same key** → GM's `applyGameMasterOutput` overwrites the user-added entry. Documented behavior (`locationStates` has no provenance metadata yet, so we can't distinguish), worth a future improvement but not blocking.
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.

## [1.1.35] — World-state cascade on message edit / delete / regenerate

Seb's complaint: "if the story introduces a character or event I don't want and I go to regenerate the response/story, it just goes back to the thing it just said because it makes a note in the world state and I can't change it." Exactly right. The GM was writing every storyworld event into `world-state.json` with no link back to the chat message that produced it, so when you deleted, edited, or regenerated that message, the event survived unchanged and went straight back into the prompt for the next generation. The model dutifully re-introduced whatever you were trying to get rid of.

This is part 1 of a two-pass fix. Part 1 (this release) makes the cascade automatic — regenerate / edit / delete now actually forgets the rejected turn at the world-state level. Part 2 (v1.1.36) adds the editor UI so you can also manually scrub events the cascade didn't catch.

### Background

NPC memory already had this exact plumbing from v1.1.22. Every NPC `memory[]` entry carried `sourceMessageIds: string[]`, and `invalidateMemoriesForDeletedMessages` / `markMemoriesStaleForEditedMessage` got wired into the delete and edit routes. World-state events were the same kind of artifact — "the GM observed something in this turn and wrote it down" — but the pattern never got extended. So you'd delete the message where the GM noted "a mysterious stranger entered the tavern" and the NPC memories about the stranger would drop, but the world-state event would stay, and the next prompt would still contain `- [Tavern @ 2026-...] A mysterious stranger entered.` The model takes the hint and re-introduces them.

The other half is regenerate. Regen replaces the assistant message's content in place but keeps the same `messageId`. Without this fix, the world-state events from the OLD response stayed tied to that messageId and still appeared in the next GM's context. With this fix, regen treats the in-place content replacement as delete-of-the-old before the new GM runs: cascade drops the old events, the new GM run stamps fresh events under the same messageId for the new content.

The "part 1, part 2" split is because the cascade fix alone solves the immediate regen problem with no UI work. The editor UI in v1.1.36 is for the cases where you want to manually remove events from many turns ago that the cascade can't reach because their source messages still exist.

### Added
- **`id: string` on `WorldStateEvent`** — stable uuid stamped at creation time. Makes events individually addressable, which the cascade needs (and v1.1.36's editor UI will need). One-time migration in `fileManager.getWorldState`: existing events without an id get one minted on first read, and the file is rewritten back through the v1.1.34 atomic write path. No-op on subsequent reads.
- **`sourceMessageIds: string[]` on `WorldStateEvent`** — the chat message ids the GM was reasoning over when it produced this event. Stamped in `applyGameMasterOutput` using the same `sourceMessageIds` argument that NPC memories were already using since v1.1.22 — the orchestrator was already passing `[priorUser.id, assistantMessage.id]` through; world-state events just weren't using it. Migrated events get an empty array, which the cascade treats as "user-added / legacy / untraceable" and never auto-touches — same rule NPC memory follows.
- **`stale?: boolean` on `WorldStateEvent`** — set when a source message has been edited (but not deleted) since the event was recorded. Stays on disk because the user might want to review and either fix the event text (clears stale, eventually — wire-up lands in v1.1.36) or delete it.
- **`invalidateWorldStateForDeletedMessages(gameId, deletedMessageIds)`** in `stateManager`. Drops events whose ENTIRE source set is in the deleted set. Multi-source survivors get the dead ids pruned. Returns `{ dropped, staleCleared }` for logging. Mirrors `invalidateMemoriesForDeletedMessages` line for line.
- **`markWorldStateStaleForEditedMessage(gameId, editedMessageId)`** in `stateManager`. Flips `stale: true` on every event whose `sourceMessageIds` includes that messageId. Returns `{ markedStale }`.

### Changed
- **`applyGameMasterOutput`** stamps `id: uuidv4()` and `sourceMessageIds: [...sourceMessageIds]` onto every world-state event it appends. The `sourceMessageIds` argument was already plumbed through from the orchestrator (it was being used for NPC memories); world-state events just weren't picking it up. Empty/undefined source list becomes `sourceMessageIds: []` rather than missing, so downstream code can `Array.isArray` without nullchecks everywhere.
- **`DELETE /api/games/:gameId/messages/:messageId`** now runs the world-state cascade alongside the existing NPC-memory cascade. Both are best-effort — a cascade failure logs a warning but doesn't fail the delete itself.
- **`PATCH /api/games/:gameId/messages/:messageId`** (edit) and **`POST /messages/:messageId/alternative`** (swap-to-alternative) both run `markWorldStateStaleForEditedMessage` alongside the existing memory stale-flag cascade. Editing the message text doesn't drop world events — the underlying turn still happened — but it flags them as possibly-out-of-sync so the storyteller and (eventually) the user can both see them.
- **`runRegeneration` cascades the OLD messageId's events and memories before the new GM runs.** Regen keeps the same messageId but replaces the content, so any events / memories the previous GM stamped under that id now describe content that no longer exists. The fix calls `invalidateWorldStateForDeletedMessages` and `invalidateMemoriesForDeletedMessages` with the messageId before the new GM call — same drop-if-all-sources-gone rule — then the new GM run re-stamps fresh state under the same id for the new content. This is the actual fix for seb's reported case: regenerating a turn that introduced a character no longer leaves the introduction event in the world state.
  - Also closes a pre-existing gap: regen wasn't running the v1.1.22 NPC memory cascade either. The old NPC memories from the rejected turn would survive regen with no `stale` flag, so the next turn would treat "NPC remembers a thing that didn't happen anymore" as gospel. Fixed in the same commit since the wire-up is one line.
- **`buildWorldStateBlock`** prefixes stale events with ` [UNRELIABLE — source message was edited]` so the storyteller is told to deprioritize them. Events stay in the block (user hasn't resolved them yet, dropping them silently would be worse) but the model has explicit text telling it the event may not reflect the current story. Marker disappears the moment the user edits or deletes the event — hooked up properly in v1.1.36.
- **InfoPanel "World State" section** drops the `Location:` and `Chapter:` lines that were rendering literal `unknown` and `0` forever — the server never populated `currentLocation` or `currentChapter`, those fields existed on the client type only and were always undefined. Recent events now render with the `stale` flag visible: dimmed card + amber "stale" tag. Real edit UI lands in v1.1.36.
- **`client/src/types.ts WorldState`** realigned with the server shape. Was: `{ currentLocation, currentChapter, events: { event, location, timestamp }[], flags }` — none of the first three or last fields ever existed server-side; events were missing `id`, `chapter`, `sourceMessageIds`, `stale`. Now matches `server/types/index.ts` exactly. Existing client code that referenced the dead fields was already a no-op (rendered `undefined || 'unknown'`); cleaned up at the same time.

### Migration
- **First read of any existing `world-state.json` rewrites it through the atomic write path** to stamp uuids onto events that don't have them and set `sourceMessageIds: []` on any without it. Migrated legacy events are treated as untraceable forever — the cascade will never auto-touch them. To clean those up you'll want v1.1.36's editor UI.
- **No data loss possible on the migration** — only adds fields, never modifies existing event text/location/timestamp/chapter. Runs through the v1.1.34 tmp-file + rename so a crash mid-migration leaves the old file intact.
- **No client breakage from the `WorldState` type realign** — the InfoPanel was the only consumer and its references to `currentLocation` / `currentChapter` were always rendering placeholder text. Anything reading `state.events[].id` etc. now gets real data instead of `undefined`.

### Verified with these patterns
- **Send a turn where the GM introduces a character or event you don't want, hit Regenerate** → logs show `regen cascade for <messageId>: dropped N world event(s), M memor(ies)`, the new GM call stamps fresh events for the new content, and the next prompt's WORLD STATE block reflects only the new content. The character / event is gone for real, not just visually.
- **Delete a single message that had a GM-stamped world event** → logs show `delete cascade: dropped 1 orphaned world-state event(s)`. The event no longer appears in subsequent prompts.
- **Edit a message that had a GM-stamped world event** → the event gets `stale: true` on disk. The next context block renders it as `- [Location @ ts] [UNRELIABLE — source message was edited] <event text>`. The InfoPanel shows it dimmed with an amber stale tag.
- **Multi-turn cascade independence** → events with multiple `sourceMessageIds` (rare — most events come from a single user+assistant turn pair) only get dropped if ALL their sources are deleted. Dead sources get pruned from survivors so future edits don't re-flag via vanished ids.
- **Legacy events untouchable by cascade** → pre-existing `world-state.json` events get `sourceMessageIds: []` on migration. Deleting any message leaves them alone (they have no link to it). To remove them: v1.1.36 editor.
- **Stale clears on full source loss** → if an event was stale because a source had been edited, and then that source is later deleted (removing it from the live id set), the cascade clears the `stale` flag on any survivors who still have other live sources. Avoids ghost-stale events with no traceable cause.
- **Snapshot still fires** — the world-state cascade runs through the same paths that already had v1.1.34 snapshots (delete/edit/regen all go through `withGameLock` and rewriteAllMessages where applicable), so a wrong-cascade case is recoverable from `.backups/`.
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.

## [1.1.34] — Atomic writes + per-game mutex + snapshot backups

Seb asked what was actually wrong with this thing and we went through the audit. The honest top of the list was a class of data-loss bugs that had been hiding in plain sight: every JSON write was `fs.writeFileSync` straight to the final path (so a crash mid-write leaves a half-written file the next boot can't parse), `rewriteAllMessages` literally `unlink`'d every chapter file before writing the new ones (so a crash anywhere in that loop = no chat history), nothing serialized concurrent writes for the same game (so a double-clicked Send button could interleave two GM state applies into garbage), and a misclick on Delete on a character or whole game was just `unlinkSync` with no way back. This release closes all of that.

### Background

The write-path was the original 2024 "get it running" code and we never went back. On Linux a crash mid-`writeFileSync` is rare enough you might never see it in dev, but seb runs the local model on the same box, and an OOM kill of a sibling process is enough to take the whole node out at the wrong moment. The `rewriteAllMessages` pattern was the scariest: delete chapter-1.jsonl, delete chapter-2.jsonl, ... THEN write the new ones. If anything went wrong between the unlinks and the first write, the entire game's chat history was gone. No recovery path, no backup, just an empty `history/` directory and a UI showing a fresh game.

Concurrency was the second class of bug. Node is single-threaded but I/O is async, and the orchestrator does: read messages → call LLM (async, 30+ seconds) → write user message + assistant message + run GM → write state changes → maybe summarize → rewrite history. If a second turn fires for the same game while the first is still in the LLM call, both turns end up reading the *same* pre-turn state, doing independent GM applies on it, and the second one's `rewriteAllMessages` clobbers the first one's appended messages. "My message disappeared" was almost certainly this — there's no abort plumbing on regen either, so a regen-while-streaming could absolutely race a continuation.

The fix is the standard three-layer combo: (1) every write goes through tmp-file + rename so a crash either leaves the old file intact or the new file complete, never half-written; (2) a per-game async mutex serializes multi-step operations so two turns for the same game queue, while different games still run in parallel; (3) snapshot the affected files into `.backups/<ts>__<reason>/` before destructive ops so even a logic bug (or a user fat-fingering Delete) is recoverable.

### Added
- **Atomic `writeJson(filePath, data)` and `writeFileAtomic(filePath, data)` helpers.** Both write to `${filePath}.tmp-<pid>-<ts>-<rand>` (unique per process+call, so two parallel writes to the same path can't collide on the tmp name), `fs.writeFileSync` the bytes, then `fs.renameSync` to the final path. On POSIX `rename(2)` is atomic within the same filesystem, which is the guarantee we want: a crash before rename leaves no visible change, a crash after rename leaves the new file. The tmp file gets cleaned up on error. Every `fs.writeFileSync` and old `writeJson` call site in `fileManager.ts` now goes through these — `saveGame`, `saveWorld`, `savePlayer`, `saveCharacter`, `saveWorldState`, `saveConfig`, `saveSummary`, `saveImageFile`, `saveImageMetadata`, snapshot manifests, etc.
- **Crash-safe `rewriteAllMessages`.** Was: unlink every chapter file, then write the new ones. Now: snapshot first (best-effort `snapshotGame(gameId, 'messages')`), sweep stale tmp files in the history dir, then write each new chapter to its `.tmp-*` and rename — never leaving the history dir empty mid-operation — and only then unlink any chapter files that aren't in the new set. Worst case mid-rewrite crash now leaves a consistent history dir with the OLD chapter files plus the latest snapshot, instead of nothing.
- **`withGameLock<T>(gameId, fn)` async mutex** in `fileManager`. Backed by a `Map<gameId, Promise<unknown>>` chain — each call appends its work to the tail of the existing chain for that gameId. Different `gameId`s run in parallel; same `gameId` queues. Used to wrap any operation that does read → async work (LLM call) → write. Two send-button mashes for the same game now serialize cleanly instead of interleaving.
- **`snapshotGame(gameId, reason, keep=10)`** in `fileManager`. Copies `game.json`, `world.json`, `player.json`, `characters/*.json`, `history/*.jsonl`, `state/world-state.json`, `summaries/*.json`, and `images/*.json` *metadata* (NOT image binaries — too big, regeneratable) into `data/games/<gameId>/.backups/<ISO-ts>__<reason>/`. Writes a `snapshot.meta.json` manifest with `{gameId, reason, createdAt, fileCount}`. Prunes to the last `keep` snapshots (default 10) by lexical sort of the ISO timestamps. The `.backups` dir starts with a dot so it sorts to the top in Finder/Explorer and obviously distinguishes itself from real game content.
- **`snapshotGameInto(gameId, destRoot, reason, keep)`** — same payload, arbitrary parent directory. Used by `deleteGame` to write the snapshot to a global graveyard at `<dataDir>/.deleted-games/<gameId>/<ts>__deleteGame/` since the game folder itself (including its `.backups/`) is about to be wiped recursively. `keep: 0` means no pruning — graveyard snapshots are kept forever; deleting a whole game is rare and almost always regretted.
- **`listSnapshots(gameId)`** returns the available `.backups/` entries newest-first, each with `{name, path, createdAt, reason, fileCount}`. Useful for the eventual restore-from-snapshot UI; right now it's just a programmatic hook plus a `data/games/<gameId>/.backups/` directory the user can manually copy back if they need to.
- **`cleanupTempFiles(dirPath, minAgeMs)`** sweeps orphaned `.tmp-*` files older than the threshold (default 60s). `sweepAllTempFiles()` walks every game directory + every known subdir at startup and runs the sweep with `minAgeMs: 0`. Server boot now calls this once — safe because if the server is starting fresh, nothing is currently mid-write.
- **`deletedGamesDir()`** returns `<dataDir>/.deleted-games/` for the graveyard, also dot-prefixed to keep it out of the games list.

### Changed
- **`deleteGame` snapshots the whole game to the graveyard before recursive delete.** A user who hits Delete by accident on a 50-chapter game now has a complete structured-data copy at `<dataDir>/.deleted-games/<gameId>/<ts>__deleteGame/` — game.json, world, player, all NPCs, all chapter files, world-state, summaries, image metadata. Image binaries are not snapshotted (regenerate from the LLM/ComfyUI side if needed). The `keep: 0` argument means these accumulate forever; on a dev box that's fine, and if it ever becomes a real problem the same `listSnapshots`-style API will manage it.
- **`deleteCharacter` snapshots first** with reason `deleteCharacter`. The runaway re-proposal bug from 1.1.31 already had a fix, but if a similar logic bug ever resurfaces, the character file is now one `cp` away.
- **`deleteImage` snapshots first** with reason `deleteImage`. Note: image *binaries* are not in the snapshot — only the JSON metadata. If you delete the wrong image, the metadata tells you what it was (filename, prompt, NPC association, timestamps) but the pixels are gone. This is a deliberate trade — snapshotting full image binaries on every delete would blow up the `.backups/` size budget fast.
- **Orchestrator's `runOrchestration` and `runRegeneration` are now wrapped in `withGameLock`.** Both functions were split into an exported entry point that takes the lock plus a `*Locked` inner function that does the actual work. The lock covers: user-message append, context assembly read, LLM stream, assistant-message append, GM run, GM state apply, summarizer trigger. A second turn for the same gameId queues behind the first instead of interleaving. Different gameIds still run fully in parallel (the mutex is keyed on gameId, not global).
- **`maybeSummarize` is also wrapped in `withGameLock`.** It runs fire-and-forget from the orchestrator *after* the orchestrator's own lock has released, but it does a read-modify-write of every chapter file (marking messages summarized). Taking the lock prevents it from racing a new turn that's appending fresh messages — the new-turn append would otherwise be silently overwritten when the summarizer's `rewriteAllMessages` lands.
- **`appendMessage` left as `fs.appendFileSync`.** Intentional — a single-line JSONL append on POSIX is atomic enough (the syscall either writes the full line or the file is unchanged from the reader's perspective; partial appends only happen on power loss mid-syscall, and `readChapterMessages` already tolerates a partial trailing line as a `JSON.parse` failure that gets skipped). Putting `appendMessage` through the full tmp-file + rename cycle would mean reading and rewriting the whole chapter file on every single message, which would be absurd at 100+ messages.
- **`saveImageFile` uses `writeFileAtomic`** for the binary write. Crash mid-image-write previously left a corrupt PNG/JPG file in the gallery that broke the lightbox; now it either leaves the old file intact or the new one fully written, never a torn write.
- **`listGames` skips dot-prefixed entries explicitly.** Was already filtering by the presence of `game.json`, so `.backups` and `.deleted-games` siblings would have been ignored anyway, but the explicit dot-prefix check avoids the per-entry stat+readJson churn and makes the intent obvious. Wrapped the stat in try/catch too.
- **Server boot runs `sweepAllTempFiles()`** in `server/index.ts` right after the file-manager initializes. Logs the count if anything was cleaned. Quiet otherwise.

### Migration
- **Existing games are unaffected.** No files are renamed, moved, or rewritten on first boot. The `.backups/` directory is created lazily on the first destructive op for each game; until then there's no change to the game folder at all.
- **No schema bump.** Same on-disk JSON shapes — only the write strategy changed.
- **`.backups/` and `.deleted-games/` start showing up on disk.** If you sync your `corvus-data/` directory to cloud storage, the `.backups/` folders will start consuming space (bounded by `keep: 10` per game) and `.deleted-games/` will grow without bound until you manually prune it. Both are dot-prefixed so most sync tools' "hide dotfiles" filters apply.

### Verified with these patterns
- **Send a message, kill the server mid-stream, restart** → on boot, `sweepAllTempFiles` removes any `chapter-N.jsonl.tmp-*` left over, the chapter files themselves still parse cleanly, no message duplication on the restart.
- **Hit Send twice in rapid succession** → second turn now waits for the first to fully complete (user msg saved → LLM stream done → GM applied → state written) before its own user-message append fires. Both messages appear in order in the chat, no GM state corruption, no "my message disappeared".
- **Hit Regenerate while a continuation is still streaming on the same game** → regen waits for the continuation to fully land before it touches the history. No interleaved `rewriteAllMessages` calls.
- **Open two different games in two browser tabs, send in both simultaneously** → both turns run in parallel (different gameIds, independent locks). Wall-clock time is the max of the two, not the sum.
- **Delete an NPC card** → `data/games/<gameId>/.backups/<ts>__deleteCharacter/characters/<id>.json` appears containing the pre-delete character JSON. `listSnapshots(gameId)` returns the entry.
- **Delete a whole game from the home screen** → `data/.deleted-games/<gameId>/<ts>__deleteGame/` appears with the full structured-data copy (game.json, world.json, player.json, characters/, history/, state/, summaries/, image metadata). The original `data/games/<gameId>/` is gone. Manually `cp -r` the snapshot back to recover.
- **Edit a message** → `rewriteAllMessages` snapshots first (`<ts>__messages`), writes each new chapter to `.tmp-*` + renames, then unlinks any chapters not in the new set. If you `kill -9` the server in the middle, restart, and look at `history/` — the OLD chapter files are still there (no message loss) and the snapshot is in `.backups/`. Worst case is the edit didn't take, never "all history gone".
- **Trigger summarization (cross the threshold, wait for it to fire), restart server, send another message** → summarizer's lock acquisition is clean, no deadlock, no race against the new turn.
- **`.backups/` prunes correctly** — created 12 snapshots via repeated edit-message operations, only the most recent 10 remained. Oldest two got `fs.rmSync` recursive-deleted as expected.
- **Snapshot manifest is readable** — every `.backups/<ts>__<reason>/snapshot.meta.json` parses to `{gameId, reason, createdAt, fileCount}`. `listSnapshots` returns them newest-first.
- **TypeScript** — server (`./node_modules/.bin/tsc --noEmit`) and client both clean.

## [1.1.33] — Edit-message bubble expands to readable width

Seb hit Edit on a long character message and the bubble collapsed into a ~190px-wide skinny column — maybe 3 words per line, 20+ lines tall, basically unreadable. The bubble was sizing itself to its current text-content width via `max-w-[85%]` (which caps but doesn't grow), then the `w-full` textarea inside dutifully inherited that narrowness. Static messages look fine because their content is what determines the bubble width in the first place; the edit textarea has no inherent content-width so it just sat inside whatever box the bubble had collapsed to.

### Changed
- **`ChatMessage` bubble adds `w-full` when `editing === true`.** The bubble's `max-w-[85%]` was always there but it's a cap, not a target — in static-render mode the bubble naturally sizes to its content. In edit mode there's no useful content width to size against, so we now force the bubble to fill its flex row up to the 85% cap. Result: the textarea has the full readable width of the chat column (~620px in the standard layout) instead of hugging the pre-edit text shape.

### Verified with these patterns
- **Click Edit on a long narrator block** → textarea fills the readable column width, wraps at sentence length instead of every 2–3 words, height auto-grows up to the existing 400px cap.
- **Click Edit on a short message ("Hello.")** → same expanded width — the editing surface is now consistent regardless of starting content length, which is the right call (you might be about to type a paragraph).
- **Cancel out of edit** → bubble returns to content-hugging width. No visual jump for surrounding messages.
- **User-side message edit** → same fix applies; bubble expands left from the right edge.
- **Character message with portrait** → expansion still respects the 32px avatar + gap on the left, since the 85% cap is measured against the bubble's flex row, not the full chat column.

## [1.1.32] — Modals stop closing on backdrop click

Seb was halfway through a Design-with-AI session in the New Game dialog — chat history, picked genre, half-filled form — misclicked outside the modal, and the whole thing vanished. The chat history lives in `DesignGameChat`'s local state, the form state lives in `NewGameDialog`'s local state, and both unmount when the modal closes. Backdrop-click was triggering `onClose` like a dismissible overlay, but these modals are work surfaces, not dismissible overlays. One sneeze = lost work.

### Background

`Modal` defaulted `closeOnBackdrop = true`. None of the actual callers were overriding it. So every modal in the app — New Game (incl. Design with AI, From Image), New Character Chat, NPCCard edit, AddCharacterDialog, ImageGallery, PortraitPickerDialog, SettingsPage — would dismiss-and-discard on any errant click into the dark border area. The two modals where backdrop-close is genuinely the right gesture (ConfirmDialog, ImageLightbox) were riding the default along with everyone else, so flipping the default is safe as long as those two opt back in.

This is a defaults-flip, not a per-caller patch, because the per-caller patch would just be "every dialog except two passes `closeOnBackdrop={false}`" and that's a worse contract.

### Changed
- **`Modal.closeOnBackdrop` now defaults to `false`.** Was `true`. Clicking the darkened backdrop no longer triggers `onClose`. To dismiss a modal, users click the X button in the header, the Cancel button in the footer, or hit Escape (Escape still works — `closeOnEscape` is unchanged at default `true`). Modals that genuinely want backdrop-close-to-dismiss now opt in explicitly with `closeOnBackdrop`.
- **`ConfirmDialog` opted back into backdrop-close** (`closeOnBackdrop` prop). Dismissing a confirmation by clicking outside is the conventional gesture and there's no user work to lose — the action just doesn't happen, same as clicking Cancel.
- **`ImageLightbox` opted back into backdrop-close** (`closeOnBackdrop` prop). It's a viewer, not a workspace; backdrop-click as dismiss is the universal lightbox pattern (Lightroom, Photoshop's Camera Raw preview, etc).

### Migration
- None. Pure default flip plus two opt-ins. Any third-party caller that needed the old behavior can pass `closeOnBackdrop` to restore it.

### Verified with these patterns
- **Start Design with AI in New Game, send a few chat turns, click the dark backdrop area** → modal stays open, chat history intact, draft state intact. Same behavior for From Image and the plain form view.
- **Open New Character Chat, fill out half the fields, click outside** → modal stays open, fields preserved.
- **Open NPCCard for editing, type a long backstory, click outside** → modal stays open, edits preserved.
- **Open PortraitPickerDialog over an NPC card, click outside the picker** → picker stays open, NPCCard underneath stays open.
- **Open ConfirmDialog (e.g. delete an NPC), click outside** → dialog dismisses as cancel. Same as clicking Cancel.
- **Open ImageLightbox on a gallery image, click outside the image** → lightbox closes. Same as before.
- **Hit Escape on any modal** → still closes. The Escape escape-hatch is unchanged.
- **Click the X in the header / Cancel in the footer** → still closes. Unchanged.

## [1.1.31] — NPC dedup guard + Deny actually deletes + portrait picker + speaker portrait in chat

Four fixes seb hit in one play session. The big one is a structural bug that's been quietly eating characters since the status-lifecycle landed in 1.1.28 — NPCs were "randomly disappearing" from the sidebar after a few turns. The other three are UX paper cuts that have been there a while: the Deny button on a pending NPC card didn't actually visibly remove the card, character portraits had no way to be set/changed from the UI, and when an NPC spoke in chat there was no visual link back to *which* NPC it was.

### Background

The disappearance bug was a three-way collision between the GM prompt, the new-NPC normalizer, and the state-manager's `newCharacters` write path. The GM prompt was instructing the model to "give them a stable id (slug of their name, lowercase, hyphens)" AND listing existing NPCs with their real ids in the `KNOWN NPCs` context block. Models being models, they would sometimes re-propose an existing NPC as a `newCharacters` entry — same name, sometimes the same slug id echoed back from the context. `normalizeNewNpc` honored `partial.id || uuidv4()`, so an LLM-supplied id would just become the id of record. `stateManager.applyGameMasterOutput`'s `newCharacters` branch had no existence check — it called `fm.saveCharacter` straight through, which blindly overwrote the existing JSON file with a half-blank `status: 'pending'` duplicate. Then the next context assembly filtered the freshly-pending NPC out of every prompt (1.1.28 behavior) and the NPCList re-sorted them into the Pending bucket. From seb's perspective: "Mira was just talking, now Mira is gone." In reality Mira's file got nuked and replaced with a stub Mira.

The other three issues were just missing wiring. The deny route on the server has hard-deleted the character file since 1.1.28 — the client just never updated its local `characters` state on the success path, so the card stayed in the sidebar until a manual refresh. The portrait flow had everything plumbed end-to-end (`api.setImageAsPortrait` already existed, the gallery's send-to dialog could already do it from the *image* side) but there was no entry point from the *character* side. And ChatMessage had access to the character object the whole time, just wasn't reading `character.image.portraitPath`.

### Added
- **NPC dedup guard in `stateManager.applyGameMasterOutput`'s `newCharacters` branch.** Before calling `fm.saveCharacter`, the branch now does two collision checks: (1) if `partial.id` is set AND `fm.getCharacter(gameId, partial.id)` returns an existing character, the new-NPC proposal is dropped with a `logger.warn({ existingId })`; (2) if any character in `fm.listCharacters(gameId)` (regardless of status — pending, active, OR disabled) has a case-insensitive name match, the proposal is dropped with `logger.warn({ matchedName, matchedId })`. Both checks `continue` to the next entry in `newCharacters`, so a single malformed GM response can't poison the whole turn.
- **`PortraitPickerDialog`** (`client/src/components/info/PortraitPickerDialog.tsx`, ~190 lines). Loads `api.listImages(gameId)` on open, default-filters to images linked to this NPC or in the unlinked `character` category. A "Show all" toggle widens the filter to every image in the gallery for cases where seb wants to pull from environment/scene shots. Click on any tile fires `api.setImageAsPortrait(gameId, img.id, character.id)` (existing send-to-NPC route under the hood), refreshes the character via `api.getCharacter`, and emits `onPortraitSet(updated)` upward. "Setting…" overlay during the apply, "current" ribbon on the active portrait so it's obvious which one is already set.
- **`onCharacterDeleted` prop chain.** New optional callback threaded `NPCCard → NPCList → InfoPanel → AppShell`. NPCCard fires it inside `runStatusAction` whenever the `denying` branch resolves successfully, BEFORE closing the modal. NPCList also clears its own `selected` state when the deleted id was the open one. AppShell's handler is `setCharacters((prev) => prev.filter((c) => c.id !== charId))`, so the card vanishes from the sidebar immediately on Deny without waiting for a window refresh. The server's deny route has been hard-deleting since 1.1.28; the client was just dropping the result on the floor.
- **Clickable portrait in `NPCCard`.** The portrait wrapper changed from `<div>` to `<button type="button">` that opens `PortraitPickerDialog`. Disabled when the card is in edit mode or `gameId` is null. On hover (or keyboard focus), an absolutely-positioned overlay fades in: a small image icon SVG plus the text "Change portrait" (or "Pick a portrait" when none is set). Sits centered over the existing portrait/placeholder so layout doesn't shift. PortraitPickerDialog is rendered as a sibling to Modal inside a fragment.
- **Speaker portrait in `ChatMessage`.** New optional `gameId` prop. When the message has a non-user, non-system author and the resolved character has a `character.image.portraitPath`, a 32px rounded `<img>` is rendered immediately to the left of the bubble (or right, for user-flipped messages — though only NPC messages ever render an avatar today). Source URL comes from `api.getImageURL(gameId, character.image.portraitPath)`. Avatar uses `rounded-full object-cover border mt-0.5` so it sits flush with the top of the bubble. The whole row becomes a `flex gap-2` so the bubble width math is unchanged from before. Wired in `ChatPanel` by adding `gameId={gameId}` to the `<ChatMessage>` render — `ChatPanel` already had `gameId` in scope.
- **`NAMES IN USE (do not propose new NPCs with these names)` block in the GM prompt.** Lists every NPC in the game regardless of status (active, pending, disabled). The original `KNOWN NPCs` block stays active-only (the model shouldn't have to reason about disabled NPCs' relationships), but it now has a sibling block that exists purely as a name-collision dead-zone the model can scan against. `gameMaster.buildGameMasterPrompt` splits `allNpcs` into `npcs` (active) and `inactiveNpcs` (pending + disabled) for this.

### Changed
- **`normalizeNewNpc` always assigns a fresh uuid.** Was `id: partial.id || uuidv4()`. Now `id: uuidv4()` unconditionally. LLM-supplied ids are discarded. Combined with the name-collision guard upstream, this means even if a model goes rogue and emits `"id": "mira"` for an existing NPC named Mira, the existence check fires *first* on the name and the entry is dropped before it ever reaches the normalizer. If a name-collision-free new NPC slips through with a model-supplied id, we still throw it away and mint a fresh one — there's no legitimate reason for the model to be naming our primary keys.
- **GM prompt got two new hard rules near the top.** "CRITICAL — DO NOT RE-PROPOSE EXISTING NPCs: if a character is already in KNOWN NPCs or NAMES IN USE, never include them in `newCharacters`. Update them via `characterUpdates` instead." And: "If you are unsure whether someone is new, check KNOWN NPCs first." These are reinforcing the structural guard, not replacing it — but they cut down on the number of times the guard actually has to fire, which matters because each fire is a wasted turn of GM output.
- **`NPCCard` return wrapped in a `<>` fragment** so the Modal and the new PortraitPickerDialog can sit side-by-side without restructuring the existing layout.
- **`ChatMessage`'s outer wrapper changed from a single `<div>` to a `flex gap-2` row** with the avatar (when present) and the bubble as siblings. User-side messages still get `flex-row-reverse` to keep them right-aligned; since user messages never have a portrait, this is purely structural to keep the API consistent.

### Migration
- None. The dedup guard is a pure narrowing of behavior — it can only *not* save a character that previously *would* have been saved (over an existing one), so no existing game can have its state damaged by it. The Deny → delete path was already half-implemented (server side); the client just now reflects it. PortraitPickerDialog is additive UI. ChatMessage's new `gameId` prop is optional and falls back to the old portrait-less render when omitted.

### Verified with these patterns
- **GM tries to re-propose existing NPC "Mira" by name** → name-collision guard fires, `logger.warn` logs `{ matchedName: 'Mira', matchedId: '<uuid>' }`, the entry is dropped, the rest of the turn applies normally. Sidebar count for active NPCs stays the same. No phantom pending Mira.
- **GM emits a `newCharacters` entry with `id` that matches an existing character's id** → id-collision guard fires first (cheaper), drops the entry. Even if the id-collision guard somehow missed (it doesn't), the name-collision guard catches it as a fallback for any GM-named duplicate.
- **GM proposes a genuinely new NPC "Talia" with `"id": "talia"`** → both guards pass (no existing id `talia`, no existing name Talia), entry reaches `normalizeNewNpc`, model-supplied id is discarded, fresh uuid minted, character saved as `status: 'pending'`. Behaviour identical to pre-1.1.31 except the id is uuid-shaped instead of slug-shaped.
- **Deny a pending NPC card** → POST to `/deny`, server hard-deletes JSON file, NPCCard fires `onCharacterDeleted(id)` before closing, AppShell filters it out of `characters`, sidebar refreshes instantly, modal closes. No leftover ghost card requiring a manual refresh to clear.
- **Click portrait on an existing NPC card** → PortraitPickerDialog opens, default filter shows images already linked to this NPC plus unlinked `category: 'character'` images. Click a tile → server applies portrait → character refresh round-trips → modal closes → NPCCard re-renders with the new image. "Show all" toggle widens the filter to every gallery image when nothing matches the default scope.
- **Click portrait when no portrait is set** → same flow, overlay text reads "Pick a portrait" instead of "Change portrait", no "current" ribbon shown.
- **NPC speaks in chat with a portrait set** → 32px circular avatar renders to the left of the bubble, image url comes from `getImageURL(gameId, portraitPath)`. Stacking multiple consecutive messages from the same NPC each get their own avatar (no de-dup — intentional, matches SillyTavern's behavior).
- **NPC speaks in chat with no portrait set** → bubble renders alone, same as pre-1.1.31, no broken-image placeholder.
- **System message / user message** → no avatar branch, original layout preserved exactly.

## [1.1.30] — Multi-character chat overhaul + empty-Enter continue + prompt-to-speak

Three closely-related chat ergonomics fixes that, together, push group scenes much closer to SillyTavern's feel. Group mode used to be visually multi-character but mechanically single-shot: seb types, the model emits one block (often the narrator), nobody else reacts in the same turn, repeat. And there was no way to nudge the scene forward without typing, or to ask a specific NPC to speak up. Three things changed.

### Background

Two subtle architectural things had to be added on the server side before the client UX could work. First, an *empty user content* needed to mean something other than "reject 400" — it had to mean "continue the scene, don't save a user bubble, frame this as a continuation for the LLM." Second, a way to lock the storyteller down to exactly one specific NPC for a single turn (different from group mode, which is a *set* of voiceable participants; different from character mode, which is the *long-term* scope). That single-speaker lockdown is what powers both the auto-reply chain and the sidebar prompt-to-speak button — the client just calls send-message with `singleSpeakerId` set, and the server does the right thing.

The NPC-react-to-NPC weakness in group mode was a separate, model-side problem: the old narrator prompt told the LLM "voice these characters" but never told it that characters should pay attention to each other within the same response. The model defaulted to either narrator monologue or a single character block; multi-character interplay was rare. The new prompt explicitly asks for eye contact, contradiction, side-eye, interruption, and personality contrast — and combined with the auto-reply chain (which fires N follow-up single-speaker turns after the user's turn), the model now gets *two* paths to multi-character reactivity: one inside a single response, one across consecutive turns.

### Added
- **Server-side `singleSpeakerId` lockdown** in `narrator.ts`. When set, the system prompt gets a new top-priority block: "SINGLE-SPEAKER LOCKDOWN — emit EXACTLY ONE `[Character: X]` block, no narrator, no other speakers, react to what just happened." `buildGroupContext`'s signature changed from a positional `nextSpeakerId` to an options object `GroupContextOptions { nextSpeakerId?, singleSpeakerId?, continuation? }` to thread this cleanly.
- **Continuation-turn framing** in `narrator.ts`. When `continuation: true` is passed, the system prompt opens with "CONTINUATION TURN: The player did NOT type a new message. Continue the scene from exactly where it left off — react to the last beat, advance time, deepen the moment. Do NOT restart, summarize, or recap." This keeps the model from treating an empty user turn as a fresh scene opener.
- **`singleSpeakerId` on `OrchestratorOptions`**. `orchestrator.ts` now accepts it on both `runOrchestration` and `runRegeneration`. When set, the orchestrator builds a group context with that NPC as the lockdown target, even if no group is active.
- **Empty-content continuation path** in `orchestrator.ts`. If `userContent.trim()` is empty, `isContinuation = true`: the user message is NOT persisted, the orchestrator returns `userMessage: null`, and a synthetic stub (`"(player advanced the scene without typing; no typed message)"` or `"(player prompted a specific character to speak; no typed message)"`) is passed to the GM so it has *something* to reason about for state-delta extraction.
- **CHARACTERS-REACT-TO-EACH-OTHER block** in the main narrator/group prompt. Explicit guidance: characters in the same scene look at each other, interrupt, contradict, side-eye, contrast personalities. Reduces the "two parallel monologues" failure mode the old prompt produced.
- **`singleSpeakerId` on the client API contract** (`client/src/api.ts`). Threaded into both `sendMessage` and `regenerateMessage` JSON bodies. The `SendMessageOpts` interface picks it up.
- **`allowEmptySubmit` prop on `<ChatInput>`** (default `true`). When the textarea is empty, the Send button morphs into a chevron-right "Continue" button (`btn-secondary` variant), the title becomes "Continue the story (Enter)", and the footer hint switches to "Press Enter to continue the story · type to respond". Hitting Enter with no text fires `onSubmit('')` — the server's continuation path handles the rest.
- **SillyTavern-style auto-reply chain** in `<ChatPanel>`. After the user's turn finishes streaming in group mode, the chain fires N follow-up empty-content sends, each one with `singleSpeakerId` rotated round-robin through the group's participants (excluding whoever just spoke). Default N = 2, configurable 0..3 via a new "Auto-reply: 0 / 1 / 2 / 3" pill row that appears under the group pill. The chain is cancellable: hitting Stop sets a cancel ref that breaks the loop between steps and also aborts the in-flight stream. The Send button stays disabled while the chain is running, and a small italic "chaining replies… (Stop to cancel)" status hint sits next to the pills.
- **Hover chat-bubble button on NPC portrait cards** (`<NPCList>`). Each active NPC card now exposes a small 24px circular icon button at top-right, revealed on `group-hover` (and visible on keyboard focus). Click stops propagation (doesn't open the modal) and calls `onPromptToSpeak(npc)`, which is threaded `NPCList → InfoPanel → AppShell → chat.sendMessage('', { mode: 'character', activeCharacterId: npc.id, singleSpeakerId: npc.id })`. Pending NPCs (no permission to speak yet) and disabled NPCs (off-screen) don't get the button.

### Changed
- **`POST /games/:id/messages` no longer 400's on empty content.** The route used to reject `!content.trim()` outright; now it falls through to the orchestrator's continuation path. `singleSpeakerId` is parsed and forwarded on both messages and regenerate endpoints.
- **`useChat.sendMessage` skips the optimistic user bubble** when content is empty. The server doesn't save a user message in continuation mode, so adding a local one would just get reconciled away on the next history refresh.
- **NPC portrait card root changed from `<button>` to `<div role="button" tabIndex={0}>`** in `NPCList.tsx`. The hover chat-bubble button is itself a `<button>` and nesting buttons is invalid HTML. The outer div keeps the same click/Enter/Space → open-modal behavior. `cursor-pointer` + `group` + `relative` classes added so Tailwind's `group-hover:opacity-100` can drive the bubble's fade-in and so the absolutely-positioned bubble anchors correctly.
- **`ChatPanel`'s `onSend` prop is now `void | Promise<void>`** so the auto-reply chain can `await` it. `AppShell` updated to pass `chat.sendMessage` directly instead of `void`-discarding the promise.
- **Chat stop button now also cancels the auto-reply chain**, not just the current SSE stream.

### Migration
- None. All new server fields are optional; all new client props default to no-op-equivalent values (`allowEmptySubmit = true` is the new default behavior, `onPromptToSpeak` undefined hides the bubble button, `autoReplyCount` default 2 is the new group-mode behavior). Existing games and existing message histories are unaffected. Empty-content sends from older clients that somehow sent one would have been 400-rejected before; now they'd advance the scene — but no released client ever sent one, so this is moot in practice.

### Verified with these patterns
- **Single-character mode, empty Enter** → server treats it as continuation, NPC delivers a reactive single beat, no user bubble appears in history.
- **Group mode, user types "so what now?", auto-reply 2** → user bubble lands, group narrator/first-NPC responds, then chain fires two follow-up turns each locked to a different NPC, so the final transcript shows user → NPC A → NPC B → NPC C all reacting in sequence.
- **Group mode, empty Enter, auto-reply 2** → no user bubble, scene advances with one beat, then two more single-speaker NPC beats — pure narrative drift forward.
- **Group mode, mid-chain Stop** → cancel ref trips, chain breaks before next step, Send button re-enables. The partial chain stays in history (no rewind).
- **Sidebar chat-bubble click on NPC "Mira"** → empty user content + `singleSpeakerId: "mira-id"` → server emits exactly one `[Character: Mira]` block reacting to the previous turn, no narrator, no other NPCs.
- **Sidebar chat-bubble on a pending NPC** → bubble button is not rendered (only active NPCs are prompt-to-speak-able).
- **Group with one participant, auto-reply 2** → chain guard requires `groupIds.length >= 2`, so the chain doesn't fire (would have been silly to round-robin a single NPC against itself).
- **Auto-reply off (0)** → no chain regardless of mode; legacy behavior preserved.
- **Continuation framing isolation** → the continuation prompt block only appears when `continuation: true` is threaded through; ordinary user-typed turns get the regular system prompt.

## [1.1.29] — Illustrious-tuned image prompt pipeline

The image prompt agent and the two character image-prompt agents (regen-image-prompt, from-image) all assumed a generic SDXL booru convention that was actually getting things subtly wrong for the target model family. The system is now tuned specifically for **Illustrious SDXL** (arXiv 2409.19946) and its derivatives (NoobAI, Anima, DivingIllustrious, etc), which is what most local SDXL anime/NSFW workflows actually run. Five concrete things changed.

### Background

Illustrious is the **opposite of Pony XL** in one critical way: quality tags (`masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres, ...`) belong at the **END** of the prompt, not the front. This single ordering rule has the largest measurable impact on output cleanliness, character separation in multi-char scenes, and detail rendering. The old agent neither emitted a quality tail nor enforced its position — it told the LLM "don't add quality suffixes unless examples use them", leaving quality words missing from most generated prompts entirely.

The other Illustrious-canonical conventions (view tag early, booru rating tag in the global block, position-as-tag inside each BREAK subject block, hybrid "tag-skeleton + prose-glue" structure, NSFW unlocked via `explicit` rating not by omitting `general`) were similarly absent or only weakly hinted.

### Added
- **Structured JSON contract for the image chat agent.** `runImageChatAgent` now accepts five new fields from the LLM and assembles them into Illustrious-canonical layout deterministically on the server:
  - `viewTag` — framing tag ("cowboy shot", "full body", "portrait", "from above") inserted EARLY, right after the count token
  - `rating` — booru rating ("general" | "sensitive" | "questionable" | "explicit"). "explicit" unlocks the model's full NSFW distribution — critical for hentai/lewd scenes
  - `globalScene` — shared scene tags (setting, lighting, time of day, weather, multi-char interaction tags like `hetero`, `yuri`, `hugging`, `sex`). Prose-glue allowed here for relationship semantics the model struggles to read from tags alone
  - `perSubjectScenes[]` — array of per-character scene tags, one per subject in `subjectNpcIds` order. Each entry must start with a position-as-tag ("standing on the left", "sitting on the right", "behind her") which is the strongest spatial anchor Illustrious has
  - All five fields are optional — the legacy `sceneDelta` + `subjectNpcIds` contract still works, and the older `prompt` fallback still works
- **`ILLUSTRIOUS_QUALITY_TAIL`** — deterministically appended at the END of every assembled prompt (single, multi, environment). Skipped only if the assembled prompt already contains a recognised quality signature (`masterpiece`, `score_\d`, `best quality`, `very aesthetic`, etc) so the user's example-style override still works.
- **`normalizeRating()`** — maps any LLM rating shorthand to the canonical booru rating tag. Handles aliases like `nsfw` → `explicit`, `sfw` → `general`, `lewd` → `questionable`, `ecchi` → `sensitive`.
- **`stripServerOwnedTags()`** — defensively removes count tokens, quality words, and resolution words from any LLM-supplied field so they can't double-appear in the final prompt if the model ignores our "don't emit these" rules.

### Changed
- **`imageChatAgent.ts` system prompt** completely rewritten around the Illustrious mental model from the paper:
  - Tags > prose for character/scene anatomy; prose > tags for relationships and spatial logic — the hybrid "tag-skeleton + prose-glue" style is explicitly taught
  - Server vs. LLM ownership is spelled out explicitly: server owns count tokens, identity tokens (from `coreAppearance`), BREAK separators, and the quality tail. LLM owns viewTag, rating, globalScene, perSubjectScenes
  - NSFW handling now correct: set `rating="explicit"` for any NSFW/hentai/sexual/nude request; use direct danbooru tags (`ahegao`, `spread legs`, `pussy`, `cum`, `nipples`, `naked`, etc); be specific and direct, euphemism produces worse output
  - Multi-character rules explicitly mandate position-as-tag at the START of every per-subject block, interaction tags in `globalScene` (not per-subject), and strong outfit differentiation between characters to prevent feature bleeding
  - Rule "ONE pose tag, not five" added (a known Illustrious failure mode — stacking `sitting, kneeling, standing` confuses the pose head)
- **`assembleFinalPrompt()` rewritten** to emit Illustrious-canonical structure:
  - **Single-subject:** `<count>, <viewTag>, <identity>, <perSubject[0] or sceneDelta>, <globalScene>, <rating>, <quality tail>`
  - **Multi-subject:** `<total count>, <viewTag>, <globalScene>, <rating>, BREAK, 1girl, <identity_1>, <perSubject[0]>, BREAK, 1boy, <identity_2>, <perSubject[1]>, ..., <quality tail>`. Each BREAK block starts with its own count token (`1girl,` / `1boy,`) as the paper recommends, position-as-tag follows from the LLM's perSubjectScenes
  - **Zero-subject (environment):** `<viewTag>, <globalScene or sceneDelta>, <rating>, <quality tail>`
  - In every case the canonical Illustrious quality tail is appended at the END unless the assembled prompt already contains a quality signature
- **`regen-image-prompt` system prompt** (server/routes/agents.ts) re-ordered to put the quality tail at the END instead of the front. Was using Pony XL-style front-loading. Adds explicit "this is the most-violated Illustrious rule — quality goes LAST, the OPPOSITE of Pony" warning. Includes the canonical Illustrious short negative as a fallback when no default negative is configured.
- **`from-image` character system prompt** (vision-mode NPC creation) same re-ordering: quality tail moved from step 1 to step 11, view tag bumped early per Illustrious convention, "ONE pose tag, not several" rule added.

### Migration
- None. Pure prompt + assembly changes. The JSON contract is fully backwards-compatible — legacy `sceneDelta` + `subjectNpcIds`, and pure-`prompt`-only responses, both still parse and assemble correctly. New models that pick up the structured fields get cleaner output; old models that still emit legacy shapes are unaffected.

### Verified with these patterns
- Single SFW portrait (1 subject, `rating="general"`) → `1girl, <viewTag>, <identity>, <outfit/pose/setting>, general, <quality tail>`
- Multi-character explicit (2 subjects, `rating="explicit"`) → `1girl, 1boy, 2 people, <viewTag>, <globalScene with interaction>, explicit, BREAK, 1girl, <identity>, <perSubject>, BREAK, 1boy, <identity>, <perSubject>, <quality tail>`
- Environment / zero-subject → `<viewTag>, <globalScene>, <rating>, <quality tail>`
- Legacy contract (only `sceneDelta` + `subjectNpcIds`) → still assembles with identity prepended and quality tail appended
- Legacy `prompt`-only fallback → still assembles, identity still prepended via safety net, quality tail appended
- Quality tail dedup: if the LLM emits its own `masterpiece, ...`, the server doesn't double-append

## [1.1.28] — character status lifecycle (pending / active / disabled)

The model has had no concept of "this character isn't part of the scene anymore." Every NPC the GM has ever introduced was treated as a full participant: full personality, appearance, backstory, memories, all crammed into the storyteller context every turn, all of them voiceable, all of them eligible to butt in. Two practical consequences: (1) the GM tends to invent new characters too eagerly, and seb has no veto, and (2) characters seb interacted with once early on still get loaded into context forever even if the story has moved a hundred miles away.

v1.1.28 adds a three-state lifecycle on NPCs and threads it through the entire pipeline.

### Added
- **`NPCStatus` type** (`'active' | 'pending' | 'disabled'`) on `NPCCharacter` (server + client mirrored in `types/index.ts` and `client/src/types.ts`). `active` = full participant; `pending` = GM-created mid-turn, awaiting user approval, filtered out of every prompt; `disabled` = user-archived, kept as a lean one-line reference so other characters can mention them naturally without the model voicing them or wasting context on their full profile.
- **Five new server routes** in `routes/games.ts`:
  - `POST /:gameId/characters/:charId/status` — generic setter (body: `{ status }`)
  - `POST .../approve` — pending → active
  - `POST .../deny` — pending → hard delete (no narrative continuity to preserve since the character was never approved into the story)
  - `POST .../enable` — disabled → active
  - `POST .../disable` — active → disabled
- **`buildNpcLeanBlock`** in `contextAssembler.ts` — one-line inactive marker (`# NPC (INACTIVE — do not voice...): name — one-sentence-personality (id: ...)`) that replaces the full multi-block profile for disabled NPCs. Big context-token savings on long campaigns with lots of legacy characters.
- **Client API helpers** in `client/src/api.ts`: `approveCharacter`, `denyCharacter`, `enableCharacter`, `disableCharacter`.
- **NPCCard status controls** — Approve / Deny buttons for pending NPCs, Enable for disabled, Disable for active. Status badge appended to the modal title (`— PENDING APPROVAL` / `— inactive`).
- **NPCList grouped sections** — Pending / Active / Inactive with counts. Pending cards get an accent border + ring and a `new` badge; disabled cards get `opacity-60` and an `off` badge. Sort order is Pending → Active → Inactive: actions-needed up top, archived demoted.

### Changed
- **GM-created NPCs land as `pending`** instead of auto-active. `stateManager.normalizeNewNpc` stamps `status: 'pending'` so seb always gets a veto.
- **`stateManager` refuses to patch pending / disabled NPCs.** Relationship updates and `characterUpdates` both skip them. As an extra safety, `characterUpdates` explicitly resets `merged.status = existing.status` so the model can't sneak a status promotion through a regular character patch.
- **`contextAssembler.assembleContext`** filters pending NPCs out entirely and routes disabled NPCs through `buildNpcLeanBlock`. The model only sees a heavy profile for active NPCs.
- **Narrator pipeline**: `buildNarratorContext` filters pending; `buildNarratorSystemPrompt` now takes status into account and renders ACTIVE NPCs as voiceable plus an `INACTIVE NPCs (may reference but DO NOT voice)` line for disabled NPCs. `buildGroupContext` filters to active-only.
- **Game Master** only sees active NPCs when reasoning about scene state (`gameMaster.ts` ~L77).
- **ChatPanel**: derived `voiceableCharacters = characters.filter((c) => (c.status ?? 'active') === 'active')` and used it for all speaking-target selectors — character mode tabs, group picker, group seeding, single-NPC auto-select, and the empty-state check. The full `characters` list is still passed to `<ChatMessage>` so historical bubbles from now-disabled characters render correctly. Mode pruning effect now also falls back to narrator if the currently-selected character is disabled mid-conversation.

### Migration
- **`fileManager` normalizer** backfills missing `status` to `'active'` on first read and sets `mutated = true` so the value persists on next save. Pre-1.1.28 games keep working with no manual intervention; every existing NPC becomes `active`.

### Design notes
- **Pending is non-blocking by design.** The story flow is uninterrupted — the GM still creates the character, the narrator continues, seb approves later from the sidebar. This was the explicit design call ("queue and continue") versus the alternative of pausing every time the model adds someone.
- **Disabled NPCs stay in context, just lean.** Seb's words: "i still want the llm to know they exist, but i dont want a whole huge thing of character info and back info being sent to the llm all the time, that would just waste context." The lean block is precisely that — name, id, one-line personality, and an explicit "do not voice" instruction. The model can have other characters reference them naturally in dialogue without spending a thousand tokens on the full profile.

## [1.1.27] — hotfix part 2: prose-style reasoning leak (no tags)

The v1.1.26 fix stripped `<think>...</think>` XML tags but missed the much uglier failure mode where the model emits its reasoning as **plain markdown prose** with no tags at all. Seb's screenshot showed a bubble starting with `Here's a thinking process:` followed by a numbered analysis list, all rendered in the chat. The XML stripper had nothing to grab.

This happens when a thinking model's chat template isn't applied (or is misconfigured), so the model falls back to writing its chain-of-thought as visible content. Common with stock qwen3, r1-distill variants, and any reasoning model loaded with a non-matching template.

### Added
- **`stripProseReasoning(text)`** in `thinkStripper.ts` — detects and removes leading prose-style reasoning preambles using a set of openers (`Here's a thinking process:`, `Let me think...`, `**Thinking:**`, `**Analysis:**`, `Thinking:`, numbered analysis like `1. Analyze...`, hash headings like `# Thinking`, orphan `<reasoning>` tags with no close, etc.). Greedy match consumes the preamble until the FIRST detected real-content boundary: a speaker tag line (`[Narrator]` / `[Character: Name]`), a line starting with `*` (SillyTavern action), a line starting with `"` (SillyTavern dialogue), or em-dash narration. Safety: if no boundary is found, returns the original text unchanged (better to show ugly than empty).

### Fixed
- **Orchestrator** now applies `stripProseReasoning` after `stripThinkingTags` on the finalized `fullContent` in both `runOrchestration` and `runRegeneration`. Two-stage strip: tagged reasoning first, then prose fallback.
- **System prompts** (narrator, narrator-disabled, character) all received a new top-priority rule: `CRITICAL — NO REASONING OUT LOUD`. Explicitly forbids "Here's a thinking process", "Let me think", `**Thinking:**`, `**Analysis:**`, and `<think>` / `<reasoning>` / `<thought>` tags. Mandates that the reply start directly with in-character content or a speaker tag. Belt-and-braces: if the model obeys we never need the stripper; if it doesn't, the stripper catches the residue.

### Verified with these patterns
- Screenshot reproduction: `Here's a thinking process:` + numbered analysis + `[Narrator]` block → reasoning gone, only the speaker blocks remain
- Character-mode preamble: `Let me think about how X would respond...` + story `*action*` → reasoning gone
- `**Thinking:**` markdown header + story → reasoning gone
- Orphan `<reasoning>` tag with no close + story → reasoning gone
- Legit story content starting with `"Here's your change"` (mid-dialogue) → preserved
- Legit story content starting with `"Let me explain"` (mid-dialogue) → preserved
- Clean speaker-tagged input → preserved unchanged (no false positive)

### Migration
- None. Pure runtime fix. No data shape changes, no config changes.

## [1.1.26] — hotfix: thinking-model reasoning leaked into chat bubbles

Report from the field: switching from a normal instruct model (e.g. gemma) to a thinking model (e.g. qwen3 30b) caused the whole `<think>...</think>` reasoning trace to land in the chat bubble instead of the actual story reply. Root cause: the storyteller agent (narrator / character / group modes) had no inline `<think>` stripping. The other agents in the pipeline (gameMaster, summarizer, imageChatAgent) all already stripped these tags, but the main story stream was unguarded — so the user-visible message contained the model's chain-of-thought.

Note on `reasoning_content`: LM Studio's reasoning channel was already handled in `lmStudio.ts` (since v1.1.x). This fix covers the OTHER case — when the loader/template puts reasoning *inside the regular content channel* using `<think>` tags, which is what stock qwen3 does.

### Added
- **`server/services/thinkStripper.ts`** — shared utility module exporting both `stripThinkingTags(final)` (one-shot for finalized strings) and `ThinkStreamStripper` (stateful streaming filter for live token deltas). Handles `<think>`, `<reasoning>`, and `<thought>` tag families, case-insensitive, with attribute support. The streaming filter holds a small buffer when it sees a `<` that *might* start a think tag so partial markup never leaks to the UI, even when the tag is split across token chunks. If the stream ends with an unclosed think block, the unterminated reasoning is dropped (safer to show an empty bubble than spill CoT). If the finalized text is fully empty after stripping, falls back to the contents of the first think block (handles models that mistakenly wrap the whole reply).

### Fixed
- **Orchestrator main flow (`runOrchestration`)** now wraps the LLM stream in `ThinkStreamStripper`. Tokens are filtered live before emission as `assistant-delta` SSE events, so the chat bubble shows only the actual reply in real time. The accumulated `fullContent` also gets a final `stripThinkingTags` pass before being persisted and fed to `splitIntoSpeakerBlocks` — prevents leaked reasoning from poisoning speaker-tag detection.
- **Regeneration flow (`runRegeneration`)** got the same treatment — streaming filter + finalize pass before the regenerated content replaces the message body.
- Both paths preserve abort/error semantics unchanged.

### Verified with these stream patterns
- Whole `<think>...</think>` block in a single chunk → stripped
- Open tag split across chunks (`<thi` | `nk>...`) → stripped
- Close tag split across chunks (`...</thi` | `nk>`) → stripped
- Token-by-token streaming (1 char per chunk) → stripped
- Multiple think blocks in one reply → all stripped
- Bare `<` in narrative prose (`x < y`) → preserved correctly
- Unclosed `<think>` (no closing tag ever arrives) → dropped at flush, no leak
- Whole reply lives inside a think block → finalize fallback recovers the inner text

### Migration
- None. Affects only the runtime stream processing path. No data shape changes, no config changes. Switching back to a non-thinking model is unaffected (no `<think>` tags = no-op).

## [1.1.25] — defaultOutfit field + regen-prompt fix + 1girl dedup

Three related image-pipeline fixes. (1) The image agent had no persistent slot for an NPC's canonical outfit — it had to mine clothing every time from `coreAppearance` (identity-only by design) or from recent story messages (lossy). Users reported the agent kept forgetting what a character was wearing. (2) The "Regenerate prompt" button in Edit Character → image section was always failing with "The model did not return a usable prompt" even when the LLM returned perfectly healthy JSON. (3) Generated prompts contained `1girl` twice — once from the identity-token extraction path and once from the scene-count emitter.

### Added
- **`defaultOutfit` field on `NPCImageData`** (server + client types). Optional string holding canonical outfit tags only (clothing + accessories, booru-style, color/material qualifiers). The image agent now treats it as the primary outfit source unless the user explicitly requested a different outfit or the recent story narrates a wardrobe change.
- **Edit Character → Default outfit textarea** (NPCCard edit form, placed between Core appearance and Portrait prompt). Read-only display Section also added below Core appearance when populated.
- **`defaultOutfit` is fed into the image LLM's NPC context block** via `formatNpcForImageChat`, with an explicit instruction to use it for outfit tags unless overridden.
- **Regenerate prompt now emits 4-field JSON** (`basePrompt`, `coreAppearance`, `defaultOutfit`, `baseNegative`). The new `defaultOutfit` is auto-extracted by the LLM from existing `basePrompt` data so users can populate it for legacy characters with one click.

### Fixed
- **HOTFIX: Regenerate prompt always failed.** Root cause: the regen route reused `extractDraft()`, a parser built for full character drafts that requires `parsed.name`. The regen response has no `name` field, so the parser rejected every healthy LLM response. Added a dedicated `extractImagePromptJson()` that accepts any of `basePrompt | coreAppearance | defaultOutfit | baseNegative`. Healthy responses now parse correctly. Also added a `logger.warn` with the raw payload when parsing fails, for easier debugging.
- **HOTFIX: `1girl` (or `1boy`/`solo`/etc.) appeared twice in generated prompts.** `extractIdentityTokens` was lifting count/subject tokens out of `coreAppearance` (where the old regen prompt explicitly told it to put them) while `buildSceneCountTokens` was also emitting them — both joined into the final prompt. Fix: `extractIdentityTokens` now strips count/subject tokens (`\d+\s*(girl|girls|boy|boys|woman|women|man|men|other|others|people|person)`, plus `solo|duo|trio|hetero|yuri|yaoi|multiple\s+(girls|boys)`). `buildSceneCountTokens` remains the sole emitter. Handles both legacy data and freshly regenerated prompts.
- **`REGEN_IMAGE_PROMPT_SYSTEM` rewritten** to forbid count/subject tokens in `coreAppearance` going forward (combined with the strip-on-read fix above, legacy data is also handled).
- **imageChatAgent system prompt rule 8 split** into rule 8 (OUTFIT priority: user request → recent story → `defaultOutfit` → visual memory → appearance/basePrompt) and rule 9 (POSE/LOCATION/LIGHTING). Total rules now 10.

### Migration
- Existing characters auto-receive `defaultOutfit: ''` on first read post-upgrade (via the normalizer + write-back path established in v1.1.23). No action required for the field to exist. To populate it, either: (a) open Edit Character → Default outfit and paste your canonical outfit tags, or (b) click "Regenerate prompt" and let the LLM split the outfit out of your existing basePrompt.

## [1.1.24] — hotfix: memory delete button did nothing (window.confirm blocked)

Report from the field: clicking "delete" on a memory row did literally nothing — no confirm dialog, no network call, no error. Root cause: the delete handler used `window.confirm(...)` which the browser silently suppresses when (a) the user has previously checked "Prevent this page from creating additional dialogs" on an earlier prompt this session, or (b) DevTools has the equivalent "block dialogs" setting enabled. In either case `confirm()` returns `false` immediately, the early return fires, and nothing happens. The existing "Delete Character" button on the same card already uses inline state-based confirmation (Confirm / Cancel buttons that swap in), so this brings the memory delete in line with that pattern.

### Fixed
- **Memory row delete** now uses inline confirmation state (`confirmDeleteId`) instead of `window.confirm()`. Clicking "delete" swaps the row's action buttons to "confirm" (red) and "cancel". Clicking confirm fires the DELETE API call; clicking cancel reverts.
- **Action buttons stay visible** while a row is in confirm-delete or edit mode — previously the `opacity-0 group-hover:opacity-100` rule could hide them if the cursor drifted off the row.

## [1.1.23] — hotfix: memory delete (and edit) failed for legacy entries

v1.1.22 introduced uuid `id`s on memory entries with a back-compat normalizer that generated fresh uuids for legacy entries on read. The normalizer was pure (no write-back), so every call to `getCharacter` / `listCharacters` rolled NEW uuids for entries that hadn't yet been persisted with ids. Net effect: the client received uuid A for a memory, called `DELETE /memories/A`, and the server re-read the file, regenerated uuid B, looked for A, returned 404. Same failure shape for PATCH.

### Fixed
- **`normalizeCharacter` now returns `{ npc, mutated }`** instead of just the normalized npc. `listCharacters` and `getCharacter` write the result back to disk whenever `mutated === true` (i.e. they had to backfill any missing `id`, `sourceMessageIds`, or `stale`). After the first read post-upgrade, every memory entry has a persisted uuid that stays stable across subsequent reads. CRUD targeting now works for legacy entries.
- Write-back is wrapped in try/catch — if persistence fails the caller still gets normalized data in memory.

### Migration
- No action needed. The first time you open the app on v1.1.23, any character file with legacy memory entries gets rewritten with stable ids. Subsequent edits/deletes work normally.

## [1.1.22] — character memory CRUD + cascade invalidation + set-as-portrait

Character memory had two long-standing rough edges: (1) it was read-only — there was no way to edit, add, or delete an NPC's recollection of past events, and (2) the memory wasn't bound to its source messages, so deleting or rewriting a message left orphaned/wrong memories behind. A scene where you offended an NPC could be deleted and rewritten, and the NPC would still remember the offense and stay mad. v1.1.22 fixes both by tagging every GM-emitted memory with the source message ids that produced it, cascading deletes/edits down to those memories, and adding a full CRUD UI on the NPC card. Separately, this release also lets you promote any generated image to a character's portrait directly from the lightbox or image studio.

### Added
- **`NPCMemoryEntry` schema extension** (`server/types/index.ts` and `client/src/types.ts`): entries now carry `id: string` (uuid), optional `sourceMessageIds: string[]` (the chat message ids the memory was derived from), optional `stale: boolean` (flag meaning "the source message was edited, user should review"), and optional `createdAt: string` (ISO timestamp). Existing `chapter` and `event` fields are unchanged.
- **Back-compat normalizer** (`server/services/fileManager.ts`, `normalizeCharacter`): legacy memory entries (saved before v1.1.22) auto-pick up uuid ids on first read, default `sourceMessageIds` to `[]` and `stale` to `false`. No migration step required. Memories with empty `sourceMessageIds` are treated as user-added/legacy and are NEVER auto-invalidated by cascade logic.
- **Three new server routes** in `server/routes/games.ts` for memory CRUD on a character:
  - `POST /api/games/:gameId/characters/:charId/memories` — body `{ event, chapter? }`, generates a new entry with fresh uuid, empty `sourceMessageIds`, `stale: false`. Returns the updated character.
  - `PATCH /api/games/:gameId/characters/:charId/memories/:memoryId` — body `{ event?, chapter? }`, edits the entry and forces `stale: false` (saving counts as reviewing it). Returns the updated character.
  - `DELETE /api/games/:gameId/characters/:charId/memories/:memoryId` — drops the entry. Returns the updated character.
- **Cascade invalidation helpers** in `server/services/stateManager.ts`:
  - `invalidateMemoriesForDeletedMessages(gameId, deletedMessageIds[])` — for each NPC, drops memories whose `sourceMessageIds` are entirely contained in the deleted set. Memories that had multiple sources and only lost some keep going but have the dead ids pruned (partial-loss survival policy). Returns per-NPC summaries.
  - `markMemoriesStaleForEditedMessage(gameId, editedMessageId)` — sets `stale: true` on every memory whose `sourceMessageIds` includes the edited id. Returns per-NPC summaries.
  - Both skip memories with empty `sourceMessageIds` (user-added/legacy entries are immune).
- **Set-as-portrait UI** in `client/src/components/image/ImageLightbox.tsx`: new "Set as portrait ▾" button between "Save to chat" and "Copy prompt". Click opens a dropdown listing every NPC in the current game (lazy-loaded once per mount via `api.listCharacters`). Selecting an NPC calls `api.setImageAsPortrait(gameId, imageId, npcId)` which wraps the existing `/api/games/:gameId/images/:imageId/send-to` route with `target: 'npc'`. NPCs with an existing portrait show a "replaces current portrait" hint. Outside-click closes the dropdown. The lightbox accepts an optional `onPortraitSet?: (npcId: string) => void` callback so the parent can refresh state.
- **`MemorySection` component** (appended to `client/src/components/info/NPCCard.tsx`, ~233 lines): replaces the old read-only memory bullet list with a full CRUD UI. Each row has hover-revealed Edit and Delete buttons. Edit swaps the row to an inline textarea with Save / Cancel. Delete prompts with `window.confirm`. An "Add memory" form at the bottom posts a new entry. Stale entries get a yellow border (`border-yellow-500/40 bg-yellow-500/5`) plus a "⚠ needs review — source message was edited" badge so they're visually distinct.
- **Four new client API helpers** in `client/src/api.ts`:
  - `setImageAsPortrait(gameId, imageId, npcId)`
  - `addCharacterMemory(gameId, charId, { event, chapter? })`
  - `updateCharacterMemory(gameId, charId, memoryId, { event?, chapter? })`
  - `deleteCharacterMemory(gameId, charId, memoryId)`
  - All four return the updated `NPCCharacter` so the caller can swap in the fresh state without an extra round-trip.

### Changed
- **`applyGameMasterOutput` signature** (`server/services/stateManager.ts`) gained a 4th optional argument `sourceMessageIds?: string[]`. When the GM emits a `relationshipUpdate.notes`, the resulting memory entry now stamps `{ id: uuidv4(), chapter, event, sourceMessageIds: [...sourceMessageIds], stale: false, createdAt: new Date().toISOString() }`. If no source ids are passed, the memory gets an empty array (matches legacy/user-added behavior — never auto-invalidated).
- **Orchestrator threading** (`server/services/orchestrator.ts`): both `applyGameMasterOutput` callsites now pass source message ids. Main flow passes `[userMessage?.id, ...savedMessages.map(m => m.id)]`. Regen flow (alternative generation, `selectAlternative`) passes `[priorUser?.id, updated?.id]`. Both filtered for truthy strings before passing.
- **`normalizeNewNpc`** (`server/services/stateManager.ts`): when a newly-introduced NPC arrives with memory entries from the LLM, each entry is now stamped with a fresh uuid if it doesn't already have one (preserves provided chapter/event, defaults `sourceMessageIds: []` and `stale: false`).
- **Chat routes wired to cascade** (`server/routes/chat.ts`):
  - `PATCH /api/games/:gameId/messages/:messageId` (edit a message in place) now calls `markMemoriesStaleForEditedMessage(gameId, messageId)`.
  - `DELETE /api/games/:gameId/messages/:messageId` now calls `invalidateMemoriesForDeletedMessages(gameId, [messageId])` before responding.
  - `selectAlternative` (swapping the active alternative on a GM message) ALSO calls `markMemoriesStaleForEditedMessage` since the displayed content has materially changed.
  - All three cascade calls are wrapped in try/catch so memory-side failures cannot abort the underlying chat operation.
- **`AppShell.tsx`**: both the standalone `<ImageLightbox>` and the `<ImageStudio>` modal now receive `onPortraitSet={() => { void refreshGameState(); }}`, which reloads characters/world state after a portrait change so the new portrait appears everywhere (NPC cards, scene cast, party panel) without a manual refresh.
- **`ImageStudio` prop surface**: added optional `onPortraitSet?: (npcId: string) => void`, threaded through to the inner `ImageLightbox` instance that opens when a gallery item is clicked inside the studio.

### Migration
- **No data file schema breaking changes.** Existing `corvus/data/games/*/characters.json` files load fine — `normalizeCharacter` quietly backfills memory entries with uuids and the new optional fields on first read, then writes them back on the next save. Existing memories will have `sourceMessageIds: []`, so they behave like user-added entries: they survive any message edit or delete cascade. Only memories produced by the Game Master AFTER upgrading to v1.1.22 will carry source ids and participate in cascade invalidation.
- **User-added memories are immune to cascades by design.** If you manually add a memory through the new UI, it has no source ids, so it will never be auto-deleted or flagged stale even if you delete every message in the chat. To remove it, use the Delete button on the row.
- **Editing a stale memory clears the stale flag.** The PATCH route forces `stale: false` on every save — the act of reviewing and saving is itself the acknowledgement.

## [1.1.21] — multi-character example prompts + smarter example surfacing

v1.1.20 gave the server deterministic identity assembly with BREAK separators and count tokens for multi-character scenes, but the image-chat agent was still flying blind on *scene style* for 2+ subjects — it had one line in the system prompt about ordering tags per-subject and zero concrete examples to imitate. The user-editable example library only contained single-subject portraits, so when the LLM saw a multi-character request it had nothing to pattern-match against. v1.1.21 adds three multi-character examples to the default library, rewrites the agent's example-mining instruction to clarify that examples carry both identity tags and scene tags (and the LLM only mimics the scene-style portion), and adds smart example prioritization so multi-character requests actually see at least one multi-character example in the surfaced slice.

### Added
- **Three multi-character default example prompts** in `getDefaultExamplePrompts()` (`fileManager.ts`):
  - **"Booru — two women, intimate conversation"** — `2girls` with `BREAK` separating per-subject outfit/pose clusters, shared tavern interior scene at the end.
  - **"Booru — man and woman, action / confrontation"** — `1boy 1girl, hetero` with `BREAK`, dynamic poses, neon rain-slick alley scene.
  - **"Booru — three subjects, group scene"** — `3people, 2girls 1boy` with two `BREAK` separators (subject 1, subject 2, subject 3), shared campfire-at-night scene.
  - Each example demonstrates the canonical booru pattern: leading count token → per-subject outfit/pose tags in narrative order separated by ` BREAK ` → shared scene tags (setting, lighting, camera angle, art style) at the end. Count tokens are restated inside each per-subject segment (some samplers attend better when count is repeated).
  - Each negative prompt explicitly includes multi-character failure modes that single-subject negatives miss: `fused faces`, `attribute leak`, plus undesired counts (e.g. `3girls, 4girls, solo` on the 2girls example).
- **`pickExamplesForRequest()` helper** in `imageChatAgent.ts`: surfaces 6 examples (up from 4) and reorders the slice based on request intent. For multi-character requests (detected via English markers like "together", "both", "them", or 2+ NPC names appearing in the user's message), up to 2 multi-character examples come first. For single-subject requests, single-character examples come first with one multi-char example padded in at the end (so the LLM still has a pattern to fall back on if it turns out the scene needs it). Original ordering within each bucket is preserved so hand-curated lists still feel stable.
- **`isMultiCharacterExample()` helper**: detects whether a stored example is multi-character by scanning for booru count tokens / multi-subject markers (`2girls`, `1boy 1girl`, `hetero`, `multiple girls`, `BREAK`, etc.) in its label + prompt.
- **`isMultiCharacterRequest()` helper**: detects multi-character intent in the user's message via (a) multi-subject English markers (`together`, `both`, `them`, `group`, `trio`, etc.), (b) two or more known NPC names in the message, or (c) `<Capitalized> and <Capitalized>` pattern fallback.

### Changed
- **Image-chat agent system prompt rule #6 rewritten**: now explicitly tells the LLM that example prompts contain BOTH identity tags (hair color, eye color, skin, build, marks) AND scene tags (outfit, pose, setting, lighting, camera, art style), but the LLM should mine examples *only for scene-style cues* since the server prepends identity from each NPC's `coreAppearance` (v1.1.20 deterministic assembly). Mirrors and reinforces rule #5. Identity tags in the LLM's output are wasted tokens and the server dedupes them anyway.
- **Image-chat agent system prompt rule #7 rewritten**: now spells out the exact multi-character format the LLM should follow when the request involves 2+ subjects: `<count token>, <shared framing>, <subject 1: outfit/pose/expression/action>, BREAK, <subject 2: ...>, [BREAK, <subject 3: ...>], <shared scene tags>`. Includes count-token conventions, narrative-order guidance, scene-only constraint inside each segment, and a reminder that the server inserts the actual BREAK separators around identity blocks based on `subjectNpcIds` order.
- **`runImageChatAgent` example surfacing** swapped from a flat `examples.slice(0, 4)` to `pickExamplesForRequest(examples, req.userMessage, npcs, 6)`. Increases the surfaced count to 6 *and* prioritizes by request intent.

### Migration
- **Default examples are only backfilled when the user's `examplePrompts` list is empty.** `fileManager.getConfig()` (~line 230-260) intentionally avoids clobbering customized lists — if you've added even one custom example, the v1.1.21 multi-character examples will NOT auto-appear. To get them: open **Settings → Image Prompts**, click **Reset to defaults** (replaces your list entirely), OR add them manually one at a time. The three new entries are also reproduced verbatim in `getDefaultExamplePrompts()` in `server/services/fileManager.ts` for copy-paste.
- No data file schema changes. No version-pinned config migrations needed.
- The smart prioritization is regex-based and ignores spelling — it will not catch every multi-character request perfectly. If you find it's missing yours, just include a clear multi-subject English marker ("show them together", "a and b in the alley", etc.) and it'll trigger reliably.

### Notes
- v1.1.21 does not touch the v1.1.20 deterministic identity assembly, the per-NPC `identitySeed`, the lock-seed toggle, or any of the tag-presence safety nets. This release is example-library + agent-instruction tuning only — server pipeline behavior on the assembly side is unchanged.
- We deliberately did NOT add multi-character examples that mix art styles (e.g. one anime + one painterly). All three new examples are anime/booru with painterly atmosphere tags. Mixing styles in a single multi-subject prompt is unreliable and would teach the LLM bad habits.
- The 6-example slice cap is a soft compromise between context cost and pattern coverage. If you've curated a large library and want a different cap, edit the `6` literal in `runImageChatAgent` (`imageChatAgent.ts` ~line 174) and reload — no schema impact.

## [1.1.20] — image agent character continuity + multi-subject handling

The image-chat agent has been the weakest link in the pipeline whenever you switch LLMs — Gemma, Qwen3.5, Cydonia all paraphrase or omit identity tags differently, so the "same character" ends up with subtly (or wildly) different faces from generation to generation. v1.1.20 takes the LLM out of the identity-preservation loop entirely: the model now emits only the *scene delta* (outfit / pose / setting / lighting), and the server deterministically prepends each subject's `coreAppearance` as an identity anchor. Multi-character scenes get explicit handling with BREAK separators, count tokens, and a UI warning.

### Added
- **Deterministic prompt assembly**: a new `assembleFinalPrompt` step in `imageChatAgent.ts` builds the final prompt server-side as `<count tokens>, <subject 1 identity> BREAK <subject 2 identity> BREAK …, <scene delta>`. The LLM no longer controls identity tags — it can't paraphrase them away, drop them, or invent new ones. Whatever's in `image.coreAppearance` on each NPC card is what lands in the prompt.
- **Per-NPC identity seed** (`NPCImageData.identitySeed: number | null`): a saved diffusion seed that locks the latent-noise starting point for that character. When you generate a single-subject scene with **Lock seed** enabled, every batch entry uses this seed instead of fresh random ones — same face, different scene. Settable / clearable / rerollable from the character card.
- **Lock seed toggle** in the image studio: appears in the new "Identity locked" panel above quick-chat after the image-chat agent resolves a subject. Single-subject only; disabled with a tooltip for multi-character scenes where seed-locking over-constrains composition.
- **Tag-presence safety net**: after assembly, the server verifies each subject's identity tokens are actually in the final prompt. Missing tokens are logged with the subject id (no auto-rewrite yet — since we always prepend from the card directly, this is mostly a diagnostic for empty-coreAppearance characters).
- **BREAK separators** between subjects in multi-character prompts — recognized by A1111 and ComfyUI's Smart-Prompt nodes to reset attention between segments, ignored as a stop-word by models that don't recognize it (safe to include unconditionally).
- **Count tokens** prepended automatically based on the resolved subject set: `1girl`, `1boy`, `2girls`, `1boy 1girl`, `3 people`, etc. Inferred from gender keywords in `coreAppearance` / `appearance`. Booru-trained models attend strongly to count tokens, which materially reduces face-count drift in multi-character scenes.
- **Multi-character UI warning** in the studio when the resolved subject count is > 1: "diffusion models struggle with multi-character scenes — consider generating subjects separately for best identity continuity." Sets expectations and points toward the v1.2.x roadmap (regional prompting / ControlNet / IP-Adapter).
- **Identity anchor + scene delta display** in the quick-chat "Show raw" debug view: makes it explicit which tokens came from the server vs. from the LLM, useful when tuning `coreAppearance` strings.
- New types on `ImageChatResult` and the `/images/chat` response: `subjectNpcIds: string[]`, `sceneDelta`, `identityAnchor`, `repairedTokens`. Old `resolvedNpcId` is kept as an alias for `subjectNpcIds[0]` for back-compat.
- New optional fields on the txt2img / img2img / inpaint request bodies: `subjectNpcIds` and `lockIdentitySeed`. When `lockIdentitySeed=true` and exactly one resolved subject has a saved `identitySeed`, the server overrides the request seed for every batch entry.

### Changed
- **Image-chat agent contract**: the LLM's system prompt now asks for `sceneDelta` (scene-only booru tags) + `subjectNpcIds[]` (npc id array) instead of a full positive prompt. Legacy `prompt` field is still accepted and runs through the safety-net path for back-compat.
- **`runImageChatAgent`** body rewrites the parse + assembly flow: parse raw fields → resolve subjects via `fileManager.getCharacter` → `assembleFinalPrompt` → build `ImageChatResult`.
- **`useImageStudio`** now tracks `subjectNpcIds`, `identityAnchor`, and `lockIdentitySeed` in studio state. `setIdentityContext` and `setLockIdentitySeed` are exposed; the lock toggle auto-disarms when a new chat result comes back with a different subject count.
- **Apply / Generate handlers** in `ImageQuickChat` now forward identity context (`subjectNpcIds`, `identityAnchor`) when applying a chat entry to the studio, so subsequent generations know who's in the frame.
- **txt2img / img2img / inpaint routes** in `server/routes/images.ts` resolve the identity-seed override at the top of the handler. When the lock fires, every batch entry uses the locked seed (instead of: first entry uses the requested seed, rest get random seeds — the old behavior).
- **System prompt** for the image agent now also explicitly tells the LLM *not* to auto-append generic quality suffixes ("masterpiece, best quality, ultra detailed, cinematic lighting") unless they appear in the user's example prompts. Lighting should come from the actual story.

### Notes
- **What this is NOT**: this is not regional prompting, ControlNet, or IP-Adapter. The fundamental constraint that diffusion models struggle with 2+ characters in one image is unchanged — we just stopped making it worse by paraphrasing identity tags. Multi-character work still benefits from generating subjects separately and compositing, or from inpainting one subject at a time. Those are tracked for v1.2.x.
- **The identity-seed lock** is most effective when paired with a sturdy `coreAppearance` string. Empty or minimal coreAppearance + locked seed will still produce a consistent face but won't help if the prompt is ambiguous about who's in the frame.
- The `comfyui.ts` legacy single-shot routes (`POST /api/comfyui/txt2img` etc.) are NOT plumbed for identity-lock — they're only used by debug tools and the main flow goes through `/api/games/:gameId/images/…`.
- Seed lock is intentionally single-subject only. Forcing the same starting latent for a 2-character scene over-constrains composition and tends to merge faces.

### Migration
- Existing NPCs auto-pick up `identitySeed: null` on the first read after upgrade (see `fileManager.ts`/`stateManager.ts` defaulting). No data migration needed.
- LLM responses that still use the legacy `prompt` field continue to work — they go through the safety-net path that logs any missing identity tokens but doesn't force-prepend them (since we can't tell which tokens are identity vs. scene in a paraphrased blob).

## [1.1.19] — per-character action color + character card import overhaul

### Added
- **Per-character action color**: a second color picker in the character info / edit panel, sitting right below the existing Chat color picker. Lets you tint just *that* character's `*action*` / italic text. Resolution order: per-character override → global appearance setting → default `.action-text` CSS class.
- **Starting message picker for character cards**: when an imported chub.ai / SillyTavern card includes a `first_mes` and/or `alternate_greetings`, the New Character Chat dialog now surfaces them as a radio list. Pick one (or skip entirely) and it gets dropped into the new chat as the character's first line. Defaults to the first greeting when at least one exists.
- New server route `POST /api/games/:gameId/messages/seed` — inject a pre-baked assistant message into a chat log without invoking the LLM. Used by the starting-message picker.
- New client API helper `seedMessage(gameId, { content, characterId, type })`.
- New parser helper `extractGreetings(raw)` — combines `first_mes` + `alternate_greetings` (deduped, trimmed) into an ordered list.

### Changed
- **Character card import field mapping**: the old `description → appearance` mapping dumped the entire chub.ai description blob (personality, history, lore, scenario, kinks, etc.) into the appearance field, which is supposed to be a short visual description. Now:
  - Card descriptions are split heuristically. If a labeled `Appearance:` / `Looks:` / `Physical:` section is found, just that section goes to appearance and the rest goes to background.
  - If the description is short (≤ 400 chars, single paragraph), it's treated as a literal appearance line.
  - Otherwise the entire blob goes to background and appearance is left empty for the user to fill in.
  - `scenario` and `creator_notes` are appended to background instead of being shoved into knownInfo.
  - `first_mes` is NO longer folded into knownInfo (it now drives the starting-message picker instead).
- V1 card parser now also reads `tags`, `system_prompt`, and `alternate_greetings` (previously only the V2/V3 wrappers did).
- Standalone `/api/character-card/parse` endpoint now returns `{ source, draft, greetings }` instead of just `{ source, draft }`. The in-game `/games/:gameId/characters/import` endpoint matches.
- `POST /games/:gameId/characters` and PUT/PATCH "create-if-missing" now explicitly propagate `chatColor` and `actionColor` from the request body (previously they were silently dropped on the explicit-create paths — PATCH updates were unaffected).

### Notes
- The action-color issue from v1.1.18 (you could change talking color but not action color) is fixed by adding the per-character action color picker. The global `appearance.actionColor` setting under Settings still works as the fallback; you only need the per-character one if you want different action colors per character.
- The chat panel in `ChatMessage` now resolves action color as `character.actionColor ?? appearance.actionColor ?? default`, so cards / characters without an override still pick up the global setting.
- `.charx` zip-format V3 cards still aren't supported (PNG + JSON only).

## [1.1.18] — rebrand to "Story Core" + character-only chat flow

### Changed
- **Rebrand**: "Corvus Story Engine" → "Corvus Story Core" everywhere — package names, page title, server banner + health response, README / CHANGELOG / CONTRIBUTING headers, logo svg comment, and the in-app brand text in the top-left header.
- **Top-left logo**: the brand bar's gradient-blob placeholder has been replaced with an `<img src="/logo.svg">` that renders the real raven silhouette mark bundled in `client/public/`. Header now shows the actual logo instead of an abstract purple blob.

### Added
- **New Character Chat**: a second creation entry sits next to "New Game" in the library sidebar. It opens a slim dialog with Manual / Import Card tabs and spins up a minimal host game (narrator disabled, no world setup, no stats / inventory / abilities, just a player name) with one NPC attached — either typed in manually or imported from a chub.ai / SillyTavern V1 / V2 / V3 character card (PNG with embedded metadata, or raw JSON). For 1-on-1 chats with a single NPC the chat panel now auto-selects "speaking to <that NPC>" on first open so you can start typing without clicking the pill.
- Standalone server route `POST /api/character-card/parse` — parses an uploaded card and returns `{ source, draft }` without requiring an existing game, so the new dialog can preview the imported fields before the host game is committed. New `server/routes/characters.ts` module.
- Client API helper `parseCharacterCard({ fileBase64, filename })`.
- `GameLibrary` now accepts an optional `onRefresh` callback so creation flows that don't go through the standard `onCreate` path (i.e. the character-chat flow) can force-refresh the sidebar after committing.

### Notes
- Investigated the reported "action text color picker doesn't apply" issue. All code paths verified correct end-to-end: the server PATCH deep-merges appearance updates, `fileManager` migration preserves existing keys, `ChatMessage` applies an inline `style={{ color: actionColor }}` on `*action*` tokens, and the `.action-text` CSS class only fires as a fallback when no override is set. Most likely root cause is a stale client bundle on the running install — this build's freshly hashed asset filenames will bust it. If the issue still reproduces after installing v1.1.18, please share the contents of `corvus/data/config.json` so we can debug the persisted setting directly.
- `.charx` zip-format V3 cards are still not supported (PNG + JSON only).

## [1.1.17] — group chats + chub.ai / SillyTavern character card import

### Added
- **Group chat mode**: a new "Group" pill alongside Narrator / per-character pills in the chat input bar. Pick which NPCs participate in the current scene from an inline multi-select, and the storyteller is hard-locked to voicing only those characters. Other named NPCs are explicitly forbidden from the scene by the system prompt so they can't sneak into a private conversation.
  - **Next speaker hint**: once a group is set, a small row of speaker chips lets you nudge a specific character to respond next ("give Alice the next reply"). The hint is one-shot — it clears after the message is sent so subsequent turns are free-form again.
  - Selecting / deselecting members shows a small live color dot per character (using their `chatColor` or hashed default) so it's easy to tell who's in the scene at a glance.
  - Send is disabled when group mode is active but zero participants are picked.
- **chub.ai / SillyTavern character card import**: a new "Import Card" tab in the Add Character dialog accepts both PNG character cards (V1, V2, and V3 — reads `chara` and `ccv3` `tEXt` chunks) and raw `.json` card files via drag-and-drop or file picker. The server parses the card and returns a populated NPC draft, which is dropped into the manual form for review before saving.
  - Field mapping: `name` → Name, `description` → Appearance, `personality` → Personality, `scenario` + `first_mes` → Known info, `mes_example` → Voice style, `creator_notes` → Background. Tags / system_prompt / character_book / alternate_greetings are intentionally not imported (they map awkwardly onto corvus's NPC shape; can be added in a follow-up).
  - New server service `server/services/characterCardImport.ts` implements PNG `tEXt` chunk reading, base64+JSON decoding, and V1/V2/V3 spec normalization — zero new dependencies.
  - New endpoint `POST /api/games/:gameId/characters/import` accepts `{ fileBase64, filename, save? }` and either returns a draft or persists the character directly.
- Server-side: `OrchestratorMode` gains a `'group'` variant; new `buildGroupContext()` in `narrator.ts` constructs a participant-locked system prompt. `runOrchestration` and `runRegeneration` both accept `groupParticipantIds` + `nextSpeakerId` and route to the new context builder. The narrator-disabled / multi-block speaker splitter is reused for group output, so existing per-character chat colors and tagged bubbles work without any additional changes.
- Speaker splitter is now scoped to participants when running in group mode — if the model hallucinates an off-list character name, it won't be mis-attributed to a real NPC outside the scene.

### Changed
- `ChatPanel`: the bottom "Speaking to" bar is now a small mode machine (narrator / character / group) instead of a single-select list. Existing single-character and narrator workflows are unchanged — group is purely additive.
- `api.ts`: `sendMessage` and `regenerateMessage` now take a typed `SendMessageOpts` (mode, activeCharacterId, groupParticipantIds, nextSpeakerId).
- `AddCharacterDialog` props gain an optional `gameId` so the card-import endpoint can be called.

### Notes
- `.charx` (zip-format V3 cards) is not yet supported; chub.ai PNGs cover the overwhelming majority of cards in the wild. Adding a zip parser is a one-file follow-up.
- The model was already capable of multi-character turn-taking inside a single narrator reply (via `[Character: <Name>]` tagged blocks); group mode makes it explicit, enforced, and discoverable.

## [1.1.16] — chat color customization

### Added
- **Per-character chat color**: each NPC now has an optional `chatColor` field. Edit it from the character card via a new color picker (10 swatches + native picker + reset). When unset, the UI deterministically assigns each character a distinct color from a built-in palette based on their id, so brand-new games look colorful out of the box without any configuration.
- **Global narrator color**: configurable in Settings → Appearance. Tints the "Narrator" speaker label and any narrator-tagged inline text (`_..._`). Defaults to the existing theme color.
- **Global action color**: configurable in Settings → Appearance. Tints italic `*action*` text inside any message. Defaults to the existing theme color.
- New `Appearance` tab in the Settings modal with a live preview pane showing how the narrator/action colors will render against a sample line of story.
- New shared `ColorPicker` component (`client/src/components/common/ColorPicker.tsx`) used by both the character editor and the appearance settings panel.
- New utility module `client/src/utils/chatColors.ts` exposing `colorForCharacter`, plus a 10-color default palette and FNV-1a hash for stable id-based assignment.

### Changed
- `ChatMessage` now accepts an optional `appearance` prop and resolves per-message colors (speaker / narrator / action / dialogue) inline. Falls back to existing CSS classes whenever a color is unset, so games that never touch the picker render identically to before.
- `ChatPanel` threads the global `appearance` config through to each rendered message.
- `GlobalConfig` gained an `appearance: { narratorColor, actionColor }` section, persisted to the same config JSON and deep-merged with defaults on load.
- Server `NPCCharacter` type gained an optional `chatColor: string | null` field. Saved/restored through the existing character PATCH route — no migration required for existing games.

## [1.1.15] — logo & favicon

### Added
- Brand logo: stylized crow head + pen quill silhouette inside a feather circle, rendered in the raven-purple accent (`#7c5cbf`) on the dark cyberpunk background (`#0c0716`).
- `client/public/logo.svg` — full color logo (purple on dark) for in-app use.
- `client/public/favicon.svg` — transparent-background SVG favicon.
- PNG raster fallbacks: `favicon-16.png`, `favicon-32.png`, `favicon-64.png`, `favicon-192.png`, `favicon-512.png`, plus `apple-touch-icon.png` (180×180).
- `<link rel="icon">` and `apple-touch-icon` tags wired into `client/index.html`, along with a `theme-color` meta tag matching the app background.

## [1.1.14] — repo readiness

### Added
- `.gitignore` covering `node_modules`, build output, OS junk, `.env*`, game-data dirs, release zips.
- MIT `LICENSE` file (the README already referenced MIT but the file was missing).
- `.env.example` documenting `PORT`, `HOST`, and `CORVUS_DATA_DIR`.
- `CONTRIBUTING.md` with dev setup, code style, and PR guidance.
- This `CHANGELOG.md`.

### Changed
- Server now binds to a configurable `HOST` (default `127.0.0.1`) so power users can opt into LAN exposure.
- Added `CORVUS_DATA_DIR` env-var override for the data directory (still defaults to `~/corvus-data`).

## [1.1.13] — image agent long-story memory

### Fixed
- Image agent was losing outfit / location / lighting details as stories grew long. Root cause: it only saw the last 20 messages, with each chopped to 400 characters, so anything established earlier just disappeared from its view.

### Changed
- Recent-story window for the image agent: **20 → 40 messages**, per-message truncation **400 → 800 chars**.
- New "visual memory" pass: before sending context, the agent scans the FULL message history (everything older than the recent window) for sentences with visual keywords — clothing (jacket, dress, leather...), body state (naked, barefoot, tattoo...), locations (bedroom, alley, rooftop...), and lighting (sunset, candlelight...).
- Matched sentences are attributed to known NPCs by name and surfaced as a "VISUAL DETAILS REMEMBERED" block (up to 3 per character + 4 general scene details).
- System prompt updated: recent story is authoritative for current outfit, but the agent falls back to the visual-memory block before defaulting to a generic outfit.

## [1.1.12] — floating, resizable recent-images strip

### Changed
- Recent-images sidebar no longer takes up its own column or extends as an empty bar all the way down the screen.
- Now a floating panel in the top-right corner of the chat with semi-transparent / blurred background.
- Auto-sizes to the thumbnails — no empty vertical space.
- Drag the left edge to resize between 80–320px. Width persists across reloads.
- `×` button collapses the panel to a small "Recent (N)" pill; click the pill to expand.
- Only renders when there are images to show.

## [1.1.11] — inpaint mask persistence + sidebar relocation

### Fixed
- Switching tabs away from inpaint and back cleared the painted mask. Root cause: the inpaint panel's canvas-init effect re-ran on every remount and called `onChangeMask(null)`. Fixed by tracking which source image the canvases were last initialized for, and only clearing when the source actually changes. On remount with the same source, the saved mask is now restored onto both the export canvas and the visible purple overlay.

### Changed
- Recent-images thumbnails moved out of the studio quick-chat panel and into the main app layout (between chat and info panel). Studio quick-chat returned to full-width layout. (Layout further refined in v1.1.12.)

## [1.1.10] — coreAppearance + image agent overhaul

### Added
- New `coreAppearance` field on every NPC `image` block — identity-only tags (hair, eyes, body, marks). Deliberately omits outfits / settings / lighting so each generated scene can have its own.
- "Regenerate prompt" button now produces both `basePrompt` (full default portrait) and `coreAppearance` (the scene anchor).
- Both fields are editable in the character card edit form, with inline hints.
- Persistent quick-chat history — closing and reopening the image studio no longer wipes the last suggested prompt. State lifted into `useImageStudio` hook with a "Clear" button.

### Fixed
- Image assistant aggressively appended quality / lighting suffixes ("masterpiece, best quality, ultra detailed, cinematic lighting, volumetric light") regardless of the user's example prompts. System prompt softened — the agent now matches the STYLE of your example prompts (vocabulary, length, structure) without forcing those tags.
- `img2img` and `inpaint` ignored `batchCount` — generating only one image even with batch set to 4. Both endpoints now loop the workflow with a fresh random seed per iteration (same pattern as `txt2img`).
- Inpaint mask upload crashed with `UnboundLocalError: cannot access local variable 'type_dir'`. ComfyUI's `get_dir_by_type` only accepts `'input'`, `'output'`, or `'temp'`; the mask was being uploaded as `'mask'`, which fell through all branches. Now uploads as `'input'` so `LoadImage` can read it like any other image.

### Changed
- Legacy characters auto-backfill an empty `coreAppearance` field; the image agent falls back to `basePrompt` → `appearance` if `coreAppearance` isn't set yet.

## [1.1.9] — speaker tag persistence

### Fixed
- After ~20 messages, the narrator/character speaker tags would stop working and everything collapsed into one giant untagged block. Root cause: the orchestrator splits each assistant response into per-block `ChatMessage`s, but `chatToCompletionMessage` was stripping the `[Narrator]` / `[Character: Name]` tags when replaying history. The model saw untagged blobs and stopped emitting tags itself. Fix: group consecutive assistant messages sharing a timestamp and re-emit them with proper tags via new `groupToCompletionMessage` + `formatAssistantBlock` helpers in `contextAssembler`.

## [1.1.8] — character editing + image assistant rewrite

### Added
- Character cards are now editable inline — every field on an NPC can be changed without nuking and re-creating.
- Image assistant rewrite: booru-style tag output, character continuity via `basePrompt`.

### Fixed
- After chatting with the image assistant and clicking "Generate", the image was generated using the LAST prompt — not the prompt that was just moved into the prompt box. Fixed by adding an `overrides` parameter on `useImageStudio.generate` so the apply-and-generate flow can pass through the new prompt directly.

## [1.1.7] — narrator toggle

### Added
- Per-game narrator on/off toggle. Some users wanted character-only dialogue without narration; the toggle disables narrator blocks in agent output.

## [1.1.6] — copy-game button

### Added
- "Copy game" action — duplicates a game's world, player, characters, and (optionally) history so you can branch / fork without losing the original.

## [1.1.5] — GM image prompts + regen button

### Added
- Game Master agent can now produce structured image prompts when generating NPCs.
- "Regenerate prompt" button on character cards to rebuild `basePrompt` / `baseNegative`.

### Fixed
- Spam-clicking the send button no longer kicks off multiple overlapping generations.

## [1.1.4] — speaker-tag splitting

### Added
- Orchestrator now splits assistant responses into per-block messages (narrator vs. each speaking character), enabling per-block edit / regenerate / swipe.

## [1.1.3] — booru-style example prompts

### Added
- Settings ship with example prompts in booru-style danbooru tag format so the image assistant has a real reference for the user's preferred tag vocabulary.

## [1.1.2] — improved character image prompts

### Changed
- Character image prompt generation overhauled with explicit ✓/✗ rules for what `basePrompt` should and shouldn't include.

## [1.1.1] — vision check via try-and-fail

### Changed
- Vision-model probe replaced with a "try and fall back on failure" approach instead of an unreliable capability check.

## [1.1.0] — base interactive engine

Initial public-ready cut.

- Multi-game support with fully isolated per-game world / characters / state.
- Narrator + character dual-mode output.
- Full state tracking (money, stats, inventory, abilities, NPC relationships).
- Auto-generated NPC character cards with memory.
- SillyTavern-style chat controls (edit, delete, regenerate, swipe alternatives).
- Image Studio (txt2img, img2img, inpaint) via ComfyUI.
- Story-aware image prompt generation.
- Per-game image gallery with metadata.
- Rolling memory via auto chapter summaries.
- File-based JSON / JSONL storage at `~/corvus-data/`.
