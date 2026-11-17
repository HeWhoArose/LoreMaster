# Contributing to Corvus Story Core

Thanks for taking the time to look. Corvus is a small, opinionated, local-first project — contributions are welcome but the bar is "fits the vision and doesn't make the codebase worse." Read the rest of this file before opening a PR.

## What I'm looking for

Good fits:

- **Bug fixes** — especially around LLM context handling, image-generation edge cases, and the orchestrator.
- **Small UX polish** — keyboard shortcuts, accessibility, missing affordances.
- **New ComfyUI workflow support** — extra samplers, schedulers, additional model types.
- **Cross-platform fixes** — Windows / macOS path handling, install issues.
- **Documentation** — clearer setup, more troubleshooting entries, better screenshots.

Less likely to land:

- Big new features added without an issue discussion first.
- Cloud / hosted / multi-user features — Corvus is intentionally local-first and single-user.
- Telemetry, analytics, account systems, "phone home" code of any kind. Hard no.
- Rewrites of large subsystems.
- New runtime dependencies unless they meaningfully simplify something.

If you're unsure whether something fits, open an issue first.

## Local development

```bash
# Server
npm install

# Client
cd client && npm install && cd ..

# Run both with hot reload (server on :3000, client on :5173)
npm run dev
```

Optional environment overrides (see `.env.example`):

- `PORT` — backend port (default 3000)
- `HOST` — backend bind address (default 127.0.0.1)
- `CORVUS_DATA_DIR` — where game data lives (default `~/corvus-data`)

You'll need:

- **LM Studio** running locally with any OpenAI-compatible chat model loaded.
- **ComfyUI** (optional, only if you're working on image features).

## Code style

- TypeScript, strict mode. Run `tsc --noEmit` on both server and client before opening a PR:
  ```bash
  ./node_modules/.bin/tsc --noEmit                      # server
  cd client && ./node_modules/.bin/tsc --noEmit         # client
  ```
- Match the existing style. No formatter is enforced — read neighboring files and stay consistent.
- Prefer small, focused functions over giant ones.
- Comments belong on the **why**, not the **what**. The code already says what.
- No new dependencies without justification. If you can do it in 30 lines of stdlib, do it in 30 lines.

## Architecture notes

A 10-second tour so you don't waste time:

- **`server/`** — Node + Express + TypeScript. File-based JSON storage. No DB.
  - `services/orchestrator.ts` — runs the agent pipeline (narrator → game master → state apply)
  - `services/contextAssembler.ts` — builds the prompt within a token budget
  - `services/lmStudio.ts` — OpenAI-compatible chat client (streaming + non-streaming)
  - `services/comfyui.ts` — ComfyUI workflow runner
  - `services/imageChatAgent.ts` — the image-prompt assistant
- **`client/`** — React + Vite + Tailwind. State lives in custom hooks (`useChat`, `useGameState`, `useImageStudio`, `useSettings`).

Game data goes to `~/corvus-data/` by default. Every game gets its own folder. Nothing is shared between games.

## PR checklist

- [ ] Both `tsc --noEmit` runs pass.
- [ ] You've manually tested your change end-to-end in the running app.
- [ ] No new dependencies (or if there are, you've justified them in the PR description).
- [ ] No `console.log` debug noise left in the diff.
- [ ] Commit message describes the **why**, not just the what.
- [ ] If you changed user-facing behavior, you've updated the README and/or added a CHANGELOG entry under an "Unreleased" heading.

## Reporting bugs

Open an issue with:

1. What you were trying to do.
2. What actually happened (paste error text from the server console and the browser console).
3. Versions: Node, OS, LM Studio model, ComfyUI version + model.
4. Repro steps if you have them.

## License

By contributing you agree your code will be released under the project's MIT license.
