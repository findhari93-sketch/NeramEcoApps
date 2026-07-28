/**
 * E2E Authentication Helpers (Playwright)
 *
 * Provides role-based login helpers for all 4 user roles across the Neram ecosystem.
 * Uses the test-login API endpoint as the primary auth path (fast, no OAuth).
 * Falls back to browser-based OAuth when the API is unavailable.
 *
 * For Vitest unit-test auth mocks, see ./auth.ts instead.
 */

import { Page, expect } from '@playwright/test';
import {
  TEST_USERS,
  TestRole,
  APP_URLS,
  getTestAuthToken,
  injectAuthForPage,
  injectParentAuthForPage,
} from './credentials';

/**
 * Login as a specific role via the fastest available method.
 *
 * For admin/teacher/student: uses the Nexus test-login API to inject auth state.
 * For parent: provisions a real parent credential and injects a real `par_`
 * session (parents have no Microsoft account, so there is no OAuth fallback).
 *
 * Falls back to browser-based Microsoft OAuth if the API is unavailable.
 */
export async function loginAsRole(
  page: Page,
  role: TestRole,
  options: { fresh?: boolean } = {}
): Promise<void> {
  const user = TEST_USERS[role];

  // Parents branch FIRST and never fall through.
  //
  // This used to map 'parent' onto 'student' below, which meant every parent
  // test silently ran as a student: RoleGuard allowedRoles={['parent']} could
  // never have passed, and assertAccessDenied(page, 'parent', ...) was really
  // asserting about a student. Those tests passed for the wrong reason.
  //
  // There is no OAuth fallback here on purpose: a parent has no Microsoft
  // account, so failing loudly is correct. A silent downgrade is what caused
  // the original defect.
  if (role === 'parent') {
    const ok = await injectParentAuthForPage(page);
    if (!ok) {
      throw new Error(
        'Parent auth injection failed. /api/auth/parent/test-login is non-production only, ' +
          'and it needs the E2E student account to exist and be enrolled.'
      );
    }
    return;
  }

  // Map roles to the auth system's role types
  const authRole: 'student' | 'teacher' = role === 'student' ? 'student' : 'teacher';

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
 * Drive the real phone-OTP modal in the Tools App (the shared LoginModal). Assumes
 * the modal is already open (e.g. the forced phone step after Google/email sign-in).
 *
 * Requires NEXT_PUBLIC_E2E_TEST_MODE=true on the app server (disables reCAPTCHA via
 * appVerificationDisabledForTesting) and a phone number registered under Firebase
 * Auth > Phone > "Phone numbers for testing" for the project the app points to.
 */
export async function loginWithPhoneOTP(
  page: Page,
  phoneNumber: string,
  options: { otp?: string } = {},
): Promise<void> {
  const otp = options.otp || process.env.E2E_TEST_FIXED_OTP || '123456';
  const last10 = phoneNumber.replace(/\D/g, '').slice(-10);

  await page.getByLabel(/Phone Number/i).fill(last10);
  await page.getByRole('button', { name: /send otp/i }).click();

  await page.getByLabel(/^OTP$/i).fill(otp);
  await page.getByRole('button', { name: /verify otp/i }).click();

  // Modal closes once the phone is verified and the DB write confirms.
  await expect(page.getByText('Verify Your Phone')).toBeHidden({ timeout: 15000 });
}

/**
 * Sign in to the Tools App with Firebase email/password (popup-free, so it works
 * headless, unlike Google sign-in). Lands the user on the dashboard, still
 * phone-unverified, which triggers the forced phone-verification modal.
 *
 * Requires a Firebase email/password user in the project the app points to,
 * provided via E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD.
 */
export async function signInAppWithEmail(
  page: Page,
  email = process.env.E2E_TEST_APP_EMAIL || '',
  password = process.env.E2E_TEST_APP_PASSWORD || '',
): Promise<void> {
  await page.goto(`${APP_URLS.student}/login`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in with email/i }).click();
}

/**
 * Best-effort reset of a Tools App user's phone verification so the phone-OTP
 * flow can be re-exercised on every run. No-op (returns false) if Supabase admin
 * env is absent, in which case the calling test should tolerate an already-verified
 * user. Matches email case-insensitively (MS/Google casing can differ from the DB).
 */
export async function resetAppUserPhoneVerification(email: string): Promise<boolean> {
  const url = process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !email) return false;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, key);
    const { error } = await admin
      .from('users')
      .update({ phone_verified: false })
      .ilike('email', email);
    return !error;
  } catch {
    return false;
  }
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
