/**
 * Playwright Authentication Setup
 *
 * This file runs ONCE before all tests to:
 * 1. Login with test credentials
 * 2. Save authentication state (cookies, localStorage, IndexedDB)
 * 3. Tests reuse this state - no repeated logins!
 *
 * Test accounts should exist in your STAGING Firebase/Supabase projects.
 *
 * THIS FILE FAILS LOUDLY ON PURPOSE.
 * It used to catch every error and only console.log it, then save whatever state
 * the context happened to hold. A broken sign-in therefore produced a green
 * `setup` project and an empty tests/.auth/user.json, and every downstream spec
 * ran unauthenticated and skipped itself. The suite reported success while
 * testing nothing. If authentication is configured but does not work, that is a
 * real failure and this file now throws.
 */

import { test as setup } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'path';
import { APP_URLS } from '../utils/credentials';

// Path where authentication state is saved
export const STORAGE_STATE_PATH = path.join(__dirname, '../.auth/user.json');
export const TEACHER_STORAGE_STATE_PATH = path.join(__dirname, '../.auth/teacher.json');

/**
 * Best-effort description of whoever is listening on a port.
 *
 * `reuseExistingServer: !process.env.CI` means that off CI Playwright adopts any
 * server already holding the port, including one it never started and knows
 * nothing about: a leftover `next start` from a release check, a server wired to
 * a different Supabase project, or another agent's dev server. Naming the process
 * turns "why is this route missing" into "oh, that is a production build".
 */
function describePortOwner(url: string): string {
  const port = new URL(url).port;
  if (!port) return '';
  try {
    if (process.platform === 'win32') {
      const rows = execSync('netstat -ano -p tcp', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const listening = rows
        .split(/\r?\n/)
        .find((l) => new RegExp(`:${port}\\s`).test(l) && l.includes('LISTENING'));
      const pid = listening?.trim().split(/\s+/).pop();
      if (!pid) return '';
      const cmd = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      return `  Port ${port} is held by PID ${pid}: ${cmd.replace(/\s+/g, ' ')}\n`;
    }
    const pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
    if (!pid) return '';
    const cmd = execSync(`ps -o command= -p ${pid}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return `  Port ${port} is held by PID ${pid}: ${cmd}\n`;
  } catch {
    return '';
  }
}

type SavedOrigin = {
  origin: string;
  localStorage?: Array<{ name: string; value: string }>;
  indexedDB?: Array<{ name: string }>;
};
type SavedState = { cookies?: unknown[]; origins?: SavedOrigin[] };

/**
 * A storage state file that parses but carries no credentials is the failure
 * mode this whole file exists to prevent, so check the artifact, not the flow.
 */
function assertStateCarriesAuth(statePath: string, label: string, hint: string): void {
  const state = JSON.parse(readFileSync(statePath, 'utf-8')) as SavedState;
  const origins = state.origins ?? [];
  const carriesAuth =
    (state.cookies?.length ?? 0) > 0 ||
    origins.some((o) => (o.localStorage?.length ?? 0) > 0 || (o.indexedDB?.length ?? 0) > 0);

  if (!carriesAuth) {
    throw new Error(
      `${label} sign-in reported no error but saved an empty storage state.\n` +
        `  ${statePath} is {"cookies":[],"origins":[]}, so every spec that loads it\n` +
        `  would run unauthenticated and silently skip.\n` +
        `  ${hint}`
    );
  }
}

/**
 * Setup: Authenticate as Student (Firebase)
 *
 * This runs once before all student app tests.
 * The session is saved and reused by all tests.
 */
setup('authenticate as student', async ({ page }) => {
  // Prefer a Firebase email/password user for the Tools App (Google popup can't be
  // automated). Falls back to the legacy student vars if app-specific ones are unset.
  const testEmail = process.env.E2E_TEST_APP_EMAIL || process.env.E2E_TEST_STUDENT_EMAIL;
  const testPassword = process.env.E2E_TEST_APP_PASSWORD || process.env.E2E_TEST_STUDENT_PASSWORD;

  // Only genuinely-absent credentials are tolerated: nothing was configured, so
  // nothing can be asserted. Anything past this point is a real failure.
  if (!testEmail || !testPassword) {
    console.log('⚠️  No app Firebase test credentials (E2E_TEST_APP_EMAIL/PASSWORD).');
    console.log('   Saving empty student state; phone-auth specs self-authenticate and override it.');
    await page.context().storageState({ path: STORAGE_STATE_PATH });
    return;
  }

  console.log(`🔐 Authenticating as student (Firebase email/password): ${testEmail}`);

  // Go to the student app login page. APP_URLS honours E2E_APP_URL, so a suite
  // can be pointed at a server wired to a different project; hardcoding the port
  // here would have silently ignored that override.
  //
  // This is not one page load. The app bounces through marketing's SSO check:
  //   3011/login -> 3010/sso?redirect=... -> 3011/login?sso=none
  // so reaching the form cold-compiles three routes across two dev servers.
  // `domcontentloaded` avoids also waiting on every subresource of a page we are
  // about to navigate away from; the locator below waits out the redirects.
  await page.goto(`${APP_URLS.student}/login`, { waitUntil: 'domcontentloaded' });

  try {
    // Target the inputs by type, not by label. These are MUI TextFields marked
    // `required`, so MUI appends an asterisk span inside the <label>, making its
    // text content "Email *". getByLabel('Email', { exact: true }) therefore never
    // matches and times out. There is exactly one of each input on this page.
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);
    await page.getByRole('button', { name: /sign in with email/i }).click();

    // Authenticated once we either land on the dashboard or hit the phone-verify
    // modal (a fresh user is signed in but phone-unverified).
    await Promise.race([
      page.waitForURL(/\/(dashboard|home)\b/, { timeout: 30000 }),
      page.getByText('Verify Your Phone').waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    console.log('✅ Student authentication successful');
  } catch (err) {
    // The timeout alone says nothing. Firebase renders the real reason into an
    // inline alert, so lift it into the thrown message: "auth/operation-not-allowed"
    // is a five-second fix, "Timeout 30000ms exceeded" is an afternoon.
    const inlineError = await page
      .getByRole('alert')
      .filter({ hasText: /\S/ })
      .first()
      .innerText()
      .catch(() => '');

    throw new Error(
      `Student email/password sign-in failed for ${testEmail}.\n` +
        (inlineError ? `  The login page reported: ${inlineError.trim()}\n` : '') +
        `  ${(err as Error).message}\n` +
        `  Common causes:\n` +
        `    auth/operation-not-allowed  Email/Password is disabled as a sign-in provider.\n` +
        `                                Firebase console > Authentication > Sign-in method\n` +
        `                                for NEXT_PUBLIC_FIREBASE_PROJECT_ID. Only Phone is\n` +
        `                                enabled on neram-staging by default.\n` +
        `    auth/invalid-credential     Wrong E2E_TEST_APP_PASSWORD, or the user lives in a\n` +
        `                                different project. E2E_TEST_APP_EMAIL was created in\n` +
        `                                neram-staging, so the app must point at staging.\n` +
        `    auth/user-not-found         The account does not exist in that project.`
    );
  }

  // Firebase Auth v9+ persists the session in IndexedDB (firebaseLocalStorageDb),
  // not localStorage or cookies. Without `indexedDB: true` this writes
  // {"cookies":[],"origins":[]} even after a completely successful sign-in, which
  // is why tests/.auth/user.json has been empty. Requires Playwright >= 1.51.
  await page.context().storageState({ path: STORAGE_STATE_PATH, indexedDB: true });
  assertStateCarriesAuth(
    STORAGE_STATE_PATH,
    'Student',
    'Firebase keeps its session in IndexedDB, so this save needs `indexedDB: true`\n' +
      '  and Playwright >= 1.51. Check the installed version if that flag is present.'
  );
  console.log(`💾 Saved auth state to ${STORAGE_STATE_PATH}`);
});

/**
 * Setup: Authenticate as Teacher (Microsoft)
 *
 * This runs once before all teacher/nexus tests.
 * Uses the /api/auth/test-login endpoint on Nexus (port 3012) to bypass
 * Microsoft OAuth and generate a test token for E2E testing.
 */
setup('authenticate as teacher', async ({ page }) => {
  const testEmail = process.env.E2E_TEST_TEACHER_EMAIL || 'e2e-teacher@neramclasses.com';

  console.log(`🔐 Authenticating as teacher: ${testEmail}`);

  // Nexus is started by config.webServer and its readiness was already probed, so
  // an unreachable or rejecting endpoint here is a real fault, not a setup race.
  const testLoginResponse = await page.request
    .post(`${APP_URLS.nexus}/api/auth/test-login`, {
      data: { email: testEmail, role: 'teacher' },
    })
    .catch((err: Error) => {
      throw new Error(
        `Could not reach the Nexus test-login endpoint at ${APP_URLS.nexus}: ${err.message}\n` +
          `  Playwright starts Nexus itself, so this means it started and then died.\n` +
          `  Look for [WebServer] lines above for the real Next.js error.`
      );
    });

  if (!testLoginResponse.ok()) {
    const body = await testLoginResponse.text().catch(() => '<unreadable body>');
    const is404 = testLoginResponse.status() === 404;
    // Two very different faults both answer 404, so read the body before naming
    // one. The route's own production guard replies with JSON ({"error":"Not
    // found"}); a Next.js error page is HTML. Calling a broken dev server a
    // production build sends you hunting for the wrong thing.
    const isProdGate = is404 && body.trimStart().startsWith('{') && body.includes('Not found');
    throw new Error(
      `Nexus test-login rejected ${testEmail} with HTTP ${testLoginResponse.status()}.\n` +
        `  ${body.slice(0, 300)}\n` +
        (isProdGate
          ? `  That is this route's own production guard: it answers 404 by design when\n` +
            `  NODE_ENV === 'production', so this server is a production build\n` +
            `  (\`next start\`), not \`next dev\`. Playwright reuses whatever already holds\n` +
            `  the port off CI, so it is usually a leftover server it did not start.\n` +
            describePortOwner(APP_URLS.nexus) +
            `  Stop that process and re-run, or point the suite elsewhere with\n` +
            `  E2E_NEXUS_URL=http://localhost:<port>.\n`
          : is404
            ? `  The 404 came from Next.js, not from the route, so the route did not\n` +
              `  build. "missing required error components" means a stale .next: a dev\n` +
              `  server that was running while its dependencies changed serves this\n` +
              `  until it is restarted.\n` +
              describePortOwner(APP_URLS.nexus) +
              `  Restart that server and re-run.\n`
            : `  Check that E2E_TEST_TEACHER_EMAIL exists in the Supabase project the\n` +
              `  server is pointed at.\n`)
    );
  }

  const authData = await testLoginResponse.json();
  const { user, nexusRole, classrooms, testToken } = authData;

  console.log(`✅ Teacher auth successful: ${user.name} (${nexusRole})`);
  console.log(`   Classrooms: ${classrooms.length}`);

  // Navigate to Nexus and inject auth state into localStorage.
  //
  // `domcontentloaded`, not the default `load`: this navigation exists only to
  // give localStorage an origin to write to, and the line below already declares
  // domcontentloaded as the bar. Waiting for `load` additionally waits on every
  // subresource, which on a cold dev server blew the whole 120s test budget.
  await page.goto(`${APP_URLS.nexus}/login`, { waitUntil: 'domcontentloaded' });

  // Inject MSAL-like state and Nexus auth data into localStorage
  await page.evaluate(({ user, nexusRole, classrooms, testToken }) => {
    // Store the test token for API calls
    localStorage.setItem('nexus_test_token', testToken);

    // Store active classroom
    if (classrooms.length > 0) {
      localStorage.setItem('nexus_active_classroom_id', classrooms[0].id);
    }

    // Store auth data that useNexusAuth reads
    localStorage.setItem('nexus_auth_user', JSON.stringify(user));
    localStorage.setItem('nexus_auth_role', nexusRole);
    localStorage.setItem('nexus_auth_classrooms', JSON.stringify(classrooms));
  }, { user, nexusRole, classrooms, testToken });

  // Set the Authorization header for all API requests in this context
  await page.context().setExtraHTTPHeaders({
    'Authorization': `Bearer ${testToken}`,
  });

  console.log('✅ Teacher auth state injected into browser context');

  // Save authentication state
  await page.context().storageState({ path: TEACHER_STORAGE_STATE_PATH });
  assertStateCarriesAuth(
    TEACHER_STORAGE_STATE_PATH,
    'Teacher',
    `The test-login call succeeded, so the localStorage injection on\n` +
      `  ${APP_URLS.nexus}/login did not stick. Check that the page loaded.`
  );
  console.log(`💾 Saved teacher auth state to ${TEACHER_STORAGE_STATE_PATH}`);
});
