import { test, expect, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { NEXUS, mockCatchupApis, openTeacherCatchup, skipWelcome } from '../utils/catchup-helpers';

/**
 * The Catch-up Calendar (2026-10), which replaced the "Classes and recaps" tab.
 *
 * Every class by date, coloured AND labelled by how its catch-up stands.
 * Tapping a class opens its attendance drawer. The Timetable links here with
 * ?view=calendar&month=..&class=..&from=timetable, and that drawer then offers
 * "Back to timetable" so the teacher returns where they came from.
 *
 * Most tests serve the fixture calendar (tests/fixtures/catchup-overview.ts):
 * six classes a month, one per health state, with today fixed at 2026-09-24.
 * The deep-link test at the end uses a real class from the E2E classroom.
 *
 * READ-ONLY: nothing here prepares a recap, marks a class not taught or ticks
 * attendance.
 */

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

/** The attendance drawer, found by the class title it shows. */
function classDrawer(page: Page, title: string | RegExp) {
  return page.locator('.MuiDrawer-paper').filter({ has: page.getByRole('heading', { name: title }) });
}

test.describe('Catch-up calendar on a laptop', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await mockCatchupApis(page);
    await page.setViewportSize(DESKTOP);
  });

  test('the Calendar tab opens this month, with a labelled chip per class', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
    await expect(page.getByRole('grid', { name: /^September 2026, 6 classes$/ })).toBeVisible();

    // Colour is never the only cue: every chip says its state in words.
    await expect(
      page.getByRole('button', { name: 'Basic 3D Shape Composition (2026-09), Recap missing, 4 waiting' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Colour theory and harmony \(2026-09\), All caught up$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^NATA mock paper review \(2026-09\), Upcoming$/ })).toBeVisible();
    for (const legend of ['Recap missing', 'Catching up', 'All caught up', 'Not taught']) {
      await expect(page.getByText(legend, { exact: true }).last()).toBeVisible();
    }
    await assertNoHorizontalOverflow(page);
  });

  test('Previous and Next walk the months, and Today comes back', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    const heading = (t: string) => page.getByRole('heading', { name: t });

    // The month is fetched when it is opened, not before.
    const octRequest = page.waitForRequest(
      (r) => r.url().includes('/api/catchup/calendar') && /from=2026-(09-2\d|09-30|10-01)/.test(r.url()),
    );
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(heading('October 2026')).toBeVisible();
    await expect(page).toHaveURL(/[?&]month=2026-10\b/);
    await octRequest;
    await expect(page.getByRole('button', { name: /\(2026-10\), Upcoming$/ }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(heading('August 2026')).toBeVisible();
    await expect(page).toHaveURL(/[?&]month=2026-08\b/);

    // Off the current month, a Today button in the month bar offers the way
    // home. Scoped to the bar: the app shell has a "Today" of its own.
    const monthBar = (t: string) => heading(t).locator('xpath=..');
    await monthBar('August 2026').getByRole('button', { name: 'Today' }).click();
    await expect(heading('September 2026')).toBeVisible();
    await expect(monthBar('September 2026').getByRole('button', { name: 'Today' })).toHaveCount(0);
  });

  test('tapping a class opens its attendance drawer, and Close puts it away', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    await page.getByRole('button', { name: /^Perspective drawing: two point \(2026-09\),/ }).click();
    const drawer = classDrawer(page, 'Perspective drawing: two point (2026-09)');
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/[?&]class=cal-2026-09-0\b/);
    // Opened from the calendar, not the timetable: no way "back" to somewhere
    // the teacher never was.
    await expect(drawer.getByRole('link', { name: 'Back to timetable' })).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]class=/);
  });

  test('a ?class= deep link from the timetable opens the drawer with a way back', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09&class=cal-2026-09-2&from=timetable');
    const drawer = classDrawer(page, 'Memory drawing, street scene (2026-09)');
    await expect(drawer).toBeVisible();
    const back = drawer.getByRole('link', { name: 'Back to timetable' });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/teacher/timetable');
    await assertTouchTargetSize(page, '.MuiDrawer-paper a[aria-label="Back to timetable"]', 44);
    // The URL keeps the round trip while the drawer is open.
    await expect(page).toHaveURL(/[?&]from=timetable\b/);
  });

  test('the Calendar and List toggle swaps the view and lands in the URL', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    const toggle = page.getByRole('group', { name: 'Show classes as' });
    await toggle.getByRole('button', { name: 'List' }).click();
    await expect(page).toHaveURL(/[?&]display=list\b/);
    const filters = page.getByRole('group', { name: 'Filter classes' });
    await expect(filters.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
    await expect(filters.getByRole('button', { name: /^Blocked on us \d+$/ })).toBeVisible();
    await expect(filters.getByRole('button', { name: /^Still catching up \d+$/ })).toBeVisible();

    await toggle.getByRole('button', { name: 'Calendar' }).click();
    await expect(page).not.toHaveURL(/[?&]display=list\b/);
    await expect(page.getByRole('grid', { name: /^September 2026,/ })).toBeVisible();
  });

  test('the recap actions sit in one menu', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    await page.getByRole('button', { name: 'More recap actions' }).click();
    await expect(page.getByRole('menuitem', { name: /Prepare missing classes/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Recap from a link/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Catch-up calendar on a phone', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await mockCatchupApis(page);
    await page.setViewportSize(PHONE);
  });

  test('375px: a month of day cells, thumb sized, with no sideways scroll', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    const grid = page.getByRole('grid', { name: /^September 2026, 6 classes$/ });
    await expect(grid).toBeVisible();
    const cells = grid.getByRole('gridcell');
    expect(await cells.count()).toBeGreaterThanOrEqual(35);
    await assertTouchTargetSize(page, '[role="grid"] [role="gridcell"]', 44);
    // A day's label reads out its classes and how each stands.
    await expect(grid.getByRole('gridcell', { name: /^8 September, Basic 3D Shape Composition \(2026-09\): Recap missing, 4 waiting$/ })).toBeVisible();
    await expect(grid.getByRole('gridcell', { name: /^1 September, no class$/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('375px: picking a day lists its classes, and a class opens a full-width drawer', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    const grid = page.getByRole('grid', { name: /^September 2026,/ });
    const day = grid.getByRole('gridcell', { name: /^15 September,/ });
    await day.click();
    await expect(day).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('15 September', { exact: true })).toBeVisible();

    const row = page.getByRole('button', { name: /^Aptitude: mental ability set 4 \(2026-09\)/ });
    await expect(row).toBeVisible();
    const rb = await row.boundingBox();
    expect(rb!.height).toBeGreaterThanOrEqual(44);
    await row.click();

    const drawer = classDrawer(page, 'Aptitude: mental ability set 4 (2026-09)');
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(PHONE.width - 1);
    await assertNoHorizontalOverflow(page);
  });

  test('375px: a day with no class says so', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    await page.getByRole('gridcell', { name: /^2 September, no class$/ }).click();
    await expect(page.getByText('No class on this day.')).toBeVisible();
  });

  test('375px: the month bar walks months and fits one row', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09');
    await assertTouchTargetSize(page, '[aria-label="Previous month"], [aria-label="Next month"]', 44);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('heading', { name: 'August 2026' })).toBeVisible();
    await expect(page).toHaveURL(/[?&]month=2026-08\b/);
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('Catch-up calendar, live data', () => {
  test.setTimeout(150_000);

  test('a real class opens from a timetable deep link, and Back returns to the timetable', async ({ page }) => {
    const auth = await getTestAuthToken(page.request, 'teacher');
    test.skip(!auth, 'Teacher test-login unavailable');
    const classroomId = auth!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test teacher has no classroom');

    // Walk back from this month to the first one with a taught class.
    let target: { id: string; title: string | null; scheduled_date: string } | null = null;
    const now = new Date();
    for (let back = 0; back < 6 && !target; back++) {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const res = await page.request.get(
        `${NEXUS}/api/catchup/calendar?classroomId=${classroomId}&from=${ymd(first)}&to=${ymd(last)}`,
        { headers: { Authorization: `Bearer ${auth!.testToken}` } },
      );
      expect(res.status()).toBe(200);
      target = ((await res.json()).classes || []).find((c: any) => c.health !== 'upcoming') ?? null;
    }
    test.skip(!target, 'No taught class in the last six months in this environment');

    await injectAuthForPage(page, 'teacher');
    await skipWelcome(page);
    await page.setViewportSize(DESKTOP);
    const month = target!.scheduled_date.slice(0, 7);
    await openTeacherCatchup(page, `view=calendar&month=${month}&class=${target!.id}&from=timetable`);

    const drawer = classDrawer(page, target!.title || 'Class');
    await expect(drawer).toBeVisible({ timeout: 60_000 });
    const back = drawer.getByRole('link', { name: 'Back to timetable' });
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(/\/teacher\/timetable/, { timeout: 60_000 });
  });

  test('timetable badges deep-link into the calendar', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await page.setViewportSize(DESKTOP);

    const answered = page.waitForResponse((r) => r.url().includes('/api/catchup/calendar'), { timeout: 90_000 });
    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    const res = await answered.catch(() => null);
    expect(res, 'the timetable asks the calendar endpoint for its badges').not.toBeNull();
    expect(res!.status()).toBe(200);
    const body = await res!.json();
    const past = (body.classes || []).filter((c: any) => c.health !== 'upcoming');
    test.skip(past.length === 0, 'No past class in the visible timetable range in this environment, so no badge to check');

    const badge = page.getByTestId('catchup-badge').first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveAttribute(
      'href',
      /^\/teacher\/catch-up\?view=calendar&month=\d{4}-\d{2}&class=[0-9a-f-]+&from=timetable$/,
    );
  });
});
