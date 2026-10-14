import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

/**
 * College directory redesign (Claude Design canvas "College Directory · Neram
 * Classes"): list / grid / table views, filter rail, mobile filter sheet,
 * compare tray (up to 4) and the compare page.
 *
 * Public pages, no auth. Project: marketing-chrome (baseURL http://localhost:3010).
 * Uses /colleges/tamil-nadu, the state with the most colleges.
 */

const STATE_URL = '/en/colleges/tamil-nadu';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors.filter((e) => !e.includes('favicon') && !e.includes('ERR_BLOCKED_BY_CLIENT'));
}

async function freshCompare(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__compare_reset')) {
      localStorage.removeItem('neram_compare_colleges');
      sessionStorage.setItem('__compare_reset', '1');
    }
  });
}

test.describe('College directory: desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC1: list view is the default, with one H1 and result cards', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(STATE_URL);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('B.Arch Colleges in Tamil Nadu');
    const views = page.getByRole('navigation', { name: 'Result view' });
    await expect(views.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('article').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Showing \d+ of \d+ colleges/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test('AC2: the view switcher moves between list, grid and table', async ({ page }) => {
    await page.goto(STATE_URL);
    const views = page.getByRole('navigation', { name: 'Result view' });
    await views.getByRole('link', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(views.getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'page');

    await views.getByRole('link', { name: 'Table' }).click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByRole('table', { name: 'Colleges' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('AC3: table headers sort through the URL, both directions for fee', async ({ page }) => {
    await page.goto(`${STATE_URL}?view=table`);
    // The header buttons do nothing until the table hydrates, so retry the first click.
    await expect(async () => {
      await page.getByRole('button', { name: /^Sort by Annual fee/ }).click();
      await expect(page).toHaveURL(/sort=fee_low/, { timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByRole('columnheader', { name: /Annual fee/ })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByRole('button', { name: /^Sort by Annual fee/ }).click();
    await expect(page).toHaveURL(/sort=fee_high/);
    await expect(page.getByRole('columnheader', { name: /Annual fee/ })).toHaveAttribute('aria-sort', 'descending');
  });

  test('AC4: filter rail updates results, chips and Clear all', async ({ page }) => {
    await page.goto(STATE_URL);
    const status = page.getByRole('status').filter({ hasText: /Showing \d+ of \d+ colleges/ });
    const before = await status.textContent();

    const rail = page.getByRole('region', { name: 'Filters' });
    await rail.getByRole('checkbox', { name: /^Government \d+$/ }).check();
    await expect(page).toHaveURL(/type=government/);
    await expect(status).not.toHaveText(before ?? '');
    await expect(page.getByRole('button', { name: 'Remove filter: Government' })).toBeVisible();

    await rail.getByRole('button', { name: 'Clear all' }).click();
    await expect(page).not.toHaveURL(/type=/);
    await expect(status).toHaveText(before ?? '');
  });

  test('AC5: options with no matching college are disabled', async ({ page }) => {
    await page.goto(STATE_URL);
    const rail = page.getByRole('region', { name: 'Filters' });
    // "Government aided" has no college in Tamil Nadu today; if one appears, the option is enabled and shows a count.
    const label = rail.locator('label', { hasText: 'Government aided' });
    const aided = label.getByRole('checkbox');
    const count = (await label.textContent())?.match(/(\d+)\s*$/)?.[1];
    if (count === '0') await expect(aided).toBeDisabled();
    else await expect(aided).toBeEnabled();
  });

  test('AC6: the A to Z jump filters by first letter', async ({ page }) => {
    await page.goto(STATE_URL);
    const jump = page.getByRole('navigation', { name: 'Filter by first letter' });
    const letter = jump.getByRole('button', { name: /Colleges starting with/ }).first();
    const ch = (await letter.textContent())!.trim();
    await letter.click();
    await expect(page).toHaveURL(new RegExp(`letter=${ch}`));
    const names = await page.locator('article h3').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.trim().toUpperCase().startsWith(ch)).toBe(true);
  });

  test('AC7: empty search says which name had no match', async ({ page }) => {
    await page.goto(`${STATE_URL}?q=zzqqxx`);
    await expect(page.getByText('No college named "zzqqxx"')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('AC8: compare up to 4, tray counts, limit message, compare page', async ({ page }) => {
    await freshCompare(page);
    const errors = collectErrors(page);
    await page.goto(STATE_URL);
    const boxes = page.locator('article').getByRole('checkbox', { name: /^Compare / });
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();

    const tray = page.getByTestId('compare-tray').first();
    await expect(tray).toContainText('4 of 4');
    await expect(tray.getByRole('link', { name: /Compare 4 colleges/ })).toBeVisible();

    // A fifth college is refused with the copy-guide message.
    await boxes.nth(4).click();
    await expect(page.getByText('You can compare up to 4 colleges.')).toBeVisible();
    await expect(boxes.nth(4)).not.toBeChecked();

    await tray.getByRole('link', { name: /Compare 4 colleges/ }).click();
    await expect(page).toHaveURL(/\/colleges\/compare\?slugs=/, { timeout: 20000 });
    // Four detail fetches; allow for a cold dev compile.
    await expect(page.getByRole('heading', { name: 'Compare colleges' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Comparing 4 colleges. You can add up to 4.')).toBeVisible();

    const table = page.getByRole('table', { name: 'College comparison' });
    await expect(table).toBeVisible();
    const rowsBefore = await table.getByRole('row').count();
    await page.getByRole('checkbox', { name: 'Show differences only' }).check();
    expect(await table.getByRole('row').count()).toBeLessThanOrEqual(rowsBefore);

    // Remove one: back to 3 with an "Add a college" slot.
    await page.getByRole('button', { name: /^Remove / }).first().click();
    await expect(page.getByText('Comparing 3 colleges. You can add up to 4.')).toBeVisible();
    await expect(page.getByLabel('Add a college').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test('layout: grid tiles share one width, content stops at 1360px', async ({ page }) => {
    await page.goto(`${STATE_URL}?view=grid`);
    const tiles = page.locator('ol[aria-label="Colleges"] article');
    await expect(tiles.first()).toBeVisible();
    const boxes = await tiles.evaluateAll((els) => els.slice(0, 6).map((el) => el.getBoundingClientRect()));
    const firstRow = boxes.filter((b) => Math.abs(b.top - boxes[0].top) < 2);
    expect(firstRow.length).toBeGreaterThan(1);
    for (const b of firstRow) {
      expect(Math.abs(b.width - firstRow[0].width)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - firstRow[0].height)).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    const aside = await page.locator('aside').filter({ has: page.getByRole('region', { name: 'Filters' }) }).first().boundingBox();
    const lastTile = await tiles.nth(2).boundingBox();
    expect(lastTile!.x + lastTile!.width - aside!.x).toBeLessThanOrEqual(1360);
  });

  test('layout: selects carry their own chevron, rail collapses from its header', async ({ page }) => {
    await page.goto(STATE_URL);
    await page.evaluate(() => localStorage.removeItem('college_filter_collapsed'));
    const sort = page.getByLabel('Sort by');
    await expect(sort).toBeVisible();
    expect(await sort.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
    expect(await page.getByLabel('State', { exact: true }).evaluate((el) => getComputedStyle(el).appearance)).toBe('none');

    const collapse = page.getByRole('button', { name: 'Collapse filters' });
    await expect(async () => {
      await collapse.click();
      await expect(page.getByRole('button', { name: /^Expand filters/ })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Filters' })).toBeHidden();
    await page.getByRole('button', { name: /^Expand filters/ }).click();
    await expect(page.getByRole('region', { name: 'Filters' })).toBeVisible();
  });

  test('compare tray rests as a dimmed pill and opens on hover', async ({ page }) => {
    await freshCompare(page);
    await page.goto(STATE_URL);
    const boxes = page.locator('article').getByRole('checkbox', { name: /^Compare / });
    const tray = page.getByTestId('compare-tray').first();
    // A tick before hydration never reaches the compare list, so retry until the tray shows it.
    await expect(async () => {
      await boxes.nth(0).setChecked(false);
      await boxes.nth(0).check();
      await expect(tray).toContainText('1 of 4', { timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await boxes.nth(1).check();
    await expect(tray).toContainText('2 of 4');
    // Opens briefly after each add, then folds back to the pill.
    await page.mouse.move(700, 300);
    await expect(tray).toHaveAttribute('data-open', 'false', { timeout: 6000 });
    expect(Number(await tray.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.8);
    await expect(tray.getByRole('link', { name: 'Compare 2 colleges' })).toBeVisible();
    const restCta = await tray.getByRole('link', { name: 'Compare 2 colleges' }).boundingBox();

    await tray.hover();
    await expect(tray).toHaveAttribute('data-open', 'true');
    await expect(tray.getByRole('button', { name: /^Remove .* from compare$/ })).toHaveCount(2);
    // The Compare button keeps its spot, so the click lands where the user aimed.
    const openCta = await tray.getByRole('link', { name: 'Compare 2 colleges' }).boundingBox();
    expect(Math.abs(openCta!.x + openCta!.width - (restCta!.x + restCta!.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(openCta!.y + openCta!.height - (restCta!.y + restCta!.height))).toBeLessThanOrEqual(2);
  });

  test('the hub bottom nav is hidden on desktop', async ({ page }) => {
    await page.goto(STATE_URL);
    await expect(page.getByRole('navigation', { name: 'College hub' })).toBeHidden();
  });
});

test.describe('College directory: phone (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('mobile: results, no horizontal overflow, 44px compare targets', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(STATE_URL);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Change state, current: Tamil Nadu/ })).toBeVisible();
    const toggles = page.locator('ol[aria-label="Colleges"] button[aria-label^="Compare "]');
    await expect(toggles.first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'ol[aria-label="Colleges"] li:nth-child(-n+5) button[aria-label^="Compare "]');
    await assertTouchTargetSize(page, 'nav[aria-label="College hub"] a');
    expect(errors()).toEqual([]);
  });

  test('mobile: bottom nav shows the compare count', async ({ page }) => {
    await freshCompare(page);
    await page.goto(STATE_URL);
    const nav = page.getByRole('navigation', { name: 'College hub' });
    await expect(nav).toBeVisible();
    await page.locator('ol[aria-label="Colleges"] button[aria-label^="Compare "]').first().click();
    await expect(nav.getByText('1', { exact: true })).toBeVisible();
    await expect(page.getByTestId('compare-tray').last()).toContainText('1 of 4 added');
  });

  test('mobile: filter sheet applies a draft and Back undoes it', async ({ page }) => {
    await page.goto(STATE_URL);
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Filters' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Type' }).click();
    await sheet.getByRole('checkbox', { name: /^Government \d+$/ }).check();
    const apply = sheet.getByRole('button', { name: /^Show \d+ college/ });
    await expect(apply).toBeVisible();
    // Nothing applied until Apply.
    await expect(page).not.toHaveURL(/type=/);
    await apply.click();
    await expect(page).toHaveURL(/type=government/);

    await page.goBack();
    await expect(page).not.toHaveURL(/type=/);
  });

  test('mobile: quick chip opens the sheet on its category', async ({ page }) => {
    await page.goto(STATE_URL);
    await page.getByRole('list', { name: 'Quick filters' }).getByRole('button', { name: 'NAAC' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'NAAC grade' })).toBeVisible();
  });

  test('mobile: compare page fits the screen', async ({ page }) => {
    await page.goto(STATE_URL);
    const hrefs = await page.locator('ol[aria-label="Colleges"] li a').evaluateAll((as) => as.slice(0, 3).map((a) => (a as HTMLAnchorElement).pathname.split('/').pop()));
    await page.goto(`/en/colleges/compare?slugs=${hrefs.join(',')}`);
    // Three detail fetches; allow for a cold dev compile.
    await expect(page.getByRole('list', { name: 'Colleges being compared' })).toBeVisible({ timeout: 20000 });
    await assertNoHorizontalOverflow(page);
  });

  test('mobile: hub bottom nav is not shown outside /colleges', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('navigation', { name: 'College hub' })).toHaveCount(0);
  });
});
