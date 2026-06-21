/**
 * Tools App: Google + Phone-OTP verification (the Google-review lockout scenario)
 *
 * Reproduces the real user flow: sign in (Firebase email/password, since Google
 * popup cannot be automated headless), hit the forced phone-verification modal,
 * complete OTP with a registered Firebase test number, and confirm the College
 * Predictor becomes accessible. Also covers the escape hatch (Get help + Skip).
 *
 * Requirements to run (otherwise the suite skips):
 *  - NEXT_PUBLIC_E2E_TEST_MODE=true on the app server (disables reCAPTCHA via
 *    appVerificationDisabledForTesting). playwright.config.ts sets this for dev:app.
 *  - E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD: a Firebase email/password user in
 *    the project the app points to (staging by default).
 *  - E2E_TEST_PHONE_NUMBER / E2E_TEST_FIXED_OTP: a number registered under Firebase
 *    Auth > Phone > "Phone numbers for testing" (staging: +919999900001 / 123456;
 *    prod: +916380194614 / 880743).
 */

import { test, expect } from '@playwright/test';
import {
  signInAppWithEmail,
  loginWithPhoneOTP,
  resetAppUserPhoneVerification,
} from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';
const TEST_OTP = process.env.E2E_TEST_FIXED_OTP || '123456';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

const PREDICTOR = '/tools/counseling/college-predictor';
const last10 = (n: string) => n.replace(/\D/g, '').slice(-10);

test.describe('Tools App phone-OTP verification', () => {
  // Always start unauthenticated, overriding the project's saved storageState.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !APP_EMAIL || !APP_PASSWORD || !E2E_MODE,
    'Set E2E_TEST_APP_EMAIL, E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true to run.',
  );

  test.beforeEach(async () => {
    // Best-effort: make the run repeatable. No-op if Supabase admin env is absent.
    await resetAppUserPhoneVerification(APP_EMAIL);
  });

  test('AC1: signed-in user verifies phone and reaches College Predictor', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);

    // The forced phone modal must appear for an unverified user.
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    // Exactly one reCAPTCHA host container, mounted via a portal (no duplicate-id bug).
    await expect(page.locator('#recaptcha-container-login-modal')).toHaveCount(1);

    await loginWithPhoneOTP(page, TEST_PHONE, { otp: TEST_OTP });

    // Access granted: predictor loads and the modal is gone.
    await page.goto(PREDICTOR);
    await expect(page.getByText('Verify Your Phone')).toBeHidden();
    await expect(page.getByText('College Predictor').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /predict/i }).first()).toBeVisible();

    // reCAPTCHA / Firebase auth scripts loading cleanly is part of the fix.
    const recaptchaErrors = consoleErrors.filter((e) => /recaptcha|firebase|auth\//i.test(e));
    expect(recaptchaErrors, `Auth-related console errors:\n${recaptchaErrors.join('\n')}`).toHaveLength(0);
  });

  test('AC2: repeated OTP failures reveal Get help + Skip, and Skip grants access', async ({ page }) => {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    // Send a real OTP, then fail verification twice to trip the escape hatch
    // (failedAttempts >= maxAttemptsBeforeEscape = 2).
    await page.getByLabel(/Phone Number/i).fill(last10(TEST_PHONE));
    await page.getByRole('button', { name: /send otp/i }).click();
    await expect(page.getByLabel(/^OTP$/i)).toBeVisible({ timeout: 15000 });

    for (let i = 0; i < 2; i++) {
      await page.getByLabel(/^OTP$/i).fill('000000'); // wrong code
      await page.getByRole('button', { name: /verify otp/i }).click();
      await expect(page.getByText(/invalid otp|verification/i).first()).toBeVisible({ timeout: 15000 });
    }

    await expect(page.getByRole('button', { name: /having trouble\? get help/i })).toBeVisible({ timeout: 10000 });
    const skip = page.getByRole('button', { name: /skip for now/i });
    await expect(skip).toBeVisible();
    await skip.click();

    // Modal closes, skip flag set, predictor accessible.
    await expect(page.getByText('Verify Your Phone')).toBeHidden();
    const skipped = await page.evaluate(() => sessionStorage.getItem('phone_verification_skipped'));
    expect(skipped).toBe('1');

    await page.goto(PREDICTOR);
    await expect(page.getByText('College Predictor').first()).toBeVisible({ timeout: 20000 });
  });

  test('AC3: get-help panel exposes a WhatsApp contact', async ({ page }) => {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    // Trip the escape hatch via two failed sends/verifies.
    await page.getByLabel(/Phone Number/i).fill(last10(TEST_PHONE));
    await page.getByRole('button', { name: /send otp/i }).click();
    await expect(page.getByLabel(/^OTP$/i)).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 2; i++) {
      await page.getByLabel(/^OTP$/i).fill('000000');
      await page.getByRole('button', { name: /verify otp/i }).click();
      await expect(page.getByText(/invalid otp|verification/i).first()).toBeVisible({ timeout: 15000 });
    }

    await page.getByRole('button', { name: /having trouble\? get help/i }).click();
    const whatsapp = page.getByRole('link', { name: /whatsapp/i });
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp).toHaveAttribute('href', /wa\.me\/\+?\d{10,}/);
  });

  test('layout: phone modal has no horizontal overflow and tappable buttons', async ({ page }) => {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '.MuiDialog-root .MuiButton-contained', 44);
  });
});
