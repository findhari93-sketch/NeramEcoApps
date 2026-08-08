import { defineConfig, devices } from '@playwright/test';
import type { ReporterDescription } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load E2E test credentials from .env.test (then .env.local as fallback)
dotenv.config({ path: path.resolve(__dirname, '.env.test') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
// Supabase URL + service key live in the app env, not the root one. Specs that
// seed their own fixtures need them. dotenv does not overwrite already-set
// values, so anything above still wins.
dotenv.config({ path: path.resolve(__dirname, 'apps/nexus/.env.local') });

/**
 * Playwright E2E Testing Configuration
 *
 * Run all tests: pnpm test:e2e
 * Run with UI: pnpm test:e2e:ui
 * Run specific project: pnpm test:e2e --project=marketing-chrome
 *
 * Authentication:
 * - The 'setup' project runs ONCE to authenticate
 * - Auth state is saved to tests/.auth/
 * - All authenticated tests reuse this state (no repeated logins!)
 */

// Paths to saved authentication states
const STUDENT_AUTH_FILE = path.join(__dirname, 'tests/.auth/user.json');
const TEACHER_AUTH_FILE = path.join(__dirname, 'tests/.auth/teacher.json');

/**
 * Where the nexus specs point. Matches APP_URLS in tests/utils/credentials.ts,
 * which the API-level specs use, so both follow the same override.
 *
 * A local dev server normally talks to the PRODUCTION Supabase through
 * db.neramclasses.com. To run specs that write against staging instead, start a
 * second server wired to the staging keys and point the suite at it:
 *
 *   E2E_NEXUS_URL=http://localhost:3022 pnpm test:e2e --project=nexus-chrome --no-deps
 */
const NEXUS_URL = process.env.E2E_NEXUS_URL || 'http://localhost:3012';

/**
 * Limit which dev servers Playwright waits for, e.g. PW_APPS=nexus.
 *
 * Empty (the default) means all of them, so CI and a normal local run are
 * unchanged. It exists because the gate is all-or-nothing: one app failing to
 * serve its root holds up a run that never touches that app, and Playwright
 * reports only "Timed out waiting from config.webServer" with no clue which app
 * or why. Running one app's specs should not require the other three to be
 * healthy.
 */
const ONLY_APPS = (process.env.PW_APPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Apps that Playwright starts itself. See the `webServer` block at the bottom.
 */
const WEB_SERVER_APPS: ReadonlyArray<{
  name: string;
  dir: string;
  port: number;
  env?: Record<string, string>;
}> = [
  {
    name: 'marketing',
    dir: 'apps/marketing',
    port: 3010,
    // Mutes chatbot_conversations logging so the scripted questions in the
    // Aintra specs never land in the production admin Chat History, which reads
    // that table as real leads to rate and train on. Unlike NEXT_PUBLIC_*, this
    // name survives a prebuilt server; see apps/marketing/src/lib/e2e-mode.ts.
    env: { E2E_TEST_MODE: 'true' },
  },
  {
    name: 'app',
    dir: 'apps/app',
    port: 3011,
    // Enables the phone-auth E2E bypass (disables reCAPTCHA for registered test
    // numbers); see packages/auth/src/firebase.ts.
    // NOTE: NEXT_PUBLIC_* is inlined at BUILD time. If this app is ever moved to
    // E2E_PROD_SERVERS, this must be set on the `next build` step instead, because
    // it has no effect on an already-built server.
    env: { NEXT_PUBLIC_E2E_TEST_MODE: process.env.NEXT_PUBLIC_E2E_TEST_MODE || 'true' },
  },
  { name: 'nexus', dir: 'apps/nexus', port: 3012 },
  { name: 'admin', dir: 'apps/admin', port: 3013 },
];

/**
 * Comma-separated app names to serve from a production build (`next start`)
 * instead of `next dev`. Set by CI, for example E2E_PROD_SERVERS=marketing.
 *
 * Only `marketing` is safe today. `next start` forces NODE_ENV=production, which
 * Next inlines at build time, and that:
 *   - 404s the nexus test-login routes (apps/nexus/src/app/api/auth/test-login/route.ts
 *     and .../auth/parent/test-login/route.ts) and makes ms-verify.ts reject
 *     `test_` tokens, which every authenticated project depends on; and
 *   - activates the next-pwa service worker in nexus/app/admin, which would cache
 *     responses across tests.
 * Marketing has no auth guard and no PWA, so it can run as a production build.
 */
const PROD_SERVERS = new Set(
  (process.env.E2E_PROD_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean)
);

const REPORTERS: ReporterDescription[] = process.env.PW_BLOB
  ? [['blob'], ['list']]
  : [['html', { outputFolder: 'playwright-report' }], ['list']];

export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. Sharded CI runs emit blob reports that a downstream
   * job merges into a single HTML report (see .github/workflows/e2e-full.yml). */
  reporter: REPORTERS,

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:3010',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers and apps */
  projects: [
    // =====================================================
    // SETUP PROJECT - Runs FIRST to authenticate
    // =====================================================
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      // Setup is the first thing to touch each app, so it pays the whole
      // dev-server cold-compile bill. The student sign-in alone crosses two apps
      // (3011/login -> 3010/sso -> 3011/login?sso=none): measured 54s on a warm
      // machine and over 120s when the servers are compiling under load, with
      // /sso taking 31s by itself. Matches the 180s the webServer entries below
      // already allow a dev server to start, for the same reason.
      timeout: 180 * 1000,
    },

    // =====================================================
    // SMOKE - the PR gate. No auth, no seeded data, no
    // dependencies, so it can never skip its way to green.
    // Asserts every app boots and serves pages, which is
    // exactly the failure that kept CI red for months:
    // a missing generated module made marketing 500 on every
    // request and Playwright reported only a webServer timeout.
    // =====================================================
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      // Every request in this suite allows 60s, which the 30s default test budget
      // made unreachable: the test died first and reported "Test timeout of
      // 30000ms exceeded" instead of the assertion written to explain the
      // failure.
      //
      // 120s, not 90s. The ci.yml smoke job does not set E2E_PROD_SERVERS, so all
      // four apps run `next dev` there and the first hit on each pays a cold
      // compile on a 2-core runner. Locally, under four dev servers compiling at
      // once, the marketing homepage took ~90s and sat right on a 90s budget.
      // CI runs workers: 1, so it sees less contention, but the margin belongs
      // here rather than in a flaky PR gate.
      timeout: 120 * 1000,
    },

    // =====================================================
    // MARKETING SITE (No Auth Required)
    // =====================================================
    {
      name: 'marketing-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3010',
      },
      testMatch: /.*marketing.*\.spec\.ts/,
      // No auth needed for marketing site
    },

    // =====================================================
    // STUDENT APP (Firebase Auth Required)
    // =====================================================
    {
      name: 'app-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3011',
        // Reuse saved authentication state
        storageState: STUDENT_AUTH_FILE,
      },
      testMatch: /.*(app|profile).*\.spec\.ts/,
      // Run after setup completes
      dependencies: ['setup'],
    },

    // =====================================================
    // MOBILE/PWA TESTS (Firebase Auth Required)
    // =====================================================
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        baseURL: 'http://localhost:3011',
        // Reuse saved authentication state
        storageState: STUDENT_AUTH_FILE,
      },
      testMatch: /.*mobile.*\.spec\.ts/,
      dependencies: ['setup'],
    },

    // =====================================================
    // NEXUS/TEACHER TESTS (Microsoft Auth Required)
    // =====================================================
    {
      name: 'nexus-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: NEXUS_URL,
        // Reuse saved teacher authentication state
        storageState: TEACHER_AUTH_FILE,
      },
      testMatch: /.*nexus.*\.spec\.ts/,
      dependencies: ['setup'],
    },

    // =====================================================
    // NEXUS MOBILE TESTS (Teacher mobile viewport)
    // =====================================================
    {
      name: 'nexus-mobile',
      use: {
        ...devices['Pixel 5'],
        baseURL: NEXUS_URL,
        storageState: TEACHER_AUTH_FILE,
      },
      testMatch: /.*nexus-mobile.*\.spec\.ts/,
      dependencies: ['setup'],
    },

    // =====================================================
    // ADMIN TESTS (Microsoft Auth Required)
    // =====================================================
    {
      name: 'admin-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3013',
        // Reuse saved teacher authentication state (admins use same MS auth)
        storageState: TEACHER_AUTH_FILE,
      },
      testMatch: /.*admin.*\.spec\.ts/,
      dependencies: ['setup'],
    },

    // =====================================================
    // CROSS-APP INTEGRATION TESTS
    // =====================================================
    {
      name: 'integration',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3010',
        storageState: STUDENT_AUTH_FILE,
      },
      testMatch: /.*integration.*\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],

  /*
   * One entry per app.
   *
   * `cwd` + `pnpm run <script>` deliberately bypasses `pnpm dev:marketing`,
   * which expands to `turbo run dev --filter=...`. Turbo put a third process
   * between Playwright and Next, re-framed the child's output through its own
   * writer, and did not forward SIGTERM cleanly (orphaned listeners that then
   * get silently reused locally, because reuseExistingServer is true off CI).
   * Turbo buys nothing here: turbo.json's `dev` task has no dependsOn, and
   * every packages/* is source-only, consumed via transpilePackages.
   *
   * `stdout`/`stderr: 'pipe'` is the important part. Playwright's url probe
   * treats 2xx/3xx/4xx as ready and keeps polling on 5xx, so an app that 500s
   * on every request is indistinguishable from a slow one. Without piping, the
   * only output was `Timed out waiting 120000ms from config.webServer`. That is
   * what hid a missing generated module for three months. With piping, the real
   * Next.js error lands in the CI log within seconds.
   */
  webServer: WEB_SERVER_APPS.filter(
    (app) => ONLY_APPS.length === 0 || ONLY_APPS.includes(app.name),
  ).map((app) => ({
    command: `pnpm run ${PROD_SERVERS.has(app.name) ? 'start' : 'dev'}`,
    cwd: path.resolve(__dirname, app.dir),
    url: `http://localhost:${app.port}`,
    reuseExistingServer: !process.env.CI,
    timeout: PROD_SERVERS.has(app.name) ? 90 * 1000 : 180 * 1000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10_000 },
    ...(app.env ? { env: app.env } : {}),
  })),

  /* Output folder for test artifacts */
  outputDir: 'test-results',
});
