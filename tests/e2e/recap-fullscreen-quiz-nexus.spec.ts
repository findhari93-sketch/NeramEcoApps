import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The checkpoint quiz has to be drawn ON the video while the player is
 * fullscreen.
 *
 * The bug: QuizModal took a `container` so the quiz could be portalled into the
 * player's own element, which is the only place a fullscreen browser paints. The
 * mobile branch passed it. The desktop branch hardcoded its ModalProps and
 * dropped it. So on a desktop browser in native fullscreen a student reached a
 * checkpoint, the video paused, "Finish this section before skipping ahead"
 * flashed, and then nothing: the quiz existed on document.body, outside the
 * fullscreen subtree, and was never painted. No questions, no way forward, no
 * explanation.
 *
 * What is honest to test here: real native fullscreen is not reliably drivable
 * in a headless browser, and faking `document.fullscreenElement` would be
 * testing the fake. The CSS fallback is a genuine production path, the one every
 * iPhone takes, and it makes the same decision through the same code: the player
 * publishes its container, QuizSurface portals into it. So this drives that,
 * by removing Element.requestFullscreen before the player mounts.
 *
 * The native-only half of the decision (`document.fullscreenElement === node`)
 * is covered in apps/nexus/src/components/video/NeramVideoPlayer.test.tsx, where
 * it can be stubbed truthfully.
 *
 * Read-only: nothing here answers a quiz or marks anything done, both of which
 * would write against whatever student this environment happens to hold.
 *
 * Run: pnpm test:e2e tests/e2e/recap-fullscreen-quiz-nexus.spec.ts --project=nexus-chrome --no-deps
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const COLD_COMPILE_BUDGET = 120_000;

/** The first recap this student can actually open, or null. */
async function findRecap(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
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
}

/**
 * Opens a recap with the Fullscreen API removed, so the fullscreen button takes
 * the CSS fallback. The init script runs before any page script, which matters:
 * useFullscreen reads `typeof node.requestFullscreen === 'function'` at the
 * moment of the click, not at mount, but removing it late would race the load.
 */
async function openRecapWithoutNativeFullscreen(page: Page): Promise<string | null> {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const recapId = await findRecap(page);
  if (!recapId) return null;

  await page.goto(`${NEXUS}/student/class-recap/${recapId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  return recapId;
}

/** Drive playback to the first checkpoint the way the boundary is normally met. */
async function runToCheckpoint(page: Page): Promise<boolean> {
  const ok = await page.evaluate(async () => {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video || !Number.isFinite(video.duration)) return false;
    video.currentTime = Math.max(0, video.duration - 1);
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  });
  await page.waitForTimeout(2500);
  return ok;
}

test.describe('Checkpoint quiz in fullscreen', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('desktop: the quiz is drawn inside the player, not on a body the browser is not painting', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    const recapId = await openRecapWithoutNativeFullscreen(page);
    test.skip(!recapId, 'No published recap available to this account');

    const fullscreen = page.locator('button[aria-label="Fullscreen"]').first();
    test.skip((await fullscreen.count()) === 0, 'Player did not mount');
    await fullscreen.click();
    await page.waitForTimeout(500);

    const reached = await runToCheckpoint(page);
    test.skip(!reached, 'Video metadata did not load');

    const quiz = page.locator('[role="dialog"][data-quiz-layout]');
    test.skip((await quiz.count()) === 0, 'This recap has no checkpoint left to meet');

    await expect(quiz.first()).toBeVisible();

    // The assertion the bug was about: the panel's ancestor chain reaches the
    // player container, so it is inside whatever subtree fullscreen paints.
    const insidePlayer = await quiz.first().evaluate((el) => {
      const video = document.querySelector('video');
      const player = video?.parentElement?.parentElement ?? null;
      return !!player && player.contains(el);
    });
    expect(insidePlayer).toBe(true);

    // Wide surface, so the paused frame stays visible beside the questions.
    await expect(quiz.first()).toHaveAttribute('data-quiz-layout', 'side');

    await context.close();
  });

  test('desktop: typing an answer does not drive the video underneath it', async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    const recapId = await openRecapWithoutNativeFullscreen(page);
    test.skip(!recapId, 'No published recap available to this account');

    const fullscreen = page.locator('button[aria-label="Fullscreen"]').first();
    test.skip((await fullscreen.count()) === 0, 'Player did not mount');
    await fullscreen.click();
    await page.waitForTimeout(500);

    const reached = await runToCheckpoint(page);
    test.skip(!reached, 'Video metadata did not load');

    const quiz = page.locator('[role="dialog"][data-quiz-layout]');
    test.skip((await quiz.count()) === 0, 'This recap has no checkpoint left to meet');

    // The panel is a DOM child of the player now, unlike the body portal it
    // replaced, so its keystrokes bubble into the player's shortcut listener.
    // Space is the one that hurts: it would start the video behind the quiz.
    const before = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return { paused: v?.paused ?? true, at: v?.currentTime ?? 0 };
    });
    await quiz.first().click();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return { paused: v?.paused ?? true, at: v?.currentTime ?? 0 };
    });

    expect(after.paused).toBe(before.paused);
    expect(Math.abs(after.at - before.at)).toBeLessThan(1);

    await context.close();
  });

  test('375px: the quiz becomes a sheet on the video, and the page still does not scroll sideways', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    const recapId = await openRecapWithoutNativeFullscreen(page);
    test.skip(!recapId, 'No published recap available to this account');

    const fullscreen = page.locator('button[aria-label="Fullscreen"]').first();
    test.skip((await fullscreen.count()) === 0, 'Player did not mount');
    await fullscreen.click();
    await page.waitForTimeout(500);

    const reached = await runToCheckpoint(page);
    test.skip(!reached, 'Video metadata did not load');

    const quiz = page.locator('[role="dialog"][data-quiz-layout]');
    test.skip((await quiz.count()) === 0, 'This recap has no checkpoint left to meet');

    await expect(quiz.first()).toBeVisible();
    // 375px wide leaves no room for a panel beside the picture.
    await expect(quiz.first()).toHaveAttribute('data-quiz-layout', 'sheet');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the pause at a checkpoint is explained even before the questions arrive', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    // The quiz fetch held open, so the gap between "playback stopped" and "here
    // are the questions" is the whole test. That gap used to be a frozen frame
    // and nothing else, and in fullscreen it was the entire experience.
    await page.route('**/sections/*/quiz', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await new Promise((r) => setTimeout(r, 6000));
      return route.continue();
    });

    const recapId = await openRecapWithoutNativeFullscreen(page);
    test.skip(!recapId, 'No published recap available to this account');

    const fullscreen = page.locator('button[aria-label="Fullscreen"]').first();
    test.skip((await fullscreen.count()) === 0, 'Player did not mount');
    await fullscreen.click();
    await page.waitForTimeout(500);

    const reached = await runToCheckpoint(page);
    test.skip(!reached, 'Video metadata did not load');

    // Either the notice on the picture or the panel's own spinner is acceptable:
    // both say the same thing, and which one wins is a render-order detail. What
    // must never be true again is that neither is there.
    const explained = page
      .locator('text=/checkpoint reached|getting your checkpoint questions/i')
      .first();
    await expect(explained).toBeVisible({ timeout: 8000 });

    await context.close();
  });
});
