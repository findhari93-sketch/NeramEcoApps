import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Site header (laptop): logo at the far left, search as an icon that opens a
 * field in place of the nav, and Free demo + Join Now as one split pill.
 */

// A dev server compiles the header chunk on first use, so hydration-bound steps get room.
const HYDRATE = { timeout: 60_000 };

test.describe.configure({ mode: 'default', timeout: 120_000 });

/** Opens the inline search, retrying until the header has hydrated and the field has focus. */
async function openInlineSearch(page: Page) {
  const banner = page.getByRole('banner');
  const field = banner.getByRole('combobox', { name: 'Search the site' });
  await expect(async () => {
    if (!(await field.isVisible())) await banner.getByRole('button', { name: 'Search' }).click();
    await expect(field).toBeFocused({ timeout: 3000 });
  }).toPass(HYDRATE);
  return field;
}

test.describe('Header (laptop)', () => {
  test('logo sits at the far left at 1440 and 1536', async ({ page }) => {
    for (const width of [1440, 1536]) {
      await page.setViewportSize({ width, height: 864 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const logo = await page.getByRole('banner').getByRole('link').first().boundingBox();
      expect(logo!.x, `logo left edge at ${width}px`).toBeLessThanOrEqual(32);
    }
  });

  test('search icon opens a field, results navigate, Escape folds it back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('banner');

    // Closed: one 44px icon button and the nav.
    const icon = banner.getByRole('button', { name: 'Search' });
    const iconBox = await icon.boundingBox();
    expect(iconBox!.width).toBeGreaterThanOrEqual(44);
    expect(iconBox!.height).toBeGreaterThanOrEqual(44);

    // Open: the nav steps aside for the field.
    let field = await openInlineSearch(page);
    await expect(banner.getByRole('button', { name: /^Exam Hub/ })).toBeHidden();
    await field.fill('nata');
    const options = page.getByRole('listbox', { name: 'Search results' }).getByRole('option');
    await expect(options.first()).toBeVisible();
    await expect(field).toHaveAttribute('aria-activedescendant', /header-search-results-opt-0/);

    // Escape: back to the icon, with focus on it.
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
    await expect(icon).toBeFocused();
    await expect(banner.getByRole('button', { name: /^Exam Hub/ })).toBeVisible();

    // Enter on a result navigates and folds the field away.
    field = await openInlineSearch(page);
    await field.fill('nata');
    await expect(options.first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/\/(en)?\/?$/, HYDRATE);
    await expect(banner.getByRole('combobox', { name: 'Search the site' })).toBeHidden();
  });

  test('Ctrl+K opens the field and a click elsewhere closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const field = page.getByRole('banner').getByRole('combobox', { name: 'Search the site' });
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(field).toBeFocused({ timeout: 3000 });
    }).toPass(HYDRATE);
    await page.mouse.click(640, 500);
    await expect(field).toBeHidden();
  });

  test('Free demo and Join Now share one split pill', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('banner');
    const demo = banner.getByRole('link', { name: 'Free demo', exact: true });
    const join = banner.getByRole('link', { name: 'Join Now', exact: true });
    await expect(demo).toHaveAttribute('href', /\/demo-class$/);
    await expect(join).toHaveAttribute('href', /\/apply$/);
    const [d, j] = await Promise.all([demo.boundingBox(), join.boundingBox()]);
    // Touching halves on one line, each a full-size target.
    expect(Math.abs(d!.x + d!.width - j!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(d!.y - j!.y)).toBeLessThanOrEqual(1);
    expect(d!.height).toBeGreaterThanOrEqual(44);
  });

  test('no horizontal overflow at 375, 768, 1024 and 1440', async ({ page }) => {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
    }
  });
});
