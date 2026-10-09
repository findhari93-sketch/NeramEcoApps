import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import {
  stagingAdminAvailable,
  firebaseUidFor,
  deleteFirebaseUsers,
  stagingSupabase,
} from '../utils/firebase-staging-admin';

/**
 * Demo booking signed in, end to end against STAGING (Firebase neram-staging +
 * the staging database), with the reCAPTCHA bypass for the registered test
 * numbers (NEXT_PUBLIC_E2E_TEST_MODE=true on marketing and app):
 *
 *   PW_APPS=marketing,app NEXT_PUBLIC_E2E_TEST_MODE=true \
 *     pnpm test:e2e tests/e2e/demo-class-auth-marketing.spec.ts --workers=1
 *
 * Google cannot be driven headless (DemoBookingCard.test.tsx covers it). Here:
 * phone-only sign-in on "Who is joining?", the details, the request, the
 * header turning into "My demo", and a return visit seeing the booked demo.
 * The demo row is cancelled and the Firebase account deleted afterwards.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';
const PHONE = '+919999900003';
const MOBILE = { width: 375, height: 812 };

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

test.describe('Demo booking signed in (staging)', () => {
  test.skip(!stagingAdminAvailable(), 'Needs apps/app/.env.local on the staging project with admin credentials.');
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_MODE !== 'true' && !process.env.CI_ALLOW_AUTH_E2E, 'Run with NEXT_PUBLIC_E2E_TEST_MODE=true servers.');
  test.use({ viewport: MOBILE });

  let preexisting: string | null = null;

  /** Free the test number and close any demo it still has open. */
  async function releaseTestIdentity() {
    const db = await stagingSupabase();
    const { data: owners } = await db.from('users').select('id').in('phone', [PHONE, PHONE.slice(-10)]);
    const ids = (owners ?? []).map((u: { id: string }) => u.id);
    if (ids.length) {
      await db
        .from('demo_class_registrations')
        .update({ status: 'cancelled' })
        .in('user_id', ids)
        .in('status', ['pending', 'contacted', 'approved']);
    }
    for (const phone of [PHONE, PHONE.slice(-10)]) {
      await db.from('users').update({ phone: null, phone_verified: false }).eq('phone', phone);
    }
  }

  test.beforeAll(async () => {
    await releaseTestIdentity();
    preexisting = await firebaseUidFor({ phoneNumber: PHONE });
  });

  test.afterAll(async () => {
    await releaseTestIdentity();
    const uid = await firebaseUidFor({ phoneNumber: PHONE });
    if (uid && uid !== preexisting) await deleteFirebaseUsers([uid]);
  });

  async function verifyPhone(page: Page) {
    await page.getByLabel(/phone number/i).fill(PHONE.slice(-10));
    await page.getByRole('button', { name: /send otp/i }).click();
    await expect(page.getByLabel(/^OTP$/i)).toBeVisible({ timeout: 45000 });
    await page.getByLabel(/^OTP$/i).fill(process.env.E2E_TEST_FIXED_OTP || '123456');
    await page.getByRole('button', { name: /verify otp/i }).click();
  }

  test('phone sign-in on step 2, then class and language, then the request', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/demo-class`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      sessionStorage.removeItem('neram_demo_draft');
      localStorage.removeItem('neram_demo_active');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Any time works, just call me/ }).click({ timeout: 45000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Step 2 of 2')).toBeVisible();

    await page.getByRole('button', { name: /Use my phone number/ }).click();
    await verifyPhone(page);
    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeHidden({ timeout: 45000 });

    // Signed in by phone: verified number shown, name typed by hand (no Google name).
    await expect(page.getByText('Verified')).toBeVisible({ timeout: 45000 });
    await expect(page.getByText('+91 99xxx xx003')).toBeVisible();
    await page.getByLabel('Student name').fill('E2E Demo Student');
    await page.getByRole('button', { name: 'Class 12' }).click();
    await page.getByRole('button', { name: 'Tamil' }).click();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /Request my free demo/ }).click();
    await expect(page.getByRole('heading', { name: /Request received/ })).toBeVisible({ timeout: 45000 });

    // The header now points to the booked demo.
    await page.goto(`${MARKETING_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /open menu/i }).click();
    await expect(page.getByRole('link', { name: 'My demo' })).toHaveAttribute('href', /\/demo-class\/my$/);

    // Back on the booking page (same signed-in browser): the booked demo, not the form.
    await page.goto(`${MARKETING_URL}/demo-class`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('You already have a demo booked')).toBeVisible({ timeout: 45000 });
  });
});
