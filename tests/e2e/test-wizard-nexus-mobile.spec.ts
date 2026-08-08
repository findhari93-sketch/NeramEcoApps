import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';

/**
 * The wizard at 375px.
 *
 * Two of these assertions exist because of real bugs in the code this replaced:
 *
 *   - the sticky tray must clear the 64px bottom nav. The old builder pinned its
 *     selection bar at bottom:0 with zIndex:30, which put it UNDER the nav and
 *     overlapping it, so the primary action was partly untappable on a phone.
 *   - Back must walk the wizard backwards. The old import wizard kept its step
 *     in useState with no URL, so Back at step 3 discarded a 40-question paste.
 */

const NEXUS = 'http://localhost:3012';
const VIEWPORT = { width: 375, height: 812 };

/**
 * 120s, not the 30s default. injectAuthForPage navigates to /login, and against
 * a dev server that is the first compile of the whole teacher tree. A hook does
 * NOT inherit a describe-level timeout, so it has to be set inside the hook.
 */
const HOOK_TIMEOUT_MS = 120_000;

test.describe('Test wizard on a phone', () => {
  test.use({ viewport: VIEWPORT, baseURL: NEXUS });
  test.describe.configure({ timeout: HOOK_TIMEOUT_MS });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(HOOK_TIMEOUT_MS);
    await injectAuthForPage(page, 'teacher');
  });

  test('step 1 shows the four sources in one column with no sideways scroll', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    await expect(page.getByText('Where do the questions come from?')).toBeVisible({ timeout: 30_000 });

    for (const label of ['Generate with AI', 'Upload JSON', 'Pick from question bank', 'Previous-year paper']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal overflow at 375px').toBeLessThanOrEqual(0);
  });

  test('every source card is a full-width target at least 48px tall', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    const card = page.getByRole('button', { name: /Generate with AI/ }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const box = await card.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThan(VIEWPORT.width * 0.8);
  });

  test('the sticky tray clears the bottom nav rather than hiding under it', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=bank');
    await expect(page.getByRole('heading', { name: 'Pick from the question bank' })).toBeVisible({
      timeout: 60_000,
    });

    // The picker labels each row's checkbox with the question text, which is
    // what separates it from the difficulty and tag controls above the list.
    const firstQuestion = page.getByRole('checkbox', { name: /^Pick question:/ }).first();
    await expect(firstQuestion).toBeVisible({ timeout: 60_000 });
    await firstQuestion.click();

    const tray = page.getByRole('button', { name: /Review \d+ question/ });
    await expect(tray).toBeVisible({ timeout: 15_000 });
    const box = await tray.boundingBox();
    // 64px of bottom nav must remain uncovered beneath it.
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height - 64 + 1);
  });

  test('the step lives in the URL, so Back walks the wizard backwards', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    await page.getByRole('button', { name: /Generate with AI/ }).first().click();
    await expect(page).toHaveURL(/step=generate/);
    await expect(page).toHaveURL(/src=ai/);

    await page.goBack();
    await expect(page).not.toHaveURL(/step=generate/);
    await expect(page.getByText('Where do the questions come from?')).toBeVisible();
  });

  test('a step the draft cannot support falls back instead of painting an empty screen', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=review');
    // Nothing has been generated, so review is unreachable and step 1 renders.
    await expect(page.getByText('Where do the questions come from?')).toBeVisible({ timeout: 30_000 });
  });

  test('the cost is on screen before the money is spent', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=ai');
    await expect(page.getByText('COST & TIME')).toBeVisible({ timeout: 60_000 });
    // Generous: against a dev server this is the first compile of the estimate
    // route, and the quote cannot arrive before the route exists.
    await expect(page.getByText('est. Gemini cost')).toBeVisible({ timeout: 60_000 });

    // And it sits above the button that spends it.
    const cost = await page.getByText('est. Gemini cost').boundingBox();
    const button = await page.getByRole('button', { name: /Generate \d+ questions/ }).boundingBox();
    expect(cost!.y).toBeLessThan(button!.y);
  });

});

/**
 * Its own describe, with no teacher beforeEach. Injecting student auth on top
 * of teacher auth would not work: injectAuthForPage writes to localStorage, and
 * clearCookies does not touch localStorage, so the teacher token would survive
 * and the test would pass for the wrong reason.
 */
test.describe('The wizard is staff-only', () => {
  test.use({ viewport: VIEWPORT, baseURL: NEXUS });
  test.describe.configure({ timeout: HOOK_TIMEOUT_MS });

  test('a student never reaches the wizard', async ({ page }) => {
    test.setTimeout(HOOK_TIMEOUT_MS);
    await injectAuthForPage(page, 'student');
    await page.goto('/teacher/tests/new');

    // The teacher route group guards itself, so a student is redirected rather
    // than shown the wizard's own refusal copy. Either outcome is acceptable;
    // what must NEVER happen is the source picker rendering for them.
    await page.waitForTimeout(3_000);
    await expect(page.getByText('Where do the questions come from?')).toHaveCount(0);
  });
});
