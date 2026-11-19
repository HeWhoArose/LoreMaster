# Reliable browser launch — LoreMaster shell (Phase 1)

## The short version

```bash
npm run dev:shell
```

Then open **http://localhost:5173/shell.html**.

`dev:shell` runs the client's own Vite server (`@openworld-game/client`) and passes `--open shell.html`
so a local desktop browser lands on the shell. The server binds to all interfaces
(`server.host: true` in `games/openworld/client/vite.config.ts`) on port 5173, which is what makes a
container/remote port forward reach it. `npm run dev:client` is unchanged and opens the client's
default page (the game).

## Freebuff preview

`.freebuff/preview.json` starts `dev:shell` and opens `http://localhost:5173/shell.html`, waiting for
Vite's `Local:` banner. Do not point the preview at `/` or `/index.html`: those are the game.

## What was investigated (and what the failure is not)

- **Routing:** `shell.html` is a real Vite entry (it is in `build.rollupOptions.input` next to
  `index.html`), and it is served as a page, not through the SPA fallback. `GET /shell.html` → 200.
- **Binding:** the dev server previously bound only to loopback. It now binds all interfaces, so the
  port forward can connect. Playwright still targets `127.0.0.1:5173`.
- **Port forwarding:** with `host: true`, the listener is reachable from the forwarded port; no other
  port is needed and 5173 was not in conflict.
- **External-browser integration:** "Open in system" is Freebuff's own browser hand-off, not part of
  this repository. The reliable path is the in-app preview at the exposed URL above (or the printed
  `Local:` / `Network:` address); no external URL is hardcoded in the project.

## Entry points

| Page          | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `shell.html`  | LoreMaster shell: opening, Home, Library, Discover, Settings, Create |
| `index.html`  | The existing OpenWorld game: title screen, Cover, saves, creator |

The shell hands off to `index.html` through `setShellHandoff()` (`packages/runtime/src/shellHandoff.ts`)
— `resume` for a save, `new` with the recommended look for the creator. Nothing about saves changes.

## Android

`capacitor.config.ts` (and the generated `android/app/src/main/assets/capacitor.config.json`) set
`appName: "LoreMaster"` and `server.appStartPath: "shell.html"`, so the packaged app starts on the
shell rather than the old OpenWorld page. `appStartPath` is the supported key (Capacitor 7.3+);
`startUrl` is not a Capacitor config key. This is configuration only; no device/emulator run was
performed, so the packaged entry point is **not** physically verified.
