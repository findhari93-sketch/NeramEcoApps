/**
 * The Teams-shaped calendar: one compact toolbar, four views, a full-height grid.
 *
 * The redesign's whole point is vertical space, so the load-bearing assertions
 * here are geometric rather than cosmetic:
 *  - the grid starts within ~70px of the top of the content area (it used to be
 *    ~200px, behind a page title row, a toolbar row and a caption line),
 *  - it fills the viewport and the DOCUMENT does not scroll,
 *  - navigating weeks inside a loaded month fires zero extra requests, and month
 *    view fires none of the per-class fan-out.
 *
 * Auth is injected via the test-login token, so this spec does not depend on the
 * MS-login setup project (the Entra MFA wall blocks that auto-login). It skips
 * gracefully when test auth is not configured.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-calendar-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

type ViewLabel = 'Day' | 'Week' | 'Month' | 'Agenda' | 'Plan';

async function openTimetable(page: Page, role: 'student' | 'teacher' = 'student') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* storage blocked */
    }
  });
  const path = role === 'teacher' ? '/teacher/timetable' : '/student/timetable';
  await page.goto(`${APP_URLS.nexus}${path}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cal-view-switch')).toBeVisible({ timeout: 30_000 });
}

async function selectView(page: Page, label: ViewLabel) {
  await page.getByTestId('cal-view-switch').click();
  await page.getByRole('menuitemradio', { name: label, exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: label })).toHaveCount(0);
}

test.describe('Teams-style calendar', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the calendar starts near the top of the page, not ~200px down', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Week');

    const main = await page.locator('main').boundingBox();
    const grid = await page.getByTestId('calendar-grid').boundingBox();
    expect(main, 'main must be laid out').toBeTruthy();
    expect(grid, 'the calendar grid must render').toBeTruthy();

    // Toolbar only. The old layout spent a title row plus a toolbar row plus a
    // caption line before a single class was visible.
    expect(grid!.y - main!.y).toBeLessThan(70);
  });

  test('the calendar fills the viewport and the document does not scroll', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Week');

    const viewport = page.viewportSize()!;
    const grid = await page.getByTestId('calendar-grid').boundingBox();
    expect(grid!.height).toBeGreaterThan(viewport.height * 0.5);

    // Each view scrolls internally, so the content area must not grow.
    //
    // Asserted on <main> rather than the document: the app's own DesktopSidebar
    // nav is ~785px tall, so at a 720px viewport the PAGE scrolls regardless of
    // what the timetable does. That is pre-existing and not this feature's to
    // fix. The mobile test below checks the document, where there is no sidebar.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollHeight - main.clientHeight : -1;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('the first class of the week is on screen, even on a full-day band', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Week');

    // Open the band out to a full teaching day. This is the state that broke:
    // 08:00 to 21:00 at 70px an hour is ~924px of band against ~600px of
    // calendar, so the grid scrolls, and it used to open at 08:00 while every
    // Neram class runs at 19:00. The classes rendered correctly and sat below
    // the fold on every day at once, so the week read as completely empty.
    await page.getByTestId('cal-view-switch').click();
    const fullDay = page.getByRole('menuitemcheckbox', { name: /full day/i });
    if ((await fullDay.count()) > 0) {
      const checked = await fullDay.getAttribute('aria-checked');
      if (checked !== 'true') await fullDay.click();
    }
    await page.keyboard.press('Escape');

    // Page back to a week that actually has a class. The current week is often
    // empty (Neram runs in terms), and a test that skips whenever it is empty
    // would quietly stop guarding the regression for weeks at a time.
    const blocks = page.getByTestId('grid-class-block');
    let found = await blocks.count();
    for (let back = 0; back < 10 && found === 0; back++) {
      await page.getByTestId('cal-prev').click();
      await page.waitForTimeout(700);
      found = await blocks.count();
    }
    test.skip(found === 0, 'No classes in the last 10 weeks for this account');

    const grid = await page.getByTestId('calendar-grid').boundingBox();
    const first = await blocks.first().boundingBox();
    expect(grid, 'the calendar grid must render').toBeTruthy();
    expect(first, 'the first class block must render').toBeTruthy();

    // Inside the grid's own scroll viewport, without the user scrolling.
    expect(first!.y).toBeGreaterThanOrEqual(grid!.y - 1);
    expect(
      first!.y + first!.height,
      'the first class must be visible without scrolling the grid',
    ).toBeLessThanOrEqual(grid!.y + grid!.height + 1);
  });

  test('the switcher offers Day, Week, Month and the list view', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await page.getByTestId('cal-view-switch').click();

    for (const label of ['Day', 'Week', 'Month', 'Agenda']) {
      await expect(page.getByRole('menuitemradio', { name: label, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
  });

  test('month view draws whole weeks and its label names the month', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Month');

    // 5 or 6 Monday-anchored rows, never a fixed 6 and never a ragged count.
    await expect(page.getByTestId('month-cell').first()).toBeVisible({ timeout: 30_000 });
    const cells = await page.getByTestId('month-cell').count();
    expect([35, 42]).toContain(cells);

    // MMM-YY, e.g. "Jul-26". Month view only: week and day still spell out the
    // dates, which is what makes them readable.
    await expect(page.getByTestId('cal-period-label')).toHaveText(/^[A-Z][a-z]{2}-\d{2}$/);
  });

  test('next and Today move by month while in month view', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Month');

    const label = page.getByTestId('cal-period-label');
    const first = await label.innerText();

    await page.getByTestId('cal-next').click();
    await expect(label).not.toHaveText(first);

    // Today is a no-op while today is on screen, so it disables rather than
    // moving or vanishing.
    await page.getByTestId('cal-today').click();
    await expect(label).toHaveText(first);
    await expect(page.getByTestId('cal-today')).toBeDisabled();
  });

  test('the view choice survives a reload, and a stored "grid" migrates to Week', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Month');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cal-view-switch')).toContainText('Month', { timeout: 30_000 });

    // The mode used to be 'agenda' | 'grid'. Anyone still carrying 'grid' should
    // land on Week rather than being bounced to the default.
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('nexus_timetable_view:')) window.localStorage.setItem(key, 'grid');
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cal-view-switch')).toContainText('Week', { timeout: 30_000 });
  });

  test('cost guard: switching view on the same date refetches nothing', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Week');
    await page.waitForTimeout(2000);

    const scheduleCalls: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/api/timetable/my-schedule')) scheduleCalls.push(url);
    });

    // A whole month grid is always loaded and the fetch range is anchored on
    // the month, so every view of the same date resolves to the same range.
    // Deliberately not a week-paging assertion: whether "next week" stays in
    // the month depends on today's date, and near a month boundary crossing
    // over is correct behaviour rather than a regression.
    await selectView(page, 'Month');
    await page.waitForTimeout(1200);
    await selectView(page, 'Day');
    await page.waitForTimeout(1200);
    await selectView(page, 'Week');
    await page.waitForTimeout(1500);

    expect(scheduleCalls, `unexpected refetches: ${scheduleCalls.join(', ')}`).toHaveLength(0);
  });

  test('cost guard: paging a month costs exactly one request', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Month');
    await page.waitForTimeout(2500);

    const scheduleCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/timetable/my-schedule')) scheduleCalls.push(r.url());
    });

    await page.getByTestId('cal-next').click();
    await page.waitForTimeout(2500);
    expect(scheduleCalls).toHaveLength(1);

    // Coming back lands on a range that is already loaded.
    await page.getByTestId('cal-prev').click();
    await page.waitForTimeout(2000);
    expect(scheduleCalls.length, 'returning to a loaded month should be free').toBeLessThanOrEqual(2);
  });

  test('cost guard: month view runs no per-class fan-out', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    const perClassCalls: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (/\/api\/timetable\/(rsvp|reviews|attendance-report)\?class_id=/.test(url)) {
        perClassCalls.push(url);
      }
    });

    await openTimetable(page);
    await selectView(page, 'Month');
    await page.waitForTimeout(3000);

    expect(perClassCalls, 'month chips have no room for these numbers anyway').toHaveLength(0);
  });

  test('the rail shows at xl, hides below lg, and remembers the choice', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await page.setViewportSize({ width: 1600, height: 900 });
    await openTimetable(page);
    await expect(page.getByTestId('cal-rail')).toBeVisible();

    await page.getByTestId('cal-rail-toggle').click();
    await expect(page.getByTestId('cal-rail')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cal-view-switch')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('cal-rail')).toHaveCount(0);

    // Below lg there is simply not the width: 248px of rail would leave about
    // 87px per day column.
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.getByTestId('cal-rail')).toHaveCount(0);
  });

  test('the rail toggle is not a no-op between lg and xl', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    // The regression this guards: the button was shown from lg (1200) while the
    // rail only mounted from xl (1536), so anywhere in between, clicking it
    // flipped the state, wrote localStorage, and drew nothing. The old 1600 and
    // 1100 pair stepped straight over the hole. 1280 is a real laptop width,
    // and so is a 1080p screen at 125% scaling (~1513 CSS px).
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 860 });
      await openTimetable(page);

      const toggle = page.getByTestId('cal-rail-toggle');
      await expect(toggle).toBeVisible({ timeout: 30_000 });

      // Closed by default at this width: the rail would crowd the day columns.
      await expect(page.getByTestId('cal-rail')).toHaveCount(0);

      await toggle.click();
      await expect(page.getByTestId('cal-rail'), `rail must open at ${width}px`).toBeVisible();

      await toggle.click();
      await expect(page.getByTestId('cal-rail')).toHaveCount(0);
    }
  });

  test('picking a date in the rail moves the view without changing the mode', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await page.setViewportSize({ width: 1600, height: 900 });
    await openTimetable(page);
    await selectView(page, 'Week');
    await expect(page.getByTestId('cal-rail')).toBeVisible();

    const label = page.getByTestId('cal-period-label');
    const before = await label.innerText();

    // Any day two rows down is in a different week from the one on screen.
    await page.getByTestId('mini-cal-day').nth(20).click();
    await expect(label).not.toHaveText(before);
    // Teams behaviour: the date moves, the mode does not.
    await expect(page.getByTestId('cal-view-switch')).toContainText('Week');
  });

  // ── Mobile ───────────────────────────────────────────────────────────────

  test('mobile: one toolbar row, no page scroll, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);

    for (const view of ['Agenda', 'Day', 'Week', 'Month'] as const) {
      await selectView(page, view);
      await page.waitForTimeout(800);
      await assertNoHorizontalOverflow(page);
    }

    const toolbar = await page.getByTestId('calendar-toolbar').boundingBox();
    expect(toolbar!.height, 'the toolbar must stay a single row').toBeLessThanOrEqual(56);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('mobile: the toolbar controls meet the 44px touch target', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);

    // The rail's 30px mini-calendar cells are deliberately excluded: the rail
    // only exists at lg and up, i.e. pointer-fine, and every calendar this
    // borrows from uses ~30px cells there.
    await assertTouchTargetSize(page, '[data-testid="cal-prev"]');
    await assertTouchTargetSize(page, '[data-testid="cal-next"]');
    await assertTouchTargetSize(page, '[data-testid="cal-view-switch"]');
  });

  test('mobile: month becomes a compact grid plus a day list, and tapping a day is free', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await selectView(page, 'Month');
    await page.waitForTimeout(2500);

    const cells = await page.getByTestId('month-cell').count();
    expect([35, 42]).toContain(cells);

    // The selected day is local component state, so browsing a loaded month
    // must not touch the network.
    // Scoped to the schedule endpoint: unrelated background polling
    // (notifications, nav badges) would otherwise make this flaky.
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/timetable/my-schedule')) calls.push(r.url());
    });

    await page.getByTestId('month-cell').nth(10).click();
    await page.getByTestId('month-cell').nth(17).click();
    await page.waitForTimeout(1000);

    expect(calls, `tapping a day should be free: ${calls.join(', ')}`).toHaveLength(0);
  });
});
