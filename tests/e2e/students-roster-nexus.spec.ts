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

  test('a roster row and the City-Wise screen name the same city for a student', async ({ request }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    const headers = { Authorization: `Bearer ${token}` };

    const roster = await request.get(`${NEXUS}/api/students?classroom=${classroomId}&examBatch=all`, {
      headers,
      timeout: 90_000,
    });
    expect(roster.status()).toBe(200);
    const located = (await roster.json()).students.filter((s: any) => s.city);
    test.skip(located.length === 0, 'No student on this roster has a city on their form');

    // Both go through pickStudentPlace, so a student with several application
    // forms cannot be filed under one city here and another one there.
    const geo = await request.get(`${NEXUS}/api/students/city-wise`, { headers, timeout: 90_000 });
    expect(geo.status()).toBe(200);
    const cities = new Set((await geo.json()).cities.map((c: any) => c.city));
    expect(cities.size).toBeGreaterThan(0);

    for (const student of located.slice(0, 10)) {
      // Title-cased on both sides, never the raw "madurai" the form was typed in.
      expect(student.city).toBe(student.city.trim());
      expect(student.city[0]).toBe(student.city[0].toUpperCase());
      expect(cities, `${student.name} is in ${student.city} on the roster`).toContain(student.city);
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

  /**
   * The laptop band the other projects miss.
   *
   * nexus-chrome runs at 1280 and nexus-mobile at 393, and the bug lived between
   * them: with the sidebar expanded, a ~1024px window leaves the cards about
   * 700px, while a viewport media query still asked for three columns. Measuring
   * the DOCUMENT cannot catch it either, because html, body and main all carry
   * overflow-x: hidden, so the third card was clipped rather than scrollable and
   * document.scrollWidth never grew. So: measure the grid against itself.
   */
  test.describe('on a laptop, with the sidebar taking its share', () => {
    test.use({ viewport: { width: 1024, height: 800 } });

    test.beforeEach(async ({ page }) => {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Card grid' }).click();
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
    });

    test('every card sits inside the grid, at every width down to the breakpoint', async ({ page }) => {
      for (const width of [1024, 980, 940, 900, 880]) {
        await page.setViewportSize({ width, height: 800 });
        // Let the container query settle before measuring.
        await page.waitForTimeout(150);

        const grid = studentRows(page).first().locator('xpath=..');
        const overflow = await grid.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow, `the grid overflows its own box at ${width}px`).toBeLessThanOrEqual(1);

        const escaped = await grid.evaluate((el) => {
          const right = el.getBoundingClientRect().right;
          return Array.from(el.children).filter((c) => c.getBoundingClientRect().right > right + 1).length;
        });
        expect(escaped, `cards reach past the right edge at ${width}px`).toBe(0);
      }
    });

    test('the column count follows the container, not the window', async ({ page }) => {
      const columnsAt = async (width: number) => {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(150);
        const grid = studentRows(page).first().locator('xpath=..');
        return grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      };

      // A 260px sidebar plus 64px of padding leaves well under 900px here, so the
      // cards must not be asking for three columns.
      expect(await columnsAt(1024)).toBeLessThanOrEqual(2);
      expect(await columnsAt(1440)).toBeGreaterThanOrEqual(2);
    });
  });
});
