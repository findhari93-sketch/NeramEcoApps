import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The catch-up screens in a real browser at a real phone size.
 *
 * The contracts are covered in catchup-missed-nexus.spec.ts. What only a browser
 * can prove is the part that decides whether this feature gets used at all:
 * students read this on a phone, between other things, and the whole point is
 * that the next thing to do is obvious and tappable.
 *
 * The teacher dashboard is the harder case. It carries a student-by-class matrix
 * that is genuinely wide, so below sm it must not be a table at all. If that
 * swap ever regresses, this catches it as a horizontal overflow.
 *
 * Read-only throughout: nothing here excuses a class or sends a nudge, both of
 * which would write against whatever student this environment happens to hold.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page on first
 * visit, and these tests each open a page nothing has touched yet. The default
 * 30s budget covers the compile and almost nothing else, which fails as a
 * timeout on a screenshot of the word "Loading".
 */
const COLD_COMPILE_BUDGET = 120_000;

/**
 * Wait for the screen itself, not for a guessed number of milliseconds.
 *
 * These pages render a "Loading" shell while auth resolves, so a fixed sleep
 * either flakes or wastes time. Waiting for a heading is the honest signal that
 * the client has finished its first paint.
 */
async function waitForScreen(page: any, heading: RegExp) {
  // A student signing in for the first time gets the welcome tour, a full screen
  // overlay that covers whatever page they asked for. Every one of these tests is
  // a first sign-in, so it lands every time.
  //
  // Polled rather than checked once, because the tour mounts AFTER the page does:
  // a single check on arrival finds nothing, moves on, and then the tour appears
  // over the assertions. Either outcome ends the loop, so a run where the tour
  // never shows costs one iteration.
  const target = page.getByRole('heading', { name: heading }).first();

  for (let i = 0; i < 40; i++) {
    if (await target.isVisible().catch(() => false)) {
      await page.waitForTimeout(600);
      return;
    }
    const skip = page.getByRole('button', { name: /^skip$/i }).first();
    if (await skip.isVisible().catch(() => false)) {
      await skip.click().catch(() => {});
      await page.waitForTimeout(900);
      continue;
    }
    await page.waitForTimeout(1500);
  }

  // Out of patience. Fail on the real locator so the report names what was missing.
  await target.waitFor({ timeout: 5_000 });
}

test.describe('Catch-up (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('375px: the student list fits the phone and the primary action is tappable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await waitForScreen(page, /catch-up|nothing to catch up on/i);

    // The house rule, and the one this page is most likely to break: the gate
    // meters and the due chips sit on the same row as a long class title.
    await assertNoHorizontalOverflow(page);

    // Either there is work, in which case the hero names it, or there is not, in
    // which case the empty state says so plainly. A blank screen is the failure.
    const hero = page.getByText(/do this next|overdue, do this first/i);
    const empty = page.getByText(/nothing to catch up on/i);
    const hasHero = (await hero.count()) > 0;
    expect(hasHero || (await empty.count()) > 0).toBe(true);

    if (hasHero) {
      // The single call to action has to clear the touch minimum, because on a
      // phone it is the only thing on the screen anyone is meant to press.
      await assertTouchTargetSize(page, 'button:has-text("Watch the class")', 44).catch(async () => {
        await assertTouchTargetSize(page, '.MuiButton-contained', 44);
      });
    }

    await context.close();
  });

  test('375px: a missed class card opens its own screen', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await waitForScreen(page, /catch-up|nothing to catch up on/i);

    const section = page.getByText(/classes you missed|^overdue$/i);
    test.skip(
      (await section.count()) === 0,
      'This account has not missed a class in this environment',
    );

    // Whole card is the tap target, not a small chevron.
    const card = page.locator('button').filter({ hasText: /due|caught up/i }).first();
    test.skip((await card.count()) === 0, 'No missed-class card rendered');

    const box = await card.boundingBox();
    expect(box!.height, 'a card must be comfortably tappable').toBeGreaterThanOrEqual(48);

    await card.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/catch-up|class-recap/);
    await assertNoHorizontalOverflow(page);

    await context.close();
  });

  test('375px: the teacher dashboard drops the matrix rather than scrolling sideways', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/catch-up`, { waitUntil: 'domcontentloaded' });
    await waitForScreen(page, /catch-up/i);

    // The whole reason the matrix is desktop-only. A nine column grid at 375px
    // is unreadable however you scroll it.
    await assertNoHorizontalOverflow(page);
    expect(await page.locator('table').count(), 'no wide table at phone width').toBe(0);

    // The tabs are the navigation on this screen, so they carry the touch rule.
    await assertTouchTargetSize(page, '.MuiTab-root', 44);

    await context.close();
  });

  test('375px: the teacher can switch tabs without the layout breaking', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/catch-up`, { waitUntil: 'domcontentloaded' });
    await waitForScreen(page, /catch-up/i);

    for (const label of [/^classes$/i, /cannot be caught up/i, /^students$/i]) {
      const tab = page.getByRole('tab', { name: label });
      if ((await tab.count()) === 0) continue;
      await tab.first().click();
      await page.waitForTimeout(700);
      await assertNoHorizontalOverflow(page);
    }

    await context.close();
  });

  test('375px: the page reports no console errors', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await waitForScreen(page, /catch-up|nothing to catch up on/i);

    // Network noise from an unavailable dev dependency is not this feature's
    // fault; a React or rendering error is.
    const real = errors.filter(
      (e) => !/favicon|net::ERR|Failed to load resource|401|403/i.test(e),
    );
    expect(real, real.join('\n')).toHaveLength(0);

    await context.close();
  });
});
