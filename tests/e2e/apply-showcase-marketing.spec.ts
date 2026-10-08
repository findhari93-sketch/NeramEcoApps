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

test.describe('Apply showcase on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('plays beside the form, pauses, and steps with the arrows', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/01 \/ review/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /about you/i })).toBeVisible();

    // The showcase sits to the left of the form.
    const panelBox = (await panel.boundingBox())!;
    const headingBox = (await page.getByRole('heading', { name: /about you/i }).boundingBox())!;
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(headingBox.x + 1);

    await panel.getByRole('button', { name: /next scene/i }).click();
    await expect(panel.getByText(/02 \/ revise/i)).toBeVisible();

    await panel.getByRole('button', { name: /pause the tour/i }).click();
    await expect(panel.getByRole('button', { name: /play the tour/i })).toBeVisible();
    await page.waitForTimeout(7000);
    await expect(panel.getByText(/02 \/ revise/i)).toBeVisible();

    expect(errors, 'no console errors').toEqual([]);
  });

  test('advances on its own after the scene duration', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(panel.getByText(/01 \/ review/i)).toBeVisible();
    await expect(panel.getByText(/02 \/ revise/i)).toBeVisible({ timeout: 9000 });
  });

  test('stays still under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${MARKETING_URL}/apply`);
    const panel = showcase(page);
    await expect(panel.getByText(/01 \/ review/i)).toBeVisible();
    await page.waitForTimeout(7500);
    await expect(panel.getByText(/01 \/ review/i)).toBeVisible();
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
