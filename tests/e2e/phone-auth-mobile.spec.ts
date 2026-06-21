/**
 * Tools App (mobile): Phone-OTP verification on a small viewport.
 *
 * Mobile is where the reCAPTCHA lockout bit hardest: the modal is fullScreen and
 * the visible reCAPTCHA challenge (appended to document.body) was un-clickable due
 * to the Dialog focus-trap. This spec verifies the fullScreen modal behaves: no
 * horizontal overflow, a single reCAPTCHA host container that is not display:none,
 * tappable buttons, and a working end-to-end verification.
 *
 * Runs under the mobile-chrome project (Pixel 5). Same requirements as
 * phone-auth-app.spec.ts (see its header).
 */

import { test, expect } from '@playwright/test';
import { signInAppWithEmail, loginWithPhoneOTP, resetAppUserPhoneVerification } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';
const TEST_OTP = process.env.E2E_TEST_FIXED_OTP || '123456';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

const PREDICTOR = '/tools/counseling/college-predictor';

test.describe('Tools App phone-OTP verification (mobile)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    !APP_EMAIL || !APP_PASSWORD || !E2E_MODE,
    'Set E2E_TEST_APP_EMAIL, E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true to run.',
  );

  test.beforeEach(async () => {
    await resetAppUserPhoneVerification(APP_EMAIL);
  });

  test('mobile: fullScreen modal renders cleanly with a usable reCAPTCHA container', async ({ page }) => {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    await assertNoHorizontalOverflow(page);

    // Exactly one container, and it must be in the layout (not display:none), so a
    // visible challenge can render and be interacted with.
    const container = page.locator('#recaptcha-container-login-modal');
    await expect(container).toHaveCount(1);
    const display = await container.evaluate((el) => getComputedStyle(el).display);
    expect(display).not.toBe('none');

    await assertTouchTargetSize(page, '.MuiDialog-root .MuiButton-contained', 44);
  });

  test('mobile: completes verification and reaches College Predictor', async ({ page }) => {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await expect(page.getByText('Verify Your Phone')).toBeVisible({ timeout: 20000 });

    await loginWithPhoneOTP(page, TEST_PHONE, { otp: TEST_OTP });

    await page.goto(PREDICTOR);
    await expect(page.getByText('Verify Your Phone')).toBeHidden();
    await expect(page.getByText('College Predictor').first()).toBeVisible({ timeout: 20000 });
    await assertNoHorizontalOverflow(page);
  });
});
