/**
 * Tools App: "Which year will you write NATA or JEE B.Arch?" sheet (phone).
 *
 * A signed-in student with no stated exam year (no batch year, no application
 * form year, no user_exam_profiles.planning_year) sees a bottom sheet with four
 * year chips, "Not sure yet" and "Later":
 *   - AC1: the sheet shows after the phone and onboarding gates, fits 375px,
 *          and every target is at least 44px;
 *   - AC2: "Later" closes it and records a server-side snooze;
 *   - AC3: picking a year and Save stores it with source tools_sheet (and does
 *          not mark the Question Bank onboarding done), then shows a toast;
 *   - AC4: once a year is stated, the sheet does not come back;
 *   - AC5: a student whose batch fixes the year is never asked.
 *
 * Runs against STAGING only (apps/app/.env.local on neram-staging with admin
 * credentials) with NEXT_PUBLIC_E2E_TEST_MODE=true servers and a Firebase
 * email/password account in E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD. In E2E
 * mode the sheet only opens for a test that opts in through localStorage, so
 * the other app specs are not blocked by it.
 *
 * Run: pnpm test:e2e tests/e2e/app-exam-year-sheet-mobile.spec.ts --project=mobile-chrome --no-deps
 */

import { test, expect, type Page } from '@playwright/test';
import { stagingAdminAvailable, stagingSupabase } from '../utils/firebase-staging-admin';
import { loginWithPhoneOTP } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { examYearChoices } from '../../packages/database/src/utils/academic-year';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';
const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
const SHEET_TITLE = 'Which year will you write NATA or JEE B.Arch?';
const CHOICES = examYearChoices();

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

test.describe('Tools App exam year sheet (staging, phone)', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 375, height: 812 } });

  test.skip(!stagingAdminAvailable(), 'Needs apps/app/.env.local on the staging project with admin credentials.');
  test.skip(!APP_EMAIL || !APP_PASSWORD || !E2E_MODE, 'Set E2E_TEST_APP_EMAIL, E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true.');

  let userId = '';
  // What the account looked like before, restored afterwards.
  let original: {
    academic_year: string | null;
    metadata: Record<string, unknown> | null;
    phone: string | null;
    phone_verified: boolean | null;
  } | null = null;
  let originalProfile: Record<string, unknown> | null = null;
  let originalLeadYears: { id: string; target_exam_year: number | null }[] = [];

  async function resetToUnstated() {
    const db = await stagingSupabase();
    const meta = { ...(original?.metadata || {}) };
    delete (meta as Record<string, unknown>).exam_year_prompt;
    await db.from('users').update({ academic_year: null, onboarding_completed: true, metadata: meta }).eq('id', userId);
    await db.from('user_exam_profiles').delete().eq('user_id', userId);
    if (originalLeadYears.length) {
      await db.from('lead_profiles').update({ target_exam_year: null }).in('id', originalLeadYears.map((l) => l.id));
    }
  }

  test.beforeAll(async () => {
    const db = await stagingSupabase();
    const { data: user } = await db
      .from('users')
      .select('id, academic_year, metadata, phone, phone_verified')
      .ilike('email', APP_EMAIL)
      .maybeSingle();
    test.skip(!user?.id, 'The E2E app account has no users row on staging yet.');
    userId = user.id;
    original = {
      academic_year: user.academic_year ?? null,
      metadata: user.metadata ?? null,
      phone: user.phone ?? null,
      phone_verified: user.phone_verified ?? null,
    };
    // This spec is about the sheet that follows the phone gate, not the gate:
    // start past it (the phone-auth specs cover the OTP flow).
    if (!user.phone_verified) {
      await db.from('users').update({ phone_verified: true, phone: user.phone || TEST_PHONE }).eq('id', userId);
    }
    const { data: profile } = await db.from('user_exam_profiles').select('*').eq('user_id', userId).maybeSingle();
    originalProfile = profile ?? null;
    const { data: leads } = await db
      .from('lead_profiles')
      .select('id, target_exam_year')
      .eq('user_id', userId)
      .not('target_exam_year', 'is', null);
    originalLeadYears = leads || [];
    await resetToUnstated();
  });

  test.afterAll(async () => {
    if (!userId) return;
    const db = await stagingSupabase();
    await db
      .from('users')
      .update({
        academic_year: original?.academic_year ?? null,
        metadata: original?.metadata ?? null,
        phone: original?.phone ?? null,
        phone_verified: original?.phone_verified ?? false,
      })
      .eq('id', userId);
    await db.from('user_exam_profiles').delete().eq('user_id', userId);
    if (originalProfile) await db.from('user_exam_profiles').insert(originalProfile);
    for (const l of originalLeadYears) {
      await db.from('lead_profiles').update({ target_exam_year: l.target_exam_year }).eq('id', l.id);
    }
  });

  /** Opt this page in to the sheet (it stays hidden in E2E mode otherwise). */
  async function optIn(page: Page) {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('neram_e2e_exam_year_sheet', '1');
        window.sessionStorage.removeItem('neram_exam_year_sheet_seen');
      } catch {
        // ignore
      }
    });
  }

  async function signIn(page: Page) {
    await optIn(page);
    // Straight to the email form: ?sso=none skips the marketing /sso bounce,
    // which can hold the page's load event on a local dev server.
    await page.goto(`${APP_URL}/login?sso=none`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /^email/i }).fill(APP_EMAIL);
    await page.locator('input[type="password"]').fill(APP_PASSWORD);
    await page.getByRole('button', { name: /sign in with email/i }).click();
    const phoneModal = page.getByText('Verify Your Phone').first();
    const shell = page.getByTestId('report-problem-fab');
    await expect(phoneModal.or(shell).first()).toBeVisible({ timeout: 45000 });
    // The phone modal is lazy-loaded and can arrive just after the shell paints.
    const needsPhone = await phoneModal
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (needsPhone) await loginWithPhoneOTP(page, TEST_PHONE);
  }

  test('AC1 + AC2: the sheet fits a phone, and Later snoozes it server-side', async ({ page }) => {
    await signIn(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(SHEET_TITLE)).toBeVisible({ timeout: 30000 });

    for (const y of CHOICES) await expect(sheet.getByTestId(`exam-year-chip-${y}`)).toBeVisible();
    await expect(sheet.getByRole('radio')).toHaveCount(4);
    await expect(sheet.getByTestId('exam-year-save')).toBeDisabled();
    await assertTouchTargetSize(page, '[data-testid^="exam-year-chip-"]', 44);
    await assertTouchTargetSize(page, '[data-testid="exam-year-later"]', 44);
    await assertTouchTargetSize(page, '[data-testid="exam-year-not-sure"]', 44);
    await assertNoHorizontalOverflow(page);

    await sheet.getByTestId('exam-year-later').click();
    await expect(page.getByText(SHEET_TITLE)).toBeHidden();

    const db = await stagingSupabase();
    await expect
      .poll(async () => {
        const { data } = await db.from('users').select('metadata').eq('id', userId).single();
        return data?.metadata?.exam_year_prompt?.dismissed_count ?? 0;
      }, { timeout: 15000 })
      .toBe(1);
  });

  test('AC3 + AC4: picking a year saves it, and the sheet does not come back', async ({ page, context }) => {
    await resetToUnstated();
    await signIn(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(SHEET_TITLE)).toBeVisible({ timeout: 30000 });

    const year = CHOICES[1];
    await sheet.getByTestId(`exam-year-chip-${year}`).click();
    await expect(sheet.getByTestId(`exam-year-chip-${year}`)).toHaveAttribute('aria-checked', 'true');
    await sheet.getByTestId('exam-year-save').click();
    await expect(page.getByText(`Saved. We will plan your preparation for ${year}.`)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(SHEET_TITLE)).toBeHidden();

    const db = await stagingSupabase();
    const { data: profile } = await db
      .from('user_exam_profiles')
      .select('planning_year, planning_year_source, qb_onboarding_completed')
      .eq('user_id', userId)
      .single();
    expect(profile.planning_year).toBe(year);
    expect(profile.planning_year_source).toBe('tools_sheet');
    expect(profile.qb_onboarding_completed).toBe(false);

    // A fresh tab (new session) is not asked again.
    const again = await context.newPage();
    await optIn(again);
    await again.goto(`${APP_URL}/dashboard`);
    await expect(again.getByTestId('report-problem-fab')).toBeVisible({ timeout: 45000 });
    await again.waitForTimeout(3000);
    await expect(again.getByText(SHEET_TITLE)).toBeHidden();
  });

  test('AC5: a student whose batch fixes the year is never asked', async ({ page }) => {
    await resetToUnstated();
    const db = await stagingSupabase();
    await db.from('users').update({ academic_year: `${CHOICES[0] - 1}-${String(CHOICES[0] % 100).padStart(2, '0')}` }).eq('id', userId);

    await signIn(page);
    await page.goto(`${APP_URL}/dashboard`);
    await expect(page.getByTestId('report-problem-fab')).toBeVisible({ timeout: 45000 });
    await page.waitForTimeout(3000);
    await expect(page.getByText(SHEET_TITLE)).toBeHidden();
  });
});
