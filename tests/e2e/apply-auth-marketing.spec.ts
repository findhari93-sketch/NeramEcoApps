import { test, expect, type Page } from '@playwright/test';
import {
  stagingAdminAvailable,
  markEmailVerified,
  firebaseUidFor,
  deleteFirebaseUsers,
  stagingSupabase,
} from '../utils/firebase-staging-admin';

/**
 * Sign-in and onboarding on /apply, end to end against STAGING (Firebase
 * neram-staging + the staging database), with the reCAPTCHA bypass for the
 * registered test numbers (NEXT_PUBLIC_E2E_TEST_MODE=true on marketing and app).
 *
 * Google itself cannot be driven headless; the Google card is covered by
 * ApplyFlow.test.tsx. Here: phone first, email sign-up with the verification
 * link, a number that belongs to another account, and a verified account
 * signing in again. Every account made here is deleted afterwards.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';
const PHONE_A = '+919999900002';
const PHONE_B = '+919999900003';
const RUN = Date.now();
const EMAIL_B = `e2e-apply-b-${RUN}@example.com`;
const EMAIL_C = `e2e-apply-c-${RUN}@example.com`;
const PASSWORD = 'E2e-apply-pass1';

test.describe.configure({ mode: 'serial' });
// Dev servers on staging: OTP sends and first-time route compiles can take a while.
test.setTimeout(180000);

test.describe('Apply sign-in and onboarding (staging)', () => {
  test.skip(!stagingAdminAvailable(), 'Needs apps/app/.env.local on the staging project with admin credentials.');
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_MODE !== 'true' && !process.env.CI_ALLOW_AUTH_E2E, 'Run with NEXT_PUBLIC_E2E_TEST_MODE=true servers.');

  const createdUids = new Set<string>();
  const preexisting = new Set<string>();

  /**
   * Earlier runs leave staging rows holding the test numbers and addresses.
   * Release them (never delete: other tables point at users) so each run
   * starts clean and a stale verified number does not answer 409.
   */
  async function releaseTestIdentities() {
    const db = await stagingSupabase();
    for (const phone of [PHONE_A, PHONE_B, PHONE_A.slice(-10), PHONE_B.slice(-10)]) {
      await db.from('users').update({ phone: null, phone_verified: false }).eq('phone', phone);
    }
    await db.from('users').update({ email: null, email_verified: false }).ilike('email', 'e2e-apply-%@example.com');
  }

  test.beforeAll(async () => {
    await releaseTestIdentities();
    for (const phoneNumber of [PHONE_A, PHONE_B]) {
      const uid = await firebaseUidFor({ phoneNumber });
      if (uid) preexisting.add(uid);
    }
  });

  test.afterAll(async () => {
    for (const id of [{ phoneNumber: PHONE_A }, { phoneNumber: PHONE_B }, { email: EMAIL_B }, { email: EMAIL_C }]) {
      const uid = await firebaseUidFor(id);
      if (uid && !preexisting.has(uid)) createdUids.add(uid);
    }
    await deleteFirebaseUsers([...createdUids]);
    await releaseTestIdentities();
  });

  /** Send the OTP to a staging test number and enter the fixed code. */
  async function verifyPhone(page: Page, phone: string) {
    await page.getByLabel(/phone number/i).fill(phone.slice(-10));
    await page.getByRole('button', { name: /send otp/i }).click();
    await expect(page.getByLabel(/^OTP$/i)).toBeVisible({ timeout: 45000 });
    await page.getByLabel(/^OTP$/i).fill(process.env.E2E_TEST_FIXED_OTP || '123456');
    await page.getByRole('button', { name: /verify otp/i }).click();
  }

  async function openApply(page: Page) {
    await page.route('**/api/pincode/625001*', (route) =>
      route.fulfill({ json: { success: true, data: { city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu' } } }),
    );
    await page.goto(`${MARKETING_URL}/apply`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[name="firstName"]')).toBeVisible({ timeout: 45000 });
  }

  async function signUpWithEmail(page: Page, name: string, email: string) {
    const login = page.getByRole('banner').getByRole('button', { name: /log in/i });
    await expect(async () => {
      await login.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45000 });
    await page.getByRole('button', { name: /sign up/i }).click();
    await page.getByRole('dialog').getByLabel(/full name/i).fill(name);
    await page.getByRole('dialog').getByLabel(/^email/i).fill(email);
    await page.getByRole('dialog').getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign up with email/i }).click();
  }

  test('phone first: name, father name, PIN, Continue, OTP, and on to Your course', async ({ page }) => {
    await openApply(page);
    await page.locator('input[name="firstName"]').fill('E2E Phone First');
    await page.locator('input[name="fatherName"]').fill('E2E Father');
    await page.locator('input[name="phone"]').fill(PHONE_A.slice(-10));
    await page.getByRole('button', { name: /class 12/i }).click();
    await page.locator('input[name="pincode"]').fill('625001');
    await expect(page.getByTestId('apply-place-line')).toContainText('Madurai');
    await page.getByRole('button', { name: /continue to your course/i }).click();

    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/phone number/i)).toHaveValue(PHONE_A.slice(-10));
    await verifyPhone(page, PHONE_A);
    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeHidden({ timeout: 45000 });

    // Verified: the form carries on by itself to step 2.
    await expect(page.getByRole('heading', { name: /your course/i })).toBeVisible({ timeout: 45000 });
  });

  test('email sign-up waits for the link, then the phone, then fills the form', async ({ page }) => {
    await openApply(page);
    await signUpWithEmail(page, 'E2E Email Student', EMAIL_B);

    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: /i've verified my email/i }).click();
    await expect(page.getByText(/not verified yet/i)).toBeVisible();

    await markEmailVerified(EMAIL_B);
    // The dialog notices by itself within a few seconds; the button is the fallback.
    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeVisible({ timeout: 45000 });
    await verifyPhone(page, PHONE_B);
    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeHidden({ timeout: 45000 });

    await expect(page.locator('input[name="firstName"]')).toHaveValue('E2E Email Student', { timeout: 45000 });
    await expect(page.locator('input[name="email"]')).toHaveValue(EMAIL_B);
    await expect(page.locator('input[name="phone"]')).toHaveValue(PHONE_B.slice(-10));

    const db = await stagingSupabase();
    const { data } = await db.from('users').select('email_verified, phone, phone_verified').ilike('email', EMAIL_B).single();
    expect(data).toMatchObject({ email_verified: true, phone_verified: true });
  });

  test('a number already on another account: Sign in with this number joins them', async ({ page }) => {
    await openApply(page);
    await signUpWithEmail(page, 'E2E Second Account', EMAIL_C);
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 45000 });
    await markEmailVerified(EMAIL_C);
    await expect(page.getByText('Verify Your Phone', { exact: true })).toBeVisible({ timeout: 45000 });

    // PHONE_A belongs to the phone-first account from the first test.
    await verifyPhone(page, PHONE_A);

    await expect(page.getByText('This number already has an account')).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: 'Sign in with this number' }).click();
    await expect(page.getByText('This number already has an account')).toBeHidden({ timeout: 45000 });

    // The phone-first account kept its draft; the empty email account was folded into it.
    const db = await stagingSupabase();
    const phoneUid = await firebaseUidFor({ phoneNumber: PHONE_A });
    const { data: kept } = await db.from('users').select('id, email, phone_verified').eq('firebase_uid', phoneUid).single();
    expect(kept.phone_verified).toBe(true);
    expect(kept.email?.toLowerCase()).toBe(EMAIL_C);
    const emailUid = await firebaseUidFor({ email: EMAIL_C });
    const { data: identity } = await db.from('user_identities').select('user_id').eq('provider_uid', emailUid).single();
    expect(identity.user_id).toBe(kept.id);
  });

  test('a verified account signing in again is not asked for the phone', async ({ page }) => {
    await openApply(page);
    const login = page.getByRole('banner').getByRole('button', { name: /log in/i });
    await expect(async () => {
      await login.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45000 });
    await page.getByRole('dialog').getByLabel(/^email/i).fill(EMAIL_B);
    await page.getByRole('dialog').getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in with email/i }).click();

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 45000 });
    await expect(page.getByText('Verify Your Phone', { exact: true })).toHaveCount(0);
    await expect(page.locator('input[name="phone"]')).toHaveValue(PHONE_B.slice(-10), { timeout: 45000 });
  });
});
