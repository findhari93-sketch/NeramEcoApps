import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * The redesigned Students roster at 375px: sign-in status, sort, filters, the row
 * menu and the Add student sheet.
 *
 * Read-only. Local dev writes to the production database, so nothing here marks
 * anyone dormant, removes, adds or reclassifies a student. Menus and sheets are
 * opened and dismissed, never acted on.
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

test.describe('Students roster', () => {
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

  test('the payload carries sign-in dates, the enrollment id and duplicate flags', async ({ request }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}&examBatch=all`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.counts.neverSignedIn).toBe('number');
    expect(typeof body.counts.notSeen14d).toBe('number');
    for (const student of body.students) {
      expect(typeof student.enrollment_id).toBe('string');
      expect(student).toHaveProperty('first_signed_in_at');
      expect(student).toHaveProperty('last_seen_at');
      expect(student).toHaveProperty('possible_duplicate_of');
    }
  });

  test.describe('on a phone', () => {
    test.beforeEach(async ({ page }) => {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
    });

    test('a row says whether the student uses Nexus', async ({ page }) => {
      await expect(studentRows(page).first()).toContainText(/Never signed in|Seen |No Microsoft account/);
    });

    test('the sort choice sticks across a reload', async ({ page }) => {
      await page.getByRole('button', { name: /^Sort: / }).click();
      await page.getByRole('menuitem', { name: 'Newest joined' }).click();
      await expect(page.getByRole('button', { name: 'Sort: Newest joined' })).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Sort: Newest joined' })).toBeVisible({ timeout: 60_000 });
    });

    test('a sign-in filter narrows the list and shows as a removable chip', async ({ page }) => {
      await page.getByRole('button', { name: 'Filters' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filter students' });
      await sheet.getByRole('radio', { name: 'Never signed in' }).check();
      await sheet.getByRole('button', { name: 'Done' }).click();

      const chip = page.getByRole('button', { name: 'Never signed in', exact: true });
      await expect(chip).toBeVisible();

      const rows = studentRows(page);
      const count = await rows.count();
      if (count === 0) {
        await expect(page.getByText('No students match these filters')).toBeVisible();
      }
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(rows.nth(i)).toContainText('Never signed in');
      }

      await chip.locator('.MuiChip-deleteIcon').click();
      await expect(chip).toHaveCount(0);
    });

    test('the row menu opens at a 48px target without navigating', async ({ page }) => {
      const menuButton = page.getByRole('button', { name: /^Actions for / }).first();
      const box = await menuButton.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(48);

      await menuButton.click();
      await expect(page.getByRole('menuitem', { name: 'Open profile' })).toBeVisible();
      await expect(page).toHaveURL(/\/teacher\/students(\?.*)?$/);
      expect(await fitsWidth(page)).toBe(true);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Open profile' })).toHaveCount(0);
    });

    test('Add student opens one sheet with both routes', async ({ page }) => {
      const fab = page.getByRole('button', { name: 'Add student' });
      test.skip((await fab.count()) === 0, 'The test account cannot add students');

      await fab.click();
      const sheet = page.getByRole('dialog', { name: 'Add student' });
      await expect(sheet.getByRole('tab', { name: 'Create account' })).toBeVisible();
      await expect(sheet.getByRole('tab', { name: 'Existing Microsoft account' })).toBeVisible();
      expect(await fitsWidth(page)).toBe(true);

      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toHaveCount(0);
    });

    test('the attention card starts folded on a phone and opens on tap', async ({ page }) => {
      const card = page.getByRole('region', { name: 'Needs attention' });
      test.skip((await card.count()) === 0, 'Nothing on this roster needs attention');

      // Folded by default at 375px, so the students are on the first screen.
      const toggle = card.getByRole('button', { name: /^Needs attention \(/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(await fitsWidth(page)).toBe(true);
    });
  });
});
