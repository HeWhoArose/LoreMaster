#!/usr/bin/env node
// The workspace's verification run (docs/verification.md): every check, in a fixed order, each with its own log and
// its own time limit, so one slow step neither hides the rest nor reports a partial run as a pass. A step's exit code
// is the step's; the runner exits non-zero if any step failed, and an unknown step name is an error, not an empty
// pass. A step over its limit has its whole process tree stopped: killing the shell alone leaves npm, node and vite
// running on Windows, and a survivor that holds its output open would keep the runner waiting past its own limit.
//
//   node scripts/verify.mjs                 the core set (world, types, unit tests, build)
//   node scripts/verify.mjs --ui            …and the Playwright UI suite
//   node scripts/verify.mjs --android       …and the Android sync + debug APK
//   node scripts/verify.mjs --only=build    one or more steps by name, comma-separated
//   node scripts/verify.mjs --list          the step names

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
const only = process.argv.slice(2).find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').map((s) => s.trim())

/**
 * On Windows the shell scripts (`npm`, `./gradlew`) are not executables: everything runs through the shell, which is
 * also how the project's own docs tell a person to run them.
 */
const shell = true
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'

/** A JDK 21 is required by Capacitor's Android library; the machine's default JAVA_HOME is often an older one. */
function java21() {
  if (process.env.ANDROID_JAVA_HOME) return process.env.ANDROID_JAVA_HOME
  const homes = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft']
  for (const home of homes) {
    try {
      const found = readdirSync(home).find((d) => /^jdk-21/.test(d))
      if (found) return resolve(home, found)
    } catch {
      /* not on this machine */
    }
  }
  return undefined
}

const jdk21 = java21()

/**
 * Stops a step and everything it started. The step runs under a shell, so `child.kill()` reaches only the shell: on
 * Windows `taskkill /T` walks the tree, and on POSIX the step is spawned detached so its whole group has one id.
 */
function stopTree(pid) {
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      /* already gone */
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

/** The receipt says which tree it verified; a local run has no GIT_COMMIT in its environment. */
function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const steps = [
  {
    name: 'world',
    why: 'the game world and bundle the page and the UI suite read (gitignored, regenerated here)',
    command: `${npm} run gen:world`,
    timeoutMs: 900_000,
  },
  {
    name: 'types',
    why: 'every project in the workspace (TypeScript boundaries)',
    command: `${npm} run typecheck`,
    timeoutMs: 3_600_000,
  },
  {
    name: 'unit',
    why: 'the shell contract and the package dependency rules; the 30s default is too tight for the boundary walk here',
    command: 'npx vitest run games/openworld/client/test/shell.test.ts packages/engine/test/boundaries.test.ts --testTimeout=180000',
    timeoutMs: 900_000,
  },
  {
    name: 'build',
    why: 'the web client as it ships (dist/, with shell.html and index.html)',
    command: `${npm} run build -w @openworld-game/client`,
    timeoutMs: 900_000,
  },
  {
    name: 'ui',
    why: 'the Playwright suite (docs/verification.md records this host\'s boot cost and what to expect)',
    // One worker unless asked otherwise: two browsers on one machine starve each other of frames, and the spec waits
    // then stall even though the game is running. UI_BUDGET scales the time allowed, never an assertion.
    // This machine's boot and protocol latency need 3× the written budgets (docs/verification.md records the
    // measurement); the assertions are identical at any scale, and UI_BUDGET overrides it.
    command: `npx playwright test --workers=${process.env.UI_WORKERS ?? 1}`,
    env: { UI_BUDGET: process.env.UI_BUDGET ?? '3' },
    timeoutMs: 3_600_000,
    optional: !flags.has('--ui'),
  },
  {
    name: 'android-sync',
    why: 'copies dist/ into the Android project and regenerates capacitor.config.json',
    command: 'npx cap sync android',
    timeoutMs: 900_000,
    optional: !flags.has('--android'),
  },
  {
    name: 'android-apk',
    why: 'the debug APK, built with a JDK 21 (Capacitor compiles at source release 21)',
    command: gradlew === './gradlew' ? './gradlew assembleDebug --no-daemon' : 'gradlew.bat assembleDebug --no-daemon',
    cwd: resolve(root, 'android'),
    env: jdk21 ? { JAVA_HOME: jdk21 } : {},
    timeoutMs: 1_800_000,
    optional: !flags.has('--android'),
  },
]

if (flags.has('--list')) {
  for (const s of steps) console.log(`${s.optional ? '(opt) ' : '      '}${s.name.padEnd(14)} ${s.why}`)
  process.exit(0)
}

if (only) {
  const known = steps.map((s) => s.name)
  const unknown = only.filter((name) => !known.includes(name))
  if (unknown.length) {
    console.error(`[verify] no such step: ${unknown.join(', ')} — run --list for the names`)
    process.exit(2)
  }
}
const selected = steps.filter((s) => (only ? only.includes(s.name) : !s.optional))
if (!selected.length) {
  // An empty run looks exactly like a pass in a log, so it is not one.
  console.error('[verify] no steps selected — nothing to verify')
  process.exit(2)
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = resolve(root, 'verify-logs', stamp)
mkdirSync(outDir, { recursive: true })

function run(step) {
  return new Promise((done) => {
    const started = Date.now()
    const logPath = resolve(outDir, `${step.name}.log`)
    const log = createWriteStream(logPath)
    log.write(`$ ${step.command}\n\n`)
    // Detached on POSIX only: it gives the step's tree one id to kill. Windows needs no flag for that (taskkill /T
    // walks the tree), and a detached console there would outlive the runner.
    const child = spawn(step.command, {
      cwd: step.cwd ?? root,
      shell,
      env: { ...process.env, ...step.env },
      detached: process.platform !== 'win32',
    })
    let timedOut = false
    let settled = false
    let timer
    let drain
    const finish = (code, note) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(drain)
      if (note) log.write(note)
      log.end()
      done({ name: step.name, code, seconds: Math.round((Date.now() - started) / 100) / 10, log: logPath })
    }
    timer = setTimeout(() => {
      timedOut = true
      log.write(`\n[verify] time limit ${Math.round(step.timeoutMs / 1000)}s reached: stopping the step\n`)
      stopTree(child.pid)
      // Settle on the limit, not on the step being polite: a survivor holding stdout open keeps 'close' from firing,
      // which is the failure this limit exists for.
      drain = setTimeout(() => finish('timeout', "[verify] the step's output stayed open after the kill; the log was closed anyway\n"), 15_000)
    }, step.timeoutMs)
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.on('error', (error) => finish(`spawn failed: ${error.message}`))
    child.on('close', (code) => finish(timedOut ? 'timeout' : code))
  })
}

const results = []
for (const step of selected) {
  process.stdout.write(`${step.name} … `)
  const result = await run(step)
  results.push(result)
  const ok = result.code === 0
  console.log(ok ? `ok (${result.seconds}s)` : `FAILED (${result.code}, ${result.seconds}s) — ${result.log}`)
}

const skipped = steps.filter((s) => !selected.includes(s)).map((s) => s.name)
const summary = { at: new Date().toISOString(), commit: process.env.GIT_COMMIT ?? headCommit(), passed: results.every((r) => r.code === 0), steps: results, skipped }
writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

console.log(`\n${summary.passed ? 'PASS' : 'FAIL'} — ${results.length} step(s), logs in verify-logs/${stamp}`)
if (skipped.length) console.log(`not run: ${skipped.join(', ')} (see --list)`)
process.exit(summary.passed ? 0 : 1)
