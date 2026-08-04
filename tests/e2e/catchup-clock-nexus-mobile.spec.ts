import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * One clock at a time, started by the student.
 *
 * The screen this replaces showed four missed classes, every one of them red,
 * every one "Was due", because a missed class's deadline was the day the course
 * next ran and every July class viewed in August is therefore overdue on sight.
 * A student cannot act on four simultaneous failures.
 *
 * What these lock down: nothing carries a deadline until it is started, at most
 * one thing does at a time, and nothing is padlocked.
 *
 * Read-only. Nothing here presses Start, because that would move a real
 * student's clock in whatever environment this runs against.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

/** The catch-up payload straight from the API, so assertions are on data. */
async function readBacklog(page: any) {
  return page.evaluate(async () => {
    try {
      const r = await fetch('/api/student/catchup-journey', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  });
}

test.describe('Catch-up clock (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('at most one class carries a deadline', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await readBacklog(page);
    test.skip(!body, 'Catch-up API unavailable');

    const all = [...(body.missed || []), ...(body.items || [])];
    test.skip(all.length === 0, 'This account owes nothing in this environment');

    // The invariant. Under the old model this could be every open item at once.
    const withDeadline = all.filter((i: any) => i.due_on);
    expect(withDeadline.length).toBeLessThanOrEqual(1);

    const active = all.filter((i: any) => i.active);
    expect(active.length).toBeLessThanOrEqual(1);

    // And a deadline only ever belongs to the running clock.
    for (const item of withDeadline) expect(item.active).toBe(true);

    await context.close();
  });

  test('an unstarted class is never overdue', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await readBacklog(page);
    test.skip(!body, 'Catch-up API unavailable');
    const all = [...(body.missed || []), ...(body.items || [])];
    test.skip(all.length === 0, 'This account owes nothing in this environment');

    for (const item of all) {
      if (!item.active) expect(item.overdue).toBe(false);
    }

    // And it says what they will GET rather than what they have already lost.
    const waiting = all.find((i: any) => i.status === 'waiting' && !i.active);
    if (waiting) {
      expect(waiting.window_days).toBeGreaterThan(0);
      await expect(page.getByText(/days once you start/i).first()).toBeVisible();
    }

    await context.close();
  });

  test('exactly one class is recommended, and nothing is padlocked', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await readBacklog(page);
    test.skip(!body, 'Catch-up API unavailable');
    const all = [...(body.missed || []), ...(body.items || [])];
    const startable = all.filter((i: any) => i.status === 'waiting' || i.status === 'active');
    test.skip(startable.length === 0, 'Nothing startable in this environment');

    expect(all.filter((i: any) => i.recommended).length).toBe(1);

    // The chain is gone. `locked` was a real status; now nothing has it, and no
    // item is refused because an earlier one is unfinished.
    expect(all.some((i: any) => i.status === 'locked')).toBe(false);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a class the student was on the roster for is suggested before the old backlog', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await readBacklog(page);
    test.skip(!body, 'Catch-up API unavailable');

    const missedOpen = (body.missed || []).filter((i: any) => i.status === 'waiting');
    const backlogOpen = (body.items || []).filter((i: any) => i.status === 'waiting');
    test.skip(
      missedOpen.length === 0 || backlogOpen.length === 0,
      'Needs both a missed live class and a late-joiner backlog',
    );

    // Unless a clock is already running, which outranks everything.
    const anyActive = [...(body.missed || []), ...(body.items || [])].some((i: any) => i.active);
    test.skip(anyActive, 'A clock is already running, which is recommended ahead of order');

    const recommended = [...(body.missed || []), ...(body.items || [])].find(
      (i: any) => i.recommended,
    );
    expect(recommended?.chained).toBe(false);

    await context.close();
  });

  test('the per-class screen offers a window before it asks for anything', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await readBacklog(page);
    test.skip(!body, 'Catch-up API unavailable');
    const all = [...(body.missed || []), ...(body.items || [])];
    const target = all.find((i: any) => i.status === 'waiting' && !i.active);
    test.skip(!target, 'Nothing unstarted in this environment');

    await page.goto(`${NEXUS}/student/timetable/${target.scheduled_class_id}/catch-up`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(5000);

    // Says what they get, and does not call an untouched class overdue.
    const offer = page.getByText(/once you start, you get|you can start this one instead/i);
    await expect(offer.first()).toBeVisible({ timeout: 20_000 });
    expect(await page.getByText(/this one has run over/i).count()).toBe(0);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
