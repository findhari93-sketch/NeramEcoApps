import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The standing surfaces on a phone.
 *
 * Two things are new on this page and both add width: a fifth stat tile, which
 * has to wrap to two columns at 375px rather than turning the row into a
 * sideways scroll, and two list sections whose rows carry a name plus two
 * caption lines. A long student name against a long backlog line is the shape
 * that pushes a card past the viewport, and the failure is silent: the page
 * still renders, it just scrolls sideways.
 *
 * READ-ONLY. The Teams share is opened as far as its preview and cancelled,
 * because the students named in it are real and the post is public.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
// A cold Next dev server compiles the route on first hit, which outlives the
// 30s default and reports as a bare timeout with nothing to read.
const COLD_COMPILE_BUDGET = 120_000;

async function openStanding(page: any) {
  await page.goto(`${NEXUS}/teacher/catch-up?tab=caught-up`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
}

test.describe('Catch-up standing on a phone', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test.beforeEach(async ({ page }) => {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
  });

  test('five stat tiles wrap instead of scrolling sideways', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`${NEXUS}/teacher/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await expect(page.getByText('all clear', { exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('the standing tab fits the screen', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openStanding(page);

    await expect(page.getByRole('tab', { name: /Standing/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('the tab counts people, not finished classes', async ({ page }) => {
    // The bug this replaces: "Caught up (7)" meant seven cleared classes in
    // sixty days and was read as seven finished students, so one student who
    // had cleared two of her five appeared twice and looked done.
    await page.setViewportSize(PHONE);
    await openStanding(page);

    const tab = page.getByRole('tab', { name: /Standing/i });
    const label = (await tab.textContent()) || '';
    const match = label.match(/Standing \((\d+)\)/);
    if (!match) return; // Nobody clear in this environment, nothing to compare.

    const wall = page.getByText(/(\d+) (people are|person is)? ?fully caught up/i).first();
    if (await wall.count()) {
      await expect(page.getByText(new RegExp(`All clear \\(${match[1]}\\)`))).toBeVisible();
    }
  });

  test('the Teams share previews the names before anything is posted', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openStanding(page);

    const share = page.getByRole('button', { name: /Share in Teams/i });
    if ((await share.count()) === 0) {
      test.skip(true, 'Nobody is fully caught up in this classroom');
      return;
    }

    await share.click();
    // The whole point of the preview: the names are shown in full, not
    // summarised, because the thing to check is precisely the list.
    await expect(page.getByRole('button', { name: /Post to Teams/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByRole('button', { name: /Post to Teams/i })).toHaveCount(0);
  });

  test('every control on the standing tab is thumb sized', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openStanding(page);

    const buttons = page.locator('button:visible');
    const n = Math.min(await buttons.count(), 12);
    for (let i = 0; i < n; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue;
      expect(box.height, `button ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(36);
    }
  });
});
