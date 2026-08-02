import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

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

  test('375px: the Classes tab offers the backlog run and fits the phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/catch-up?tab=classes`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /prepare missing classes|nothing outstanding|recap/i);
    test.skip(!ready, 'Catch-up workspace did not render in this environment');

    // The house rule. This tab carries a chip row, a progress panel and a class
    // list, all of which want to be wider than a phone.
    await assertNoHorizontalOverflow(page);

    const prepare = page.getByRole('button', { name: /prepare missing classes/i });
    await expect(prepare, 'the backlog run must be offered here').toHaveCount(1);
    await assertTouchTargetSize(page, 'button:has-text("Prepare missing classes")', 40);

    await context.close();
  });

  test('375px: the recap editor leads with Generate and publish', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    // Reached through the workspace rather than a guessed recap id, so this
    // tests the route a teacher actually takes.
    await page.goto(`${NEXUS}/teacher/catch-up?tab=classes`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /prepare missing classes|nothing outstanding/i);
    test.skip(!ready, 'Catch-up workspace did not render in this environment');

    const open = page.getByRole('button', { name: /edit recap|continue draft/i }).first();
    test.skip((await open.count()) === 0, 'No class in this environment has a recap to open');

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
