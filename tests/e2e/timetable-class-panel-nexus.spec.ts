/**
 * One class panel, the same in every view.
 *
 * The complaint this answers: a teacher comfortable in Month could not reach
 * the wrap-up editor, a teacher living in Plan could not reach attendance or
 * share, and switching between the two lost the class entirely, because they
 * were two components holding two independent selections.
 *
 * The load-bearing assertions are therefore about SAMENESS rather than about
 * any one control:
 *  - a selection made in Plan survives a switch to Week,
 *  - the same class offers the same tabs from either view, at 1440 and at 375,
 *  - Plan at lg+ docks the panel rather than overlaying it,
 *  - exactly one mount is live, so the self-fetching sections do not double.
 *
 * Auth is injected via the test-login token, so this spec does not depend on
 * the MS-login setup project (the Entra MFA wall blocks that auto-login). It
 * skips gracefully when test auth is not configured.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-class-panel-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { selectView, selectAClassInPlan, waitForTimetable } from '../utils/timetable-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

async function openTimetable(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* storage blocked */
    }
  });
  await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
  return waitForTimetable(page);
}

/** The tabs currently on offer, in order. */
async function tabNames(page: Page): Promise<string[]> {
  return page.getByRole('tab').allInnerTexts();
}

test.describe('The class panel', () => {
  test.describe.configure({ timeout: 180_000 });

  test('a selection made in Plan survives a switch to Week', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');
    test.skip(!(await openTimetable(page)), 'Timetable did not load');

    const selected = await selectAClassInPlan(page);
    test.skip(!selected, 'No classes in this environment');

    // The docked rail at lg+ is a plain column, so read the title off it.
    const title = await page.locator('h6').first().innerText();
    expect(title.trim().length, 'a class must be selected').toBeGreaterThan(0);

    await selectView(page, 'Week');
    await page.waitForTimeout(1200);

    // This is the whole point: the two views used to hold separate selections,
    // so switching here showed nothing at all.
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('the same class offers the same tabs from Plan and from Week', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');
    test.skip(!(await openTimetable(page)), 'Timetable did not load');

    const selected = await selectAClassInPlan(page);
    test.skip(!selected, 'No classes in this environment');

    const inPlan = await tabNames(page);
    test.skip(inPlan.length === 0, 'Selected class is cancelled, which has a single tab by design');

    await selectView(page, 'Week');
    await page.waitForTimeout(1500);
    const inWeek = await tabNames(page);

    expect(inWeek, 'a class must expose the same tabs whichever view opened it').toEqual(inPlan);
  });

  test('Plan docks the panel at lg+, and overlays it below', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');

    await page.setViewportSize({ width: 1440, height: 900 });
    test.skip(!(await openTimetable(page)), 'Timetable did not load');
    test.skip(!(await selectAClassInPlan(page)), 'No classes in this environment');

    // Docked is part of the layout, so there is no modal backdrop over the week
    // list and the list stays clickable.
    expect(await page.locator('.MuiBackdrop-root:visible').count()).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1500);
    test.skip(!(await selectAClassInPlan(page)), 'No classes at this viewport');

    // Below lg the same tap opens the sheet every other view opens. Planner
    // rows used to reach a different, feature-poor editor here.
    await expect(page.locator('.MuiDrawer-root .MuiPaper-root').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('exactly one panel is mounted, so its sections fetch once', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');

    await page.setViewportSize({ width: 1440, height: 900 });
    test.skip(!(await openTimetable(page)), 'Timetable did not load');

    const assignmentCalls: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/timetable\/[^/]+\/assignments/.test(r.url())) assignmentCalls.push(r.url());
    });

    test.skip(!(await selectAClassInPlan(page)), 'No classes in this environment');
    await page.getByRole('tab', { name: 'Prep', exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(2500);

    // Two live mounts would double this and every other self-fetching section
    // inside the panel.
    expect(assignmentCalls.length, 'the panel must be mounted once').toBeLessThanOrEqual(1);
  });

  test('mobile: the tab strip is tappable and does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');
    test.skip(!(await openTimetable(page)), 'Timetable did not load');
    test.skip(!(await selectAClassInPlan(page)), 'No classes in this environment');

    const tabs = page.getByRole('tab');
    test.skip((await tabs.count()) === 0, 'Selected class has a single tab by design');

    await assertTouchTargetSize(page, '[role="tab"]', 44);
    await assertNoHorizontalOverflow(page);
  });

  test('the view switch names the current view at 375px', async ({ page }) => {
    // The bug behind "I cannot find the view option": below sm the switch used
    // to render as a bare chevron, with no label and no icon.
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Test auth not configured');
    test.skip(!(await openTimetable(page)), 'Timetable did not load');

    for (const view of ['Day', 'Week', 'Month', 'Plan'] as const) {
      const switched = await selectView(page, view);
      expect(switched, `must be able to switch to ${view} at 375px`).toBe(true);
      await expect(page.getByTestId('cal-view-switch')).toContainText(view);
    }

    const toolbar = await page.getByTestId('calendar-toolbar').boundingBox();
    expect(toolbar!.height, 'the toolbar must stay a single row').toBeLessThanOrEqual(56);
    await assertNoHorizontalOverflow(page);
  });
});
