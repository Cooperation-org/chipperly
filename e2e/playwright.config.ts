import { defineConfig, devices } from '@playwright/test';

/**
 * E2E harness config. `e2e/server.mjs` (the webServer command) owns the
 * embedded Postgres, migrations and the API process; this file only points
 * Playwright at it. See e2e/README.md for how to run this locally.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  // Every spec file signs up its own account against the one shared API
  // process/DB, and the test-only /testing/last-mail endpoint holds a single
  // global "last message" (apps/api/src/lib/mailer.ts) — running spec files
  // concurrently would let one file's email race another's. One worker keeps
  // the whole run deterministic.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8123',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'ipad-webkit',
      use: {
        // Base: Playwright's own iPad (gen 7) descriptor (webkit engine,
        // isMobile/hasTouch/deviceScaleFactor already right); only the
        // viewport is overridden to match the "tablet" project's size.
        ...devices['iPad (gen 7)'],
        viewport: { width: 820, height: 1180 },
      },
    },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    // Playwright's default cwd for webServer.command is the config file's
    // own directory (e2e/); the command string above is written relative to
    // the repo root (as the root package.json's "e2e" script expects), so
    // pin cwd there explicitly.
    cwd: '..',
    url: 'http://127.0.0.1:8123/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
  },
});
