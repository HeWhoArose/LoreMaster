# Verification report

Environment: Windows 11, Node/npm workspace at `C:\Dev\Loremaster`, Vite dev server, Chromium (preview panel),
JDK 21 (Temurin 21.0.13) and Android SDK at `%LOCALAPPDATA%\Android\Sdk`. Live AI disabled throughout.

## 1. Automated checks

| Command | Result |
| --- | --- |
| `npx vitest run packages/narration/test` | **37 passed / 37** (4 files: conformance 16, turn 7, recovery 11, context 3) |
| `npx tsc -p packages/narration` | pass (exit 0) |
| `npx tsc -p packages/runtime` | pass (exit 0) |
| `npm run typecheck:game` (14 projects, narration added) | pass (exit 0) |
| `npm run build` (gen world + Vite client build) | pass (exit 0), `games/openworld/client/dist` produced |
| `npx cap sync android` | pass, web assets copied into `android/app/src/main/assets/public` |
| `cd android && JAVA_HOME=<jdk21> ./gradlew assembleDebug` | **BUILD SUCCESSFUL** (9m 6s), `android/app/build/outputs/apk/debug/app-debug.apk` (155 MB) |
| Full repo suite (`npx vitest run --reporter=dot --maxWorkers=2`) | **not completed**: the run was terminated by the environment after ~30 min without printing a summary (twice). No pass/fail total is claimed for it. The affected packages were verified individually (narration suite, package and runtime type checks, web build, browser run). |

Android note: the first `assembleDebug` attempt failed with `invalid source release: 21` because Gradle was
running on the machine's default JDK 17 while Capacitor targets Java 21. Re-running with `JAVA_HOME` pointing at
the installed JDK 21 succeeded. No project file was changed for this; it is an environment requirement.

## 2. Web runtime verification (real game, not a harness)

Dev server: `npx vite --port 5173 --host 127.0.0.1` in `games/openworld/client` (PID recorded during the run).
The bundled game was driven in the browser:

1. Title → "Play without AI" → New game → character → "Begin adventure" → world loads.
2. Opened **Story**, typed `hello there`, sent. Result: the transcript shows the player line and a narrator
   line ("There is no one here to answer."), turn counter `Story · 1`. This exercises intent classification,
   context assembly, provider proposal (`no_action`), narration, history and persistence.
3. Typed `walk north`, sent. Result: transcript gained the player line and "You move on.", status read
   **"The world changed and the turn was kept."**, `Story · 2`, and the Retry control appeared. This is a real
   `Engine.act('move')` reported by the engine, not model prose.
4. Reloaded the page (full browser reload), clicked **Continue**. The story restored: all three turns, including
   a third sent before the reload, were present (`Story · 3`). Persistence key:
   `narrative:<worldBase>|<contentVersion>` in the runtime's IndexedDB.

Defect found and fixed during this verification: `startNarrative()` was awaited **before** the worker posted
`{t:'ready'}`. When the story store was slow, the game stalled behind the title backdrop with no frames. The
call now happens immediately after `ready` as fire-and-forget; re-verified by reloading and continuing.

Not verified in the browser: the clarification buttons (the starting location has no second nearby entity to
produce an ambiguity) and a mid-turn interruption (needs killing the tab between the planning and executing
writes). Both are covered by the automated tests listed above; this is stated as a gap, not a pass.

## 3. Android runtime verification

* Capacitor configuration: `capacitor.config.ts` (`appId com.openworld.rpg`, `webDir
  games/openworld/client/dist`); `cap sync` succeeded.
* Build: `assembleDebug` succeeded with JDK 21 (APK above).
* **Not tested on a device or emulator.** `adb devices` lists no device and the Android SDK on this machine has
  no `emulator` package installed, so the app could not be launched. Persistence, narrative interaction and
  keyboard behaviour on Android are therefore **unverified at runtime**; they rely on Capacitor's WebView sharing
  the same IndexedDB implementation as the verified web path.

## 4. Test coverage of the required behaviours

| Behaviour | Test |
| --- | --- |
| Ordinary dialogue, valid action, invalid action, ambiguity, clarify→execute, clarify→reject | `turn`, `conformance` |
| Engine action failure reported as failure, no fake success | `turn` |
| NPC response, multi-NPC dialogue, memory retrieval/update, rolling summary | `turn`, `conformance` |
| Invalid structured model output → validated fallback | `conformance` |
| Provider failure | `turn` |
| Persistence failure (save rejects) | `recovery` |
| Interrupted turn recovery | `recovery` |
| Regeneration of a mutating turn restores the snapshot | `recovery` |
| Content-version invalidation (narrative only) | `recovery` |
| Snapshot ring limited to 10 | `recovery` |
| Context budgeting | `context` |
| Authority boundary (no narrative write path; invalid proposals never reach the engine) | `conformance` |

Note on the full suite: the repository's `npm test` covers far more than this change (AI, editor, world
generation and long simulation tests) and takes well over half an hour on this machine. Two attempts were
observed running and then disappearing with no `EXIT` line or summary; the surviving dot output contained
failures in unrelated files, but without a summary they are not attributed here. This is reported as a gap,
not as a pass.

## 5. Limitations

* Live AI is intentionally off; all prose in this build comes from the deterministic mock provider.
* Android runtime testing blocked by missing emulator/device (see §3).
* The browser clarification flow is covered by tests only, for the reason in §2. 
* No visual/screenshot review was performed; the panel was inspected through the DOM.
