import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Two workers saturate a single developer machine: the second browser's page is starved of frames and its waits
  // stall even when the game is running. UI_WORKERS=1 for a full local run; CI can keep the default.
  workers: Number(process.env.UI_WORKERS ?? 2),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    // Tracing records a screencast of every rendered frame. On this canvas-heavy page that costs more than the game
    // itself: with it on, game.spec.ts:16 needs over 12 minutes and can spend its whole budget; with it off, 3.5.
    // Set UI_TRACE=1 when you want the artifacts for a run you expect to fail.
    trace: process.env.UI_TRACE === '1' ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:client -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/ui-lab.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
