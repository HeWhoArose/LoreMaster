// The UI suite's time budgets, in one place. What a test asserts never changes; UI_BUDGET scales only how long it may
// take, because the game's own boot (the title waits for the worker to draw the world behind it) is tens of seconds on a
// slow machine and a few seconds on a fast one. Default 1: the budgets below are the ones CI uses.
//
//   UI_BUDGET=6 npx playwright test      # the same assertions, six times the time
const raw = Number(process.env.UI_BUDGET ?? '1')
export const UI_BUDGET = Number.isFinite(raw) && raw > 0 ? raw : 1

/** A test's total time budget, scaled by UI_BUDGET. */
export const budget = (ms: number): number => Math.round(ms * UI_BUDGET)
