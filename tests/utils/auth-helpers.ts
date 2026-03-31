/**
 * E2E Authentication Helpers (Playwright)
 *
 * Provides role-based login helpers for all 4 user roles across the Neram ecosystem.
 * Uses the test-login API endpoint as the primary auth path (fast, no OAuth).
 * Falls back to browser-based OAuth when the API is unavailable.
 *
 * For Vitest unit-test auth mocks, see ./auth.ts instead.
 */

import { Page } from '@playwright/test';
import {
  TEST_USERS,
  TestRole,
  APP_URLS,
  getTestAuthToken,
  injectAuthForPage,
} from './credentials';

/**
 * Login as a specific role via the fastest available method.
 *
 * For admin/teacher/student: uses the Nexus test-login API to inject auth state.
 * For parent: uses student-level auth with read-only context.
 *
 * Falls back to browser-based Microsoft OAuth if the API is unavailable.
 */
export async function loginAsRole(
  page: Page,
  role: TestRole,
  options: { fresh?: boolean } = {}
): Promise<void> {
  const user = TEST_USERS[role];

  // Map roles to the auth system's role types
  const authRole: 'student' | 'teacher' =
    role === 'student' || role === 'parent' ? 'student' : 'teacher';

  // Try API-based auth injection first (fast path)
  if (!options.fresh) {
    const success = await injectAuthForPage(page, authRole);
    if (success) return;
  }

  // Fallback: browser-based Microsoft OAuth
  await page.goto(`${APP_URLS.nexus}/login`);
  await page.getByRole('button', { name: /sign in with microsoft/i }).click();

  // Entra ID login page
  await page.waitForURL(/login\.microsoftonline\.com/);
  await page.getByPlaceholder(/email/i).fill(user.email);
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByPlaceholder(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // "Stay signed in?" prompt
  const staySignedIn = page.getByRole('button', { name: /yes/i });
  if (await staySignedIn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await staySignedIn.click();
  }

  // Wait for redirect back to app
  await page.waitForURL(/nexus\.neramclasses\.com|admin\.neramclasses\.com|localhost/);
}

/**
 * Login via Phone OTP (for Tools App / Parent flow).
 * Uses Firebase phone auth with test phone numbers.
 */
export async function loginWithPhoneOTP(
  page: Page,
  phoneNumber: string,
): Promise<void> {
  await page.goto(`${APP_URLS.student}/login`);
  await page.getByPlaceholder(/phone/i).fill(phoneNumber);
  await page.getByRole('button', { name: /send otp/i }).click();

  const testOTP = process.env.E2E_TEST_FIXED_OTP || '123456';
  await page.getByPlaceholder(/enter otp/i).fill(testOTP);
  await page.getByRole('button', { name: /verify/i }).click();
  await page.waitForURL(/app\.neramclasses\.com|localhost/);
}

/**
 * Login via Google Sign-In (for Tools App).
 */
export async function loginWithGoogle(page: Page): Promise<void> {
  await page.goto(`${APP_URLS.student}/login`);
  await page.getByRole('button', { name: /sign in with google/i }).click();

  await page.waitForURL(/accounts\.google\.com/);
  await page.getByPlaceholder(/email/i).fill(process.env.E2E_TEST_GOOGLE_EMAIL || '');
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByPlaceholder(/password/i).fill(process.env.E2E_TEST_GOOGLE_PASSWORD || '');
  await page.getByRole('button', { name: /next/i }).click();
  await page.waitForURL(/app\.neramclasses\.com|localhost/);
}

/**
 * Assert that a role CANNOT access a given route.
 * Use this to verify role-based access control (RBAC).
 *
 * @example
 * await assertAccessDenied(page, 'student', '/admin/users');
 * await assertAccessDenied(page, 'parent', '/teacher/grades');
 */
export async function assertAccessDenied(
  page: Page,
  role: TestRole,
  route: string,
): Promise<void> {
  await loginAsRole(page, role);
  await page.goto(route);

  const currentURL = page.url();
  const pageContent = await page.textContent('body');
  const isDenied =
    currentURL.includes('/unauthorized') ||
    currentURL.includes('/login') ||
    pageContent?.includes('Access Denied') ||
    pageContent?.includes('403') ||
    pageContent?.includes('not authorized');

  if (!isDenied) {
    throw new Error(
      `RBAC FAILURE: Role "${role}" accessed ${route} — should be denied. URL: ${currentURL}`
    );
  }
}
