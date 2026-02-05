import { defineConfig, devices } from '@playwright/test';
import path from 'path';

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

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:3001',

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
    },

    // =====================================================
    // MARKETING SITE (No Auth Required)
    // =====================================================
    {
      name: 'marketing-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
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
        baseURL: 'http://localhost:3000',
        // Reuse saved authentication state
        storageState: STUDENT_AUTH_FILE,
      },
      testMatch: /.*app.*\.spec\.ts/,
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
        baseURL: 'http://localhost:3000',
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
        baseURL: 'http://localhost:3002',
        // Reuse saved teacher authentication state
        storageState: TEACHER_AUTH_FILE,
      },
      testMatch: /.*nexus.*\.spec\.ts/,
      dependencies: ['setup'],
    },

    // =====================================================
    // ADMIN TESTS (Microsoft Auth Required)
    // =====================================================
    {
      name: 'admin-chrome',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3003',
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
        baseURL: 'http://localhost:3001',
        storageState: STUDENT_AUTH_FILE,
      },
      testMatch: /.*integration.*\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'pnpm dev:marketing',
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000, // 2 minutes for Next.js to start
    },
    {
      command: 'pnpm dev:app',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    // Uncomment these when you have tests for nexus/admin
    // {
    //   command: 'pnpm dev:nexus',
    //   url: 'http://localhost:3002',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 120 * 1000,
    // },
    // {
    //   command: 'pnpm dev:admin',
    //   url: 'http://localhost:3003',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 120 * 1000,
    // },
  ],

  /* Output folder for test artifacts */
  outputDir: 'test-results',
});
