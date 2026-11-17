If you like the project and want to support it: https://ko-fi.com/latenightai
# Corvus Story Core

> A local-first, LLM-powered interactive-fiction engine. Corvus runs the
> game master for persistent open-world text RPGs — narrating scenes,
> playing NPCs in distinct voices, tracking stats / inventory / money /
> relationships, generating portraits and scene art, and (optionally)
> speaking the whole thing out loud. Everything lives on your machine.

<p align="center">
  <img src="docs/screenshots/02-chat.png" alt="Corvus chat view with multiple NPCs" width="900">
</p>

<p align="center">
  <em>The model is yours. The data is yours. The story is yours.</em>
</p>

---

## Highlights

- **Bring your own model.** Works with any OpenAI-compatible
  `/v1/chat/completions` endpoint — LM Studio, vLLM, llama.cpp's HTTP
  server, LocalAI, OpenRouter, OpenAI. Point the URL where you want.
- **Multi-game library.** Each game is fully isolated: its own world
  info, NPCs, history, summaries, images, and state.
- **Real game-master loop.** Every player turn runs a narrator/character
  pass, a hidden GM pass that extracts structured deltas (stats, money,
  items, NPC dispositions, world events), and a state manager that
  applies them to disk.
- **NPCs that remember.** Auto-generated character cards with
  personality, voice, disposition, and a running memory of past
  interactions. Per-NPC chat colors so dialogue is easy to read.
- **Create-with-AI.** Spawn a new world or a new character chat from a
  one-line prompt; the model fills in setting, tone, rules, starter
  NPCs, and openers.
- **Story-aware image generation.** Optional ComfyUI integration. Tell
  it "draw the woman at the bar" and it pulls her appearance from the
  NPC card and the recent scene.
- **Text-to-speech.** Optional [Chatterbox][chatterbox] integration via
  the OpenAI-compatible `/v1/audio/speech` endpoint. Supports both the
  [devnen][devnen] and [travisvn][travisvn] forks. Per-NPC voices,
  narrator voice, queued playback, pause / resume, volume.
- **Rolling memory.** Old chat gets summarized into chapter notes
  automatically so context stays clean over long sessions.
- **No database, no cloud, no telemetry.** All game data is JSON files
  under `~/corvus-data/`. Move them, version them, back them up, hack
  on them.
- **One-click install.** `./install.sh` + `./start.sh` on
  Linux/macOS, `setup.bat` + `run.bat` on Windows.

[chatterbox]: https://github.com/resemble-ai/chatterbox
[devnen]: https://github.com/devnen/Chatterbox-TTS-Server
[travisvn]: https://github.com/travisvn/chatterbox-tts-api

---

## Screenshots

### Game library

<img src="docs/screenshots/01-home.png" alt="Home screen with game library" width="900">

### Chat with multiple NPCs

Color-coded speakers, per-character voices, group / individual targeting.

<img src="docs/screenshots/02-chat.png" alt="Chat with NPCs" width="900">

### NPC character card

Personality, appearance, background, disposition, voice/style, memory,
identity seed, and portrait prompt — all editable, all persisted.

<img src="docs/screenshots/03-npc-card.png" alt="NPC card modal" width="900">

### LLM endpoint settings

Any OpenAI-compatible server works. Optional global "jailbreak" system
prompt prepended to every request.

<img src="docs/screenshots/04-settings-llm.png" alt="LLM endpoint settings" width="900">

### TTS settings

Chatterbox auto-detection — works with both devnen and travisvn forks.

<img src="docs/screenshots/05-settings-tts.png" alt="TTS settings" width="900">

### Engine settings

Tune the summarizer threshold, context window budget, and auto-NPC creation.

<img src="docs/screenshots/06-settings-engine.png" alt="Engine settings" width="900">

---

## Requirements

| | |
|---|---|
| **Node.js** | 18+ (recommended: 20+) |
| **OS** | Linux, macOS, or Windows |
| **LLM** | Any OpenAI-compatible chat endpoint — LM Studio, vLLM, llama.cpp, etc. |
| **ComfyUI** | Optional. Only needed if you want image generation. |
| **Chatterbox** | Optional. Only needed if you want voiced characters. |

Corvus does **not** ship a model. You point it at one you already run.

---

## Quick start

### The easy way

Clone or extract the project, then from inside the project folder:

**Linux / macOS**
```bash
./install.sh   # one-time setup (checks Node, installs deps, builds client)
./start.sh     # launch
```

**Windows** — double-click `setup.bat`, then double-click `run.bat`.

Open **http://localhost:5173** (dev mode) or **http://localhost:3000**
(production mode) in your browser.

Environment overrides for `start.sh` / `run.bat`:

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `127.0.0.1` | Bind host |
| `CORVUS_PROD` | `0` | `=1` skips Vite HMR and serves only the built bundle |

### Manual install

If you'd rather drive npm yourself:

```bash
npm install
(cd client && npm install)
npm run build      # optional, only for production mode
npm run dev        # dev mode (server + Vite HMR)
# or
npm start          # production mode (server serves built client)
```

---

## First-time setup

1. Launch Corvus and open it in your browser.
2. Click the **Settings** gear icon (top right).
3. **LLM Endpoint** tab — point the API URL at your model server.
   Hit **Test connection**.
   - LM Studio default: `http://localhost:1234/v1`
   - vLLM default: `http://localhost:8000/v1`
   - OpenAI: `https://api.openai.com/v1` + API key + model name
4. **ComfyUI** tab (optional) — enable it and point the URL at your
   ComfyUI install.
5. **TTS** tab (optional) — enable it and point the URL at your
   Chatterbox server. Hit **Test connection** to populate the voice
   list.
6. **Engine** tab — tune the context window budget to match your
   model's actual context length.

---

## Creating your first game

You have two paths:

**A. Quickstart with AI.** Click **+ New Game** → toggle "Create with AI"
→ describe what you want in one sentence ("a haunted lighthouse on the
Maine coast, 1920s, melancholic and slow") → the model fills in setting,
tone, rules, currency, and starting NPCs.

**B. Manual.** Click **+ New Game** and fill in the fields yourself:
name, genre, world description, tone, rules, currency name, player
character (name, backstory, appearance, stats, money, abilities,
inventory).

Either way, hit Create and you're playing.

---

## How it works

### Three agents per turn

When you send a message, three passes run in sequence:

1. **Narrator / Character agent.** Reads your input, the world state,
   the relevant NPC cards, and the recent history; generates the
   in-fiction response (narration + dialogue, color-coded by speaker).
2. **Game Master agent (hidden).** Reads the same exchange and extracts
   structured changes — stat deltas, money changes, new items, NPC
   relationship shifts, world events.
3. **State manager.** Applies the GM's deltas to your game files. The
   right-side info panel updates in real time.

### Rolling context

The prompt assembler keeps things coherent over long sessions:

- Recent chat messages go in verbatim.
- Older messages get summarized into chapter notes once they cross the
  summarizer threshold.
- Relevant NPC cards (whoever's in the current scene) are pulled in.
- World state, world rules, and player stats are always included.
- Total token budget is configurable in **Settings → Engine**.

### Image generation

- Click **Studio** in the header to open the image studio.
- The **Quick chat** input takes natural-language instructions ("draw
  Mira at the rooftop bar, rain"). The image agent reads the story to
  resolve references.
- Three modes: text-to-image, image-to-image, inpainting. Send images
  between modes with one click.
- Every generated image is stored in the per-game gallery with its full
  prompt + settings.
- **Identity seed** support — lock a seed per NPC for consistent faces
  across generations.

### Text-to-speech

- Enable in **Settings → TTS** and point at your Chatterbox server.
- Pick a **narrator voice** for narration / unknown speakers.
- Per-NPC voice + enable toggle on each NPC card.
- A floating dock (bottom right) shows the now-speaking line with
  pause / resume + volume.
- Messages stream into a queue and play in chat order — multiple
  speakers never overlap.

---

## Data storage

All game data lives at `~/corvus-data/` (configurable) as plain JSON.
No database. No migrations. `cp -r` is your backup tool.

```
~/corvus-data/
  config.json                ← Global settings
  games/
    your-game-name/
      game.json              ← Game metadata
      world.json             ← Setting, tone, rules, currency, era
      player.json            ← Player character sheet
      characters/            ← NPC cards (one JSON per NPC)
      history/               ← Chat messages (JSONL per chapter)
      summaries/             ← Auto-generated chapter summaries
      images/                ← Generated images + sidecar metadata
      state/
        world-state.json     ← Persistent world events / location flags
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| **Enter** | Send message |
| **Shift+Enter** | New line in message |
| **Escape** | Close any open modal |

---

## Troubleshooting

### "Connection refused" / "fetch failed" on the LLM endpoint
- Your model server isn't running, or the URL is wrong.
- LM Studio: make sure the local server is **enabled** in its Server
  tab and a model is **loaded**.
- vLLM / OpenAI / OpenRouter: the **Model** field is required. LM Studio
  ignores it.

### TTS test button returns an error
- `Connection refused` — Chatterbox isn't listening on that port. Start
  it, or fix the URL.
- `Host unreachable` — different machine on your LAN? Make sure
  Chatterbox is bound to `0.0.0.0` (not `127.0.0.1`) and any firewall
  allows the port.
- `Timed out` — the server is reachable but slow to respond. Often a
  cold start; try again.
- No voices in the dropdown — older Chatterbox builds don't expose a
  catalog. Type the voice filename (e.g. `female_01.wav`) directly.

### Story feels forgetful / inconsistent
- Bump **Context window budget** in Engine settings.
- Your model's actual context length matters — 8K is the practical
  minimum.
- Check that summaries are being created (look in
  `~/corvus-data/games/<game>/summaries/`).

### No images generating
- ComfyUI not running, or the configured model name isn't installed.
- Check the ComfyUI console for the real error — Corvus surfaces a
  short summary but ComfyUI's log is the source of truth.

---

## Tech stack

- **Backend** — Node.js, Express, TypeScript (`tsx` watch in dev)
- **Frontend** — React, TypeScript, Tailwind CSS, Vite
- **LLM transport** — OpenAI-compatible `/v1/chat/completions`
- **Image gen** — ComfyUI HTTP API
- **TTS** — Chatterbox `/v1/audio/speech` (OpenAI-compatible)
- **Storage** — File-based JSON / JSONL
- **No database. No cloud. No telemetry.**

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The codebase is
small and deliberately readable; `server/services/orchestrator.ts` and
`server/services/gameMaster.ts` are good places to start reading.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full history. Recent highlights:

- **1.1.45** — one-click installers (`install.sh`, `start.sh`,
  `setup.bat`, `run.bat`)
- **1.1.44** — proper devnen/Chatterbox-TTS-Server support with grouped
  voice catalog
- **1.1.42** — Chatterbox text-to-speech with per-NPC voices, queue,
  pause / resume
- **1.1.41** — global jailbreak system prompt
- **1.1.40** — generalized LLM endpoint (vLLM, OpenAI, OpenRouter, etc.)
- **1.1.39** — create-with-AI for both worlds and character chats

---

## License

MIT — see [LICENSE](LICENSE).
