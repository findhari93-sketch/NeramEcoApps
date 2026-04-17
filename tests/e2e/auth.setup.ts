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
  const testEmail = process.env.E2E_TEST_STUDENT_EMAIL;
  const testPassword = process.env.E2E_TEST_STUDENT_PASSWORD;

  if (!testEmail || !testPassword) {
    console.log('⚠️  No test credentials found. Skipping authentication setup.');
    console.log('   Set E2E_TEST_STUDENT_EMAIL and E2E_TEST_STUDENT_PASSWORD in .env.local');
    console.log('   Tests requiring auth will be skipped.');
    return;
  }

  console.log(`🔐 Authenticating as student: ${testEmail}`);

  // Go to the student app login page
  await page.goto('http://localhost:3011/login');

  // Wait for Firebase to load
  await page.waitForLoadState('networkidle');

  // Check if there's an email/password login form (for testing)
  // You may need to enable Email/Password auth in Firebase Console for staging
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const passwordInput = page.locator('input[type="password"], input[name="password"]');

  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Email/Password login available
    await emailInput.fill(testEmail);
    await passwordInput.fill(testPassword);

    // Click login button
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');

    // Wait for redirect to dashboard or home
    await page.waitForURL(/\/(dashboard|home|$)/, { timeout: 30000 });

    console.log('✅ Student authentication successful');
  } else {
    // If no email/password form, try to authenticate via API
    // This requires a test endpoint or Firebase custom token
    console.log('⚠️  No email/password login form found.');
    console.log('   Consider enabling Email/Password auth in Firebase Console for testing.');
    console.log('   Or implement a /api/auth/test-login endpoint for E2E tests.');
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
    const { user, nexusRole, classrooms, testToken, onboardingStatus, profileComplete } = authData;

    console.log(`✅ Teacher auth successful: ${user.name} (${nexusRole})`);
    console.log(`   Classrooms: ${classrooms.length}`);

    // Navigate to Nexus and inject auth state into localStorage
    await page.goto('http://localhost:3012/login');
    await page.waitForLoadState('domcontentloaded');

    // Inject MSAL-like state and Nexus auth data into localStorage
    await page.evaluate(({ user, nexusRole, classrooms, testToken, onboardingStatus, profileComplete }) => {
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

      // Store onboarding/profile status so RoleGuard doesn't redirect
      if (onboardingStatus) {
        localStorage.setItem('nexus_auth_onboarding_status', onboardingStatus);
      }
      if (profileComplete !== undefined) {
        localStorage.setItem('nexus_auth_profile_complete', String(profileComplete));
      }
    }, { user, nexusRole, classrooms, testToken, onboardingStatus, profileComplete });

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
