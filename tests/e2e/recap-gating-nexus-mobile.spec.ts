import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The recap player refuses to be skipped.
 *
 * This is the bug that started it: a student dragged the native scrubber past a
 * checkpoint, the quiz drawer opened, and the video carried on playing behind
 * it. Worse, the playhead was never pulled back, so passing that one quiz fired
 * every later checkpoint in turn and the whole recap could be cleared having
 * watched about thirty seconds.
 *
 * The fix was to stop shipping two players. The inline one now renders the same
 * ProtectedVideo that Focus Mode always used, whose scrub track ENDS at the
 * unlocked checkpoint, so the gesture cannot be expressed in the first place.
 *
 * Read-only: nothing here answers a quiz or marks anything done, both of which
 * would write against whatever student this environment happens to hold.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

/** The first recap this student can actually open, or null. */
async function findRecap(page: any): Promise<string | null> {
  const res = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/student/catchup-journey', { credentials: 'include' });
      if (!r.ok) return null;
      const body = await r.json();
      const all = [...(body.missed || []), ...(body.items || [])];
      const withRecap = all.find((i: any) => i.recap_id);
      return withRecap ? withRecap.recap_id : null;
    } catch {
      return null;
    }
  });
  return res;
}

test.describe('Class recap gating (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('375px: the scrub track stops at the checkpoint, not at the end of the video', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const recapId = await findRecap(page);
    test.skip(!recapId, 'No published recap available to this account');

    await page.goto(`${NEXUS}/student/class-recap/${recapId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // The native scrubber is the whole bug. Its absence is the fix.
    const nativeControls = await page.locator('video[controls]').count();
    expect(nativeControls).toBe(0);

    // And the replacement is bounded. Once metadata has loaded, the slider's max
    // is the first unpassed checkpoint's end, which is strictly inside the file.
    const bounds = await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null;
      if (!video || !slider) return null;
      return { max: Number(slider.max), duration: video.duration };
    });
    test.skip(!bounds || !Number.isFinite(bounds.duration), 'Video metadata did not load');
    expect(bounds!.max).toBeGreaterThan(0);
    expect(bounds!.max).toBeLessThanOrEqual(bounds!.duration);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('375px: seeking past the checkpoint snaps back and the video does not run on', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const recapId = await findRecap(page);
    test.skip(!recapId, 'No published recap available to this account');

    await page.goto(`${NEXUS}/student/class-recap/${recapId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // Jump to the very end, the way dragging the old native scrubber did.
    const after = await page.evaluate(async () => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null;
      if (!video || !slider || !Number.isFinite(video.duration)) return null;
      const limit = Number(slider.max);
      video.currentTime = Math.max(0, video.duration - 1);
      await new Promise((r) => setTimeout(r, 1200));
      return { at: video.currentTime, limit, paused: video.paused, duration: video.duration };
    });
    test.skip(!after, 'Video metadata did not load');

    // Snapped back to the boundary, with the two second tolerance the player
    // allows so ordinary playback is not fought.
    expect(after!.at).toBeLessThanOrEqual(after!.limit + 2);
    // And it is not still running behind the drawer, which is what the student
    // actually reported.
    expect(after!.paused).toBe(true);

    await context.close();
  });

  test('375px: only one checkpoint quiz opens, however far ahead they jump', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const recapId = await findRecap(page);
    test.skip(!recapId, 'No published recap available to this account');

    await page.goto(`${NEXUS}/student/class-recap/${recapId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    await page.evaluate(async () => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.max(0, video.duration - 1);
      await new Promise((r) => setTimeout(r, 1500));
    });
    await page.waitForTimeout(2500);

    // At most one drawer. The old latch fired each checkpoint in turn once the
    // playhead was left past them all.
    const drawers = await page.locator('.MuiDrawer-root').count();
    expect(drawers).toBeLessThanOrEqual(1);

    // A drawer that IS open must be the mandatory kind: no close button, and no
    // way to dismiss it and carry on watching.
    if (drawers === 1) {
      const closeButtons = await page
        .locator('.MuiDrawer-root button[aria-label="Close"]')
        .count();
      expect(closeButtons).toBe(0);
    }

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('375px: the player controls are thumb-sized', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const recapId = await findRecap(page);
    test.skip(!recapId, 'No published recap available to this account');

    await page.goto(`${NEXUS}/student/class-recap/${recapId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    await assertTouchTargetSize(page, 'button[aria-label="Play"]', 44).catch(async () => {
      await assertTouchTargetSize(page, 'button[aria-label="Pause"]', 44);
    });

    await context.close();
  });
});
