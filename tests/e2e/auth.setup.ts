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
  await page.goto('http://localhost:3000/login');

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
 * Microsoft OAuth is complex to automate - consider using a test endpoint.
 */
setup('authenticate as teacher', async ({ page }) => {
  const testEmail = process.env.E2E_TEST_TEACHER_EMAIL;
  const testPassword = process.env.E2E_TEST_TEACHER_PASSWORD;

  if (!testEmail || !testPassword) {
    console.log('⚠️  No teacher test credentials found. Skipping teacher auth setup.');
    return;
  }

  console.log(`🔐 Authenticating as teacher: ${testEmail}`);

  // Go to nexus login
  await page.goto('http://localhost:3002/login');

  // Microsoft OAuth flow is complex to automate
  // Option 1: Use a test endpoint that generates tokens
  // Option 2: Use Microsoft test tenant with known credentials
  // Option 3: Mock authentication for E2E tests

  // For now, check if there's a test login endpoint
  const testLoginResponse = await page.request.post('http://localhost:3002/api/auth/test-login', {
    data: { email: testEmail, password: testPassword },
  }).catch(() => null);

  if (testLoginResponse?.ok()) {
    // Test endpoint worked
    await page.goto('http://localhost:3002/dashboard');
    await page.waitForLoadState('networkidle');
    console.log('✅ Teacher authentication successful via test endpoint');
  } else {
    console.log('⚠️  Teacher authentication requires manual setup or test endpoint.');
    console.log('   Consider implementing /api/auth/test-login for E2E tests.');
  }

  // Save authentication state
  await page.context().storageState({ path: TEACHER_STORAGE_STATE_PATH });
  console.log(`💾 Saved teacher auth state to ${TEACHER_STORAGE_STATE_PATH}`);
});
