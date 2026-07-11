/**
 * Playwright Authentication Setup
 *
 * This file runs ONCE before all tests to:
 * 1. Login with test credentials
 * 2. Save authentication state (cookies, localStorage)
 * 3. Tests reuse this state - no repeated logins!
 *
 * Test accounts should exist in your STAGING Firebase/Supabase projects.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';

// Path where authentication state is saved
export const STORAGE_STATE_PATH = path.join(__dirname, '../.auth/user.json');
export const TEACHER_STORAGE_STATE_PATH = path.join(__dirname, '../.auth/teacher.json');

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

  if (!testEmail || !testPassword) {
    console.log('⚠️  No app Firebase test credentials (E2E_TEST_APP_EMAIL/PASSWORD).');
    console.log('   Saving empty student state; phone-auth specs self-authenticate and override it.');
    await page.context().storageState({ path: STORAGE_STATE_PATH });
    return;
  }

  console.log(`🔐 Authenticating as student (Firebase email/password): ${testEmail}`);

  // Go to the student app login page
  await page.goto('http://localhost:3011/login');
  await page.waitForLoadState('domcontentloaded');

  try {
    await page.getByLabel('Email', { exact: true }).fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: /sign in with email/i }).click();

    // Authenticated once we either land on the dashboard or hit the phone-verify
    // modal (a fresh user is signed in but phone-unverified).
    await Promise.race([
      page.waitForURL(/\/(dashboard|home)\b/, { timeout: 30000 }),
      page.getByText('Verify Your Phone').waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    console.log('✅ Student authentication successful');
  } catch (err) {
    console.log('⚠️  Student email/password sign-in did not complete:', (err as Error).message);
    console.log('   Ensure the Firebase email/password user exists in the staging project.');
  }

  // Save authentication state
  await page.context().storageState({ path: STORAGE_STATE_PATH });
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

  // Use Nexus test-login endpoint to get a test token
  const testLoginResponse = await page.request.post('http://localhost:3012/api/auth/test-login', {
    data: { email: testEmail, role: 'teacher' },
  }).catch((err: Error) => {
    console.error('❌ Failed to reach Nexus test-login endpoint:', err.message);
    return null;
  });

  if (testLoginResponse?.ok()) {
    const authData = await testLoginResponse.json();
    const { user, nexusRole, classrooms, testToken } = authData;

    console.log(`✅ Teacher auth successful: ${user.name} (${nexusRole})`);
    console.log(`   Classrooms: ${classrooms.length}`);

    // Navigate to Nexus and inject auth state into localStorage
    await page.goto('http://localhost:3012/login');
    await page.waitForLoadState('domcontentloaded');

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
  } else {
    const status = testLoginResponse ? testLoginResponse.status() : 'no response';
    console.log(`⚠️  Teacher test-login failed (status: ${status}).`);
    console.log('   Make sure Nexus is running on port 3012: pnpm dev:nexus');
  }

  // Save authentication state
  await page.context().storageState({ path: TEACHER_STORAGE_STATE_PATH });
  console.log(`💾 Saved teacher auth state to ${TEACHER_STORAGE_STATE_PATH}`);
});
