import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { openTeacherCatchup, skipWelcome } from '../utils/catchup-helpers';

/**
 * The catch-up automation at a real phone size.
 *
 * Teachers prepare classes between other classes, on a phone, which is the only
 * reason the five-button version failed: nobody presses five buttons per class
 * on a 375px screen. So the thing worth proving in a browser is that the one
 * button is there, is reachable, and does not push the screen sideways while a
 * run is in progress.
 *
 * Read-only. Nothing here presses Generate or Prepare: a real run spends four to
 * six Gemini calls on a key all four apps share, and writes checkpoints against
 * whatever classroom this environment happens to hold.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page on first
 * visit, and every test here opens a page nothing has touched yet. The default
 * 30s budget covers the compile and almost nothing else.
 */
const COLD_COMPILE_BUDGET = 120_000;

/** Wait for first paint rather than a guessed number of milliseconds. */
async function settle(page: any, marker: RegExp) {
  for (let i = 0; i < 30; i++) {
    if (await page.getByText(marker).first().isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      return true;
    }
    await page.waitForTimeout(1200);
  }
  return false;
}

test.describe('Catch-up automation (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('375px: the Calendar view offers the backlog run and fits the phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
    await skipWelcome(page);

    // The old ?tab=classes link, on purpose: it is what the recap editor and
    // older notifications carry, and it must land on the Calendar.
    await openTeacherCatchup(page, 'tab=classes');
    await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();

    // The house rule. The month bar carries a title, two arrows, the view toggle
    // and a menu, all on one row at 375px.
    await assertNoHorizontalOverflow(page);

    // The backlog run moved off the page into the "More recap actions" menu.
    const more = page.getByRole('button', { name: 'More recap actions' });
    await expect(more).toBeVisible();
    await assertTouchTargetSize(page, '[aria-label="More recap actions"]', 44);
    await more.click();
    const prepare = page.getByRole('menuitem', { name: /Prepare missing classes/ });
    await expect(prepare, 'the backlog run must be offered here').toHaveCount(1);
    await expect(page.getByRole('menuitem', { name: /Recap from a link/ })).toHaveCount(1);
    const box = await prepare.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Closed without pressing: a real run spends Gemini quota.
    await page.keyboard.press('Escape');
    await expect(prepare).toHaveCount(0);

    await context.close();
  });

  test('375px: the recap editor leads with Generate and publish', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
    await skipWelcome(page);

    // Reached through the List mode of the Calendar rather than a guessed recap
    // id, so this tests the route a teacher actually takes. Walks back up to six
    // months to find a class with a recap to open.
    let open = null as any;
    const now = new Date();
    for (let back = 0; back < 6 && !open; back++) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      await openTeacherCatchup(page, `view=calendar&month=${month}&display=list`);
      await expect(page.getByRole('group', { name: 'Filter classes' })).toBeVisible({ timeout: 60_000 });
      const btn = page.getByRole('button', { name: /edit recap|continue draft/i }).first();
      if (await btn.count()) open = btn;
    }
    test.skip(!open, 'No class in the last six months has a recap to open in this environment');

    await open.click();
    const editor = await settle(page, /generate and publish/i);
    expect(editor, 'the editor must lead with the one-press action').toBe(true);

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:has-text("Generate and publish")', 44);

    // The way back has to name where it goes. router.back() used to send a
    // teacher who arrived from a notification link nowhere useful.
    await expect(page.getByRole('button', { name: /back to catch-up/i })).toHaveCount(1);

    await context.close();
  });

  test('375px: a student with no guided recap stays inside Nexus', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /catch-up|nothing to catch up on/i);
    test.skip(!ready, 'Catch-up screen did not render in this environment');

    // The regression, stated as a rule for the whole screen: no anchor may open
    // a new tab. The old fallback did exactly that, to youtube.com, dropping
    // every checkpoint, the watermark and the watch record in one press.
    expect(
      await page.locator('a[target="_blank"]').count(),
      'nothing here may take a student out of the app',
    ).toBe(0);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
