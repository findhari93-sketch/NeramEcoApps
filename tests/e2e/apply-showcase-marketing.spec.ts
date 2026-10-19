import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The Nexus showcase beside the application form on /apply: it plays, pauses,
 * respects reduced motion, loads its images, and sits above the form on a phone.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const showcase = (page: Page) => page.getByRole('region', { name: /inside the nexus app/i });
/** The tour segment for a scene; the current one is aria-selected. */
const scene = (panel: ReturnType<typeof showcase>, name: string) => panel.getByRole('tab', { name, exact: true });

test.describe('Apply showcase on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('plays beside the form, pauses, and steps with the arrows', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(panel).toBeVisible();
    await expect(scene(panel, 'Review')).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText('Your teacher marks up your drawing and explains each fix.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /about you/i })).toBeVisible();

    // The showcase sits to the left of the form.
    const panelBox = (await panel.boundingBox())!;
    const headingBox = (await page.getByRole('heading', { name: /about you/i }).boundingBox())!;
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(headingBox.x + 1);

    await panel.getByRole('button', { name: /next scene/i }).click();
    await expect(scene(panel, 'Revise')).toHaveAttribute('aria-selected', 'true');

    await panel.getByRole('button', { name: /pause the tour/i }).first().click();
    await expect(panel.getByRole('button', { name: /play the tour/i }).first()).toBeVisible();
    await page.waitForTimeout(8000);
    await expect(scene(panel, 'Revise')).toHaveAttribute('aria-selected', 'true');

    // A segment jumps straight to its scene.
    await scene(panel, 'Library').click();
    await expect(scene(panel, 'Library')).toHaveAttribute('aria-selected', 'true');

    expect(errors, 'no console errors').toEqual([]);
  });

  test('advances on its own after the scene duration', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(scene(panel, 'Review')).toHaveAttribute('aria-selected', 'true');
    // 7s per scene plus a 0.6s hold
    await expect(scene(panel, 'Revise')).toHaveAttribute('aria-selected', 'true', { timeout: 12000 });
  });

  test('stays still under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(scene(panel, 'Review')).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(8500);
    await expect(scene(panel, 'Review')).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toHaveAttribute('data-motion', 'off');
  });

  test('every showcase image loads', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    for (let i = 0; i < 7; i += 1) {
      const broken = await panel.locator('img').evaluateAll((imgs) =>
        imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 0).length,
      );
      expect(broken, `scene ${i + 1} has no broken image`).toBe(0);
      await panel.getByRole('button', { name: /next scene/i }).click();
    }
  });
});

test.describe('Apply showcase on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('sits above the form, fits the width, and keeps 44 px targets', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(panel).toBeVisible();
    const panelBox = (await panel.boundingBox())!;
    const heading = page.getByRole('heading', { name: /about you/i });
    const headingBox = (await heading.boundingBox())!;
    expect(panelBox.y).toBeLessThan(headingBox.y);
    expect(headingBox.y, 'the step title is on the first screen').toBeLessThan(812);

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:visible, a[href]:visible', 44);
  });
});

/**
 * A 1920x1080 laptop at 125 to 135% Windows scaling gives Chrome a window of
 * about 1422x739 CSS px; a 1366x768 laptop at 100% gives about 1366x650.
 * The whole of step 1 and the whole showcase must fit without scrolling.
 */
for (const viewport of [
  { width: 1422, height: 739 },
  { width: 1536, height: 800 },
  { width: 1366, height: 650 },
]) {
  test.describe(`Apply on a ${viewport.width}x${viewport.height} laptop`, () => {
    test.use({ viewport });

    test('the showcase fits its column and the next step is one click away', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`${MARKETING_URL}/apply`);
      const panel = showcase(page);
      await expect(panel).toBeVisible();

      // Every showcase control is on screen without scrolling.
      for (const name of [/pause the tour/i, /next scene/i]) {
        const box = (await panel.getByRole('button', { name }).first().boundingBox())!;
        expect(box.y + box.height, `${name} is on the first screen`).toBeLessThanOrEqual(viewport.height);
      }

      // The primary button is on the first screen, and stays there after scrolling.
      const primary = page.getByRole('button', { name: /continue to your course/i });
      const before = (await primary.boundingBox())!;
      expect(before.y + before.height, 'Continue is on the first screen').toBeLessThanOrEqual(viewport.height);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(200);
      const after = (await primary.boundingBox())!;
      expect(after.y + after.height, 'Continue stays on screen').toBeLessThanOrEqual(viewport.height);

      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, 'main button:visible', 44);
      expect(errors, 'no console errors').toEqual([]);
    });
  });
}
