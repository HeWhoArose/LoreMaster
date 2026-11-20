# Android — debug build receipt and device test plan

The Android artifact is built and preserved on the machine; it has **not** been installed or played. This note records
the exact build, where the APK is, and the check to run when a device or an emulator exists. Nothing here claims
physical Android verification.

## The build that produced it

| | |
| --- | --- |
| Commit | `b4c724f0` (`master`, pushed) |
| Web assets | `games/openworld/client/dist` — `index.html` **and** `shell.html` |
| Native sync | `npx cap sync android` → `android/app/src/main/assets/capacitor.config.json` with `server.appStartPath: "shell.html"` |
| Build | `gradlew assembleDebug --no-daemon` |
| JDK | 21 — `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot` (the machine's default `JAVA_HOME` is 17 and cannot compile Capacitor's source release 21) |
| Result | `BUILD SUCCESSFUL in 3m47s`, 93 tasks |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Size | 156,035,938 bytes |
| SHA-256 | `4cf3a889c9a5d700b376fd3b37ff8c02911ec0e32967f50faba2ff32c0eb7ecc` |
| Built | 2026-11-19 15:35 local |

The APK itself is gitignored (`android/.gitignore`: `build/`), so this receipt is the record; rebuild it with the command
below when the artifact is needed. A rebuild from the same commit and toolchain should be functionally identical but not
byte-identical (Gradle timestamps), so the hash above identifies *this* file, not a reproducible one.

```bash
npm run build -w @openworld-game/client
npx cap sync android
cd android && JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.13.9-hotspot" ./gradlew assembleDebug --no-daemon
# or, all of the above (and the world/type/unit/build steps too):
npm run verify:android
```

## Why no device test has been run

Checked on 2026-11-19 on this machine:

- `adb devices` → no device attached.
- `$ANDROID_HOME/emulator` → not installed.
- `$ANDROID_HOME/system-images` → not installed (no AVD can be created).

So the blocker is hardware/tooling, not the build: the APK exists and is valid enough to package 93 tasks' output, but
nothing has exercised it at runtime.

## The test to run when a device or emulator is available

Prerequisites: `adb` on `PATH`, USB debugging on the device (or an AVD booted), and the APK from the build above.

```bash
adb devices                                   # the device must be listed as "device"
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.openworld.rpg/.MainActivity
```

What to check, in this order — the shell must be the entry point, and the game must still be reachable behind it:

1. **Entry.** The app opens on the LoreMaster shell (wordmark, Home/Library/Discover/Settings), not on the game's own
   OpenWorld title. This is `server.appStartPath: "shell.html"` working.
2. **Home, first run.** The featured banner shows the story cover, its title and summary, "Begin a story" and
   "Explore the world". "Your stories" shows the open-slot note.
3. **Layout at the device width.** No horizontal scrolling, no clipped text, controls at least 40px tall, nothing under
   the status bar or the gesture bar (safe-area insets).
4. **Navigation.** Every tab opens; the back gesture/button does not close the app from a tab (and does leave a panel if
   one is open).
5. **Discover.** The world hero renders its cover, title, summary and the one play action.
6. **Start a story.** Begin a story → describe a traveller → (offline recommendation consent) → Continue to the
   character creator: the existing pixel creator opens in the WebView with the recommended look, and editing still
   works.
7. **The game itself.** Next → journey → Begin adventure. The pixel game runs at a playable frame rate, the HUD is
   readable, and the touch controls/keys behave as on the web.
8. **Persistence.** A save is written; kill the app and relaunch; Home shows "Continue · Act …" with Resume, and Resume
   returns to that slot. (The IndexedDB store is per WebView origin; confirm it survives a cold start.)
9. **Offline.** With Wi-Fi and mobile data off, `shell.html` and the game still load (the world is bundled) and the shell
   shows no network errors.
10. **Logs.** `adb logcat -s chromium` while walking 1–9: no uncaught errors, no `net::ERR_*` from the app's own pages.

Record for the report: device model, Android version, WebView version (`adb shell dumpsys webviewupdate | head`),
screenshots of Home/Discover/creator/game, and any failed step with the log excerpt. Emulated viewport sizes in
Playwright are not a substitute for this, and this note deliberately does not claim otherwise.

## Emulator, if no device

```bash
sdkmanager --install "emulator" "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n loremaster -k "system-images;android-34;google_apis;x86_64"
"$ANDROID_HOME/emulator/emulator" -avd loremaster &
adb wait-for-device
```

Then run the same ten checks. An x86_64 AVD needs hardware acceleration (WHPX/Hyper-V on Windows); without it the
frame-rate check (7) is meaningless on the emulator and should be marked as such.
