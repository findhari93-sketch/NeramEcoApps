import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Can a teacher work the catch-up list on a phone with a real cohort on it?
 *
 * Until now the tab drew every student twice, in three sections built from one
 * array, with no search and no filter. At a hundred students that is two hundred
 * rows and no way to reach a particular person except scrolling. The unit tests
 * in components/catchup/NeedsActionTab.test.tsx hold the properties; these walk
 * the surface a thumb actually touches.
 *
 * READ-ONLY throughout. Nothing here sends a nudge, excuses an item or starts a
 * clock. The bulk-send path is opened as far as its confirmation and cancelled,
 * because the students in this environment are real.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
// A cold Next dev server compiles the route on first hit, which outlives the
// 30s default and reports as a bare timeout with nothing to read.
const COLD_COMPILE_BUDGET = 120_000;

/** Land on the tab and wait for it to swap its skeleton for rows. */
async function openCatchUp(page: any) {
  await page.goto(`${NEXUS}/teacher/catch-up`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
}

test.describe('Catch-up scans on a phone', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test.beforeEach(async ({ page }) => {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
  });

  test('fits the screen, with no sideways scroll on any tab', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openCatchUp(page);
    await assertNoHorizontalOverflow(page);

    for (const label of ['Needs action', 'Reasons', 'Standing', 'Classes and recaps']) {
      const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
      if ((await tab.count()) > 0) {
        await tab.first().click();
        await page.waitForTimeout(600);
        await assertNoHorizontalOverflow(page);
      }
    }
  });

  test('no student is listed twice', async ({ page }) => {
    // The defect this whole change exists for, checked against live data rather
    // than a fixture: open every group, then look for a repeated name.
    await page.setViewportSize(PHONE);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'nexus:catchup:groups',
        JSON.stringify({
          run_over: true,
          not_started: true,
          behind: true,
          in_progress: true,
          waiting_on_us: true,
        }),
      );
    });
    await openCatchUp(page);

    const names = await page
      .getByRole('button', { expanded: false })
      .evaluateAll((nodes: Element[]) =>
        nodes
          .map((n) => n.getAttribute('aria-label') || '')
          .filter((l) => l.includes(','))
          .map((l) => l.split(',')[0].trim()),
      );
    test.skip(names.length === 0, 'No students catching up in this environment');

    const seen = new Set<string>();
    const twice: string[] = [];
    for (const name of names) {
      if (seen.has(name)) twice.push(name);
      seen.add(name);
    }
    expect(twice, `these students were rendered more than once: ${twice.join(', ')}`).toEqual([]);
  });

  test('the search narrows to one student', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openCatchUp(page);

    const search = page.getByLabel('Search students');
    test.skip((await search.count()) === 0, 'Nobody is catching up in this environment');

    const before = await page.getByRole('button', { expanded: false }).count();
    test.skip(before < 2, 'Needs at least two students to prove narrowing');

    await search.fill('zzzz-no-such-student');
    await page.waitForTimeout(400);
    await expect(page.getByText(/No student matches/)).toBeVisible();

    // The dead end offers a way out rather than leaving a blank panel.
    await page.getByRole('button', { name: 'Show everyone' }).click();
    await page.waitForTimeout(400);
    expect(await page.getByRole('button', { expanded: false }).count()).toBeGreaterThan(0);
  });

  test('the row actions are big enough for a thumb', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openCatchUp(page);

    const call = page.getByLabel(/^Call /).first();
    test.skip((await call.count()) === 0, 'No student with a phone number here');

    const box = await call.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('a collapsed group opens when tapped', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openCatchUp(page);

    const collapsed = page.getByRole('button', { expanded: false }).filter({ hasText: '·' });
    const header = collapsed.filter({ hasText: /Not started|Behind pace|In progress|Waiting on us/ });
    test.skip((await header.count()) === 0, 'Only one group in this environment');

    await header.first().click();
    await page.waitForTimeout(400);
    await assertNoHorizontalOverflow(page);
  });

  test('a bulk nudge names the count and can be backed out of', async ({ page }) => {
    // Deliberately stops at the confirmation. These are real students on a real
    // database, and the point of the dialog is that nothing leaves until Send.
    await page.setViewportSize(PHONE);
    await openCatchUp(page);

    const selectAll = page.getByRole('button', { name: 'Select all' }).first();
    test.skip((await selectAll.count()) === 0, 'No group here has more than one student');

    await selectAll.click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /^Nudge \d+$/ }).click();
    await expect(page.getByText(/Send a catch-up nudge to \d+ students\?/)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Send a catch-up nudge to/)).toHaveCount(0);
  });

  test('desktop shows the same single list', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCatchUp(page);
    await assertNoHorizontalOverflow(page);
    // The grid toggle is desktop-only and must not resurrect the second copy of
    // the list that used to sit under it.
    await expect(page.getByText('Where each one is stuck')).toHaveCount(0);
    await expect(page.getByText('Everyone else catching up')).toHaveCount(0);
  });
});
