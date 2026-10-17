import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Application forms on the Students roster at 375px: the per-student flag, the
 * filter, the attention row and the review sheet.
 *
 * Read-only. Linking a form merges two users rows and cannot be undone, so nothing
 * here links, dismisses or runs the daily fill. The write routes are only called
 * with bodies they must refuse before touching anything.
 */

const NEXUS = APP_URLS.nexus;
const SEARCH_PLACEHOLDER = 'Search by name or email...';

test.use({ viewport: { width: 375, height: 812 } });

function studentRows(page: Page) {
  return page.locator('[role="button"]').filter({ hasText: /@/ });
}

async function fitsWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test.describe('Students application forms', () => {
  // A cold /teacher/students compile alone can outlast the 30s default.
  test.describe.configure({ timeout: 120_000 });

  let classroomId: string | null = null;
  let token: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.get(`${NEXUS}/teacher/students`, { timeout: 110_000 }).catch(() => null);
    const auth = await getTestAuthToken(request, 'teacher');
    classroomId = auth?.classrooms?.[0]?.id ?? null;
    token = auth?.testToken ?? null;
  });

  test('the roster payload flags each student and counts the ones without a form', async ({ request }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}&examBatch=all`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.counts.noForm).toBe('number');
    // Finance viewers get a count and a per-student flag; everyone else gets 0
    // and no flag at all, so a teacher's payload says nothing about money.
    expect(typeof body.counts.noFee).toBe('number');
    const flagged = body.students.filter((s: any) => 'fee_missing' in s).length;
    expect(flagged === 0 || flagged === body.students.length).toBe(true);
    if (flagged === 0) expect(body.counts.noFee).toBe(0);
    for (const student of body.students) {
      expect(typeof student.has_application_form).toBe('boolean');
    }
  });

  test('the review lists students without a form and never sends the other record\'s contact details', async ({
    request,
  }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students/application-forms?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(typeof body.canLink).toBe('boolean');
    for (const student of body.students) {
      for (const candidate of student.candidates) {
        expect(candidate).not.toHaveProperty('phone');
        expect(candidate).not.toHaveProperty('email');
        expect(['strong', 'likely']).toContain(candidate.strength);
      }
    }
  });

  test('link and dismiss refuse a request without the three ids', async ({ request }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    for (const action of ['link', 'dismiss']) {
      const res = await request.post(`${NEXUS}/api/students/application-forms/${action}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { classroomId },
        timeout: 90_000,
      });
      // 400 for a bad body, or 403 for a teacher without the capability. Never a merge.
      expect([400, 403]).toContain(res.status());
    }
  });

  test('the review refuses a caller with no token', async ({ request }) => {
    test.skip(!classroomId, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students/application-forms?classroom=${classroomId}`, {
      timeout: 90_000,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test.describe('on a phone', () => {
    test.beforeEach(async ({ page }) => {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
    });

    test('the application form filter narrows the list and shows as a removable chip', async ({ page }) => {
      await page.getByRole('button', { name: 'Filters' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filter students' });
      await sheet.getByRole('radio', { name: 'No application form' }).check();
      await sheet.getByRole('button', { name: 'Done' }).click();

      const chip = page.getByRole('button', { name: 'No application form', exact: true });
      await expect(chip).toBeVisible();

      const rows = studentRows(page);
      const count = await rows.count();
      if (count === 0) {
        await expect(page.getByText('No students match these filters')).toBeVisible();
      }
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(rows.nth(i)).toContainText('No application form');
      }
      expect(await fitsWidth(page)).toBe(true);

      await chip.locator('.MuiChip-deleteIcon').click();
      await expect(chip).toHaveCount(0);
    });

    test('Find their forms opens the review sheet at full width without acting', async ({ page }) => {
      const card = page.getByRole('region', { name: 'Needs attention' });
      test.skip((await card.count()) === 0, 'Nothing on this roster needs attention');

      const toggle = card.getByRole('button', { name: /^Needs attention \(/ });
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();

      const find = card.getByRole('button', { name: 'Find their forms' });
      test.skip((await find.count()) === 0, 'Every student here has an application form');
      await find.click();

      const sheet = page.getByRole('dialog', { name: 'Application forms' });
      await expect(sheet).toBeVisible();
      // Loaded: a student card, or the all-clear.
      await expect(
        sheet.locator('section').first().or(sheet.getByText('Every student here has an application form.')),
      ).toBeVisible({ timeout: 60_000 });
      expect(await fitsWidth(page)).toBe(true);

      const done = sheet.getByRole('button', { name: 'Done' });
      const box = await done.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      await done.click();
      await expect(sheet).toHaveCount(0);
    });
  });

  /**
   * The no-form card offers ONE path: fill in the form and fees in Admin. The
   * review list is intercepted so a student with nothing found is always there,
   * and the roster count is nudged to at least 1 so the attention row shows.
   */
  test.describe('a student with no form anywhere', () => {
    const NO_FORM_STUDENT = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Rayna Test',
      email: 'rayna.test@example.com',
      candidates: [],
      detailRequest: { progress: 'not_asked', askedAt: null, askedByName: null, openedAt: null, answeredAt: null, expiresAt: null },
    };

    async function openCard(page: Page, canLink: boolean) {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.route((url) => url.pathname === '/api/students', async (route) => {
        const response = await route.fetch();
        const body = await response.json().catch(() => null);
        if (body?.counts) body.counts.noForm = Math.max(1, body.counts.noForm || 0);
        await route.fulfill({ response, json: body });
      });
      await page.route((url) => url.pathname === '/api/students/application-forms', (route) =>
        route.fulfill({ json: { students: [NO_FORM_STUDENT], canLink } }),
      );
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      const card = page.getByRole('region', { name: 'Needs attention' });
      await expect(card).toBeVisible({ timeout: 60_000 });
      const toggle = card.getByRole('button', { name: /^Needs attention \(/ });
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      await card.getByRole('button', { name: 'Find their forms' }).click();
      const sheet = page.getByRole('dialog', { name: 'Application forms' });
      await expect(sheet.getByRole('region', { name: 'Rayna Test' })).toBeVisible({ timeout: 60_000 });
      return sheet.getByRole('region', { name: 'Rayna Test' });
    }

    test('one primary button to Admin, and Other ways shows only the link', async ({ page }) => {
      const student = await openCard(page, true);
      await expect(
        student.getByText('No application form found. Fill in their form and fees in Admin, then send it to them to check.'),
      ).toBeVisible();

      const admin = student.getByRole('link', { name: 'Fill in form and fees in Admin' });
      await expect(admin).toBeVisible();
      await expect(admin).toHaveAttribute('href', /\/crm\/11111111-1111-4111-8111-111111111111\?section=application&open=fees$/);
      const box = await admin.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      // Full width on a phone: the card is the only thing it shares a row with.
      expect(box!.width).toBeGreaterThan(250);

      await expect(student.getByRole('button', { name: 'Send in Teams and Nexus' })).toHaveCount(0);
      await expect(student.getByRole('button', { name: 'Copy the questions instead' })).toHaveCount(0);
      await expect(student.getByRole('button', { name: 'Send them a link to fill in' })).toHaveCount(0);

      const other = student.getByRole('button', { name: 'Other ways' });
      await expect(other).toHaveAttribute('aria-expanded', 'false');
      await other.click();
      await expect(other).toHaveAttribute('aria-expanded', 'true');
      await expect(student.getByRole('button', { name: 'Send them a link to fill in' })).toBeVisible();
      // Exactly one option behind Other ways.
      await expect(student.locator('[id^="other-ways-"] button')).toHaveCount(1);
      expect(await fitsWidth(page)).toBe(true);
      if (process.env.CHECK_SHOTS) {
        // Let the Collapse and the sheet finish moving before the picture.
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${process.env.CHECK_SHOTS}/no-form-card-375.png`, fullPage: false });
        await page.setViewportSize({ width: 1280, height: 900 });
        await expect(page.getByRole('dialog', { name: 'Application forms' })).toBeVisible();
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${process.env.CHECK_SHOTS}/no-form-card-1280.png`, fullPage: false });
      }
    });

    test('staff who cannot use Admin get the link as the main button', async ({ page }) => {
      const student = await openCard(page, false);
      await expect(student.getByText('No application form found. Ask the office to fill in their form and fees.')).toBeVisible();
      await expect(student.getByRole('link', { name: 'Fill in form and fees in Admin' })).toHaveCount(0);
      await expect(student.getByRole('button', { name: 'Other ways' })).toHaveCount(0);
      const link = student.getByRole('button', { name: 'Send them a link to fill in' });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    });
  });
});
