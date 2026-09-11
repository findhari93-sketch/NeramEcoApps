import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Creating a student's Microsoft account from Nexus, at 375px.
 *
 * Read-only on purpose. Local dev points at the production database and the real
 * Microsoft tenant, so nothing here creates an account, resets a password or
 * enrolls anyone: a real create would mint a tenant user and use a paid license.
 * The API tests check the gate, the validation and the response shapes; the UI
 * tests open sheets and menus and close them again.
 */

const NEXUS = APP_URLS.nexus;
const SEARCH_PLACEHOLDER = 'Search by name or email...';

test.use({ viewport: { width: 375, height: 812 } });

function studentRows(page: Page) {
  return page.locator('[role="button"]').filter({ hasText: /@/ });
}

test.describe('Student Microsoft accounts', () => {
  // A cold compile of the new routes and the students page can outlast the default.
  test.describe.configure({ timeout: 120_000 });

  let token: string | null = null;
  let classroomId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.get(`${NEXUS}/teacher/students`, { timeout: 110_000 }).catch(() => null);
    const auth = await getTestAuthToken(request, 'teacher');
    token = auth?.testToken ?? null;
    classroomId = auth?.classrooms?.[0]?.id ?? null;
  });

  test('readiness reports the Azure setup and is never cached', async ({ request }) => {
    test.skip(!token, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students/accounts/readiness`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    test.skip(res.status() === 403, 'The test account is not a manager or admin');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('no-store');

    const body = await res.json();
    expect(typeof body.ready).toBe('boolean');
    expect(typeof body.canResetPassword).toBe('boolean');
    expect(Array.isArray(body.missing)).toBe(true);
    expect(Array.isArray(body.skus)).toBe(true);
    expect(body).not.toHaveProperty('password');
  });

  test('preview suggests a First_Last login ID and creates nothing', async ({ request }) => {
    test.skip(!token || !classroomId, 'Nexus test-login unavailable');
    const res = await request.post(`${NEXUS}/api/students/accounts/preview`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { classroomId, firstName: 'Zzplaywright', lastName: 'Probe' },
      timeout: 90_000,
    });
    test.skip(res.status() === 403, 'The test account is not a manager or admin');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.username.startsWith('Zzplaywright_Probe')).toBe(true);
    expect(body.valid).toBe(true);
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  test('create refuses a bad mobile number before touching Microsoft', async ({ request }) => {
    test.skip(!token || !classroomId, 'Nexus test-login unavailable');
    const res = await request.post(`${NEXUS}/api/students/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { classroomId, firstName: 'Zzplaywright', lastName: 'Probe', username: 'Zzplaywright_Probe', phone: '12345' },
      timeout: 90_000,
    });
    test.skip(res.status() === 403, 'The test account is not a manager or admin');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/10 digit/);
  });

  test('a student cannot reach the account routes', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Student test-login unavailable');
    const headers = { Authorization: `Bearer ${auth!.testToken}` };

    const readiness = await request.get(`${NEXUS}/api/students/accounts/readiness`, { headers, timeout: 90_000 });
    expect([401, 403]).toContain(readiness.status());

    // A well-formed id that is nobody: the capability check refuses before any lookup.
    const reset = await request.post(
      `${NEXUS}/api/students/00000000-0000-4000-8000-000000000000/reset-password`,
      { headers, timeout: 90_000 },
    );
    expect([401, 403]).toContain(reset.status());
  });

  test.describe('on a phone', () => {
    test.beforeEach(async ({ page }) => {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
    });

    test('Create account opens on the setup notice or the form, inside 375px', async ({ page }) => {
      const fab = page.getByRole('button', { name: 'Add student' });
      test.skip((await fab.count()) === 0, 'The test account cannot add students');
      await fab.click();

      const sheet = page.getByRole('dialog', { name: 'Add student' });
      const createTab = sheet.getByRole('tab', { name: 'Create account' });
      await expect(createTab).toHaveAttribute('aria-selected', 'true');

      const setup = sheet.getByText('One-time setup needed');
      const form = sheet.getByLabel(/First name/);
      const offline = sheet.getByText('Nexus cannot reach Microsoft right now');
      const manual = sheet.getByText('Create the account in Microsoft first');
      await expect(setup.or(form).or(offline).or(manual)).toBeVisible({ timeout: 60_000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);

      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toHaveCount(0);
    });

    test('a row menu offers the account action that fits the student', async ({ page }) => {
      await page.getByRole('button', { name: /^Actions for / }).first().click();
      await expect(page.getByRole('menuitem', { name: 'Open profile' })).toBeVisible();

      const action = page.getByRole('menuitem', { name: /^(Reset password|Create Microsoft account)$/ });
      test.skip((await action.count()) === 0, 'The test account cannot manage student accounts');
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);

      await page.keyboard.press('Escape');
      await expect(action).toHaveCount(0);
    });
  });
});
