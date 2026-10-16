import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Site header (laptop): logo at the far left, search as an icon that opens a
 * field in place of the nav, Free demo (outline) beside the gold Join Now, and
 * the width tiers measured on the header container.
 */

// A dev server compiles the header chunk on first use, so hydration-bound steps get room.
const HYDRATE = { timeout: 60_000 };
// The first result opens a college profile, a route the dev server may compile
// from cold (well over a minute); prod serves it from cache.
const NAVIGATE = { timeout: 180_000 };

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
    test.slow();
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
    await expect(page).not.toHaveURL(/\/(en)?\/?$/, NAVIGATE);
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

  test('Free demo is an outline button and Join Now the gold primary, both 44px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('banner');
    const demo = banner.getByRole('link', { name: 'Free demo', exact: true });
    const join = banner.getByRole('link', { name: 'Join Now', exact: true });
    await expect(demo).toHaveAttribute('href', /\/demo-class$/);
    await expect(join).toHaveAttribute('href', /\/apply$/);
    const [d, j] = await Promise.all([demo.boundingBox(), join.boundingBox()]);
    expect(d!.height).toBeGreaterThanOrEqual(44);
    expect(j!.height).toBeGreaterThanOrEqual(44);
    // Gold fill (#e8a020) only on the primary.
    await expect(join).toHaveCSS('background-color', 'rgb(232, 160, 32)');
    await expect(demo).not.toHaveCSS('background-color', 'rgb(232, 160, 32)');
  });

  test('width tiers: Free demo goes icon-only below 1240, More appears below 1060', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('banner');
    const demo = banner.getByRole('link', { name: 'Free demo', exact: true });
    const more = banner.getByRole('button', { name: 'More', exact: true });

    const demoLabel = demo.getByText('Free demo', { exact: true });
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect(demoLabel).toBeVisible();
    await expect(more).toBeHidden();
    await expect(banner.getByRole('button', { name: 'Counseling', exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1150, height: 800 });
    await expect(demoLabel).toBeHidden();
    await expect(demo).toBeVisible();
    await expect(more).toBeHidden();

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(more).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Counseling', exact: true })).toBeHidden();
  });

  test('guide pages get the white header, the home page the navy one', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(6, 13, 31)');
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('no horizontal overflow at 375, 768, 1024 and 1440', async ({ page }) => {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
    }
  });
});
