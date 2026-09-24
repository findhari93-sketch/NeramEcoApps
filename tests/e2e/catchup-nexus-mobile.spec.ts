/**
 * Teacher Catch-up on a phone (375px), after the 2026-09-24 mobile pass.
 *
 * What each test guards:
 *  - the first student is on the first screen (an intro, five tiles in three
 *    rows and a separate Stage row used to push it about 600px down);
 *  - the header tiles are the way in: Run over opens Needs action on that group;
 *  - all four tabs fit a phone whole (the scrolling strip cut "ction", "Stan");
 *  - every filter pill is a 44px target (they were 34px);
 *  - Reasons pages at 15 instead of rendering 50 cards (10,700px);
 *  - a class card's menu sits on the same row as its actions.
 *
 * The overview is mocked: the E2E classroom on staging has no absences.
 * Read-only: filters and tabs only, never nudges, calls or excuses.
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps catchup-nexus-mobile
 */
import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';
import { catchupOverviewPayload } from '../fixtures/catchup-overview';

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

async function open(page: Page, tab?: string) {
  await page.route('**/api/catchup/overview**', (r) => r.fulfill({ json: catchupOverviewPayload }));
  await page.goto(`${NEXUS}/teacher/catch-up${tab ? `?tab=${tab}` : ''}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('group', { name: 'Jump to a group of students' })).toBeVisible({ timeout: 60000 });
}

async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad: string[] = [];
    document.querySelectorAll('main *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1) return;
      // Inside a sideways-scrolling strip is fine; that is what it is for.
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return;
      }
      bad.push(`${el.tagName} right=${Math.round(r.right)}`);
    });
    return bad.slice(0, 5);
  });
}

test.describe('Nexus Catch-up on a phone', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
  });

  test('the first student is on the first screen, with no overflow', async ({ page }) => {
    await open(page);
    const firstRow = page.getByRole('button', { name: /classes? of their own|missed|Call/ }).first();
    await expect(page.getByRole('tab', { name: /Action/ })).toBeVisible();
    // Anything a teacher can act on: a Call link in Needs a call, or a student row.
    const call = page.getByRole('main').getByRole('link', { name: /Call/ }).first();
    const target = (await call.count()) ? call : firstRow;
    const box = await target.boundingBox();
    expect(box!.y).toBeLessThan(812 - 64);
    expect(await overflowing(page)).toEqual([]);
  });

  test('a header tile opens Needs action on that group', async ({ page }) => {
    await open(page, 'reasons');
    const tiles = page.getByRole('group', { name: 'Jump to a group of students' });
    const runOver = tiles.getByRole('button', { name: /Run over/ });
    await runOver.click();
    await expect(runOver).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('tab', { name: /Action/ })).toHaveAttribute('aria-selected', 'true');
    // The same filter, lit in the pill row below.
    await expect(page.getByRole('group', { name: 'Filter by what is holding the student up' })).toBeVisible();

    await tiles.getByRole('button', { name: /All clear/ }).click();
    await expect(page.getByRole('tab', { name: /Standing/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('all four tabs fit the phone whole', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const b = await tabs.nth(i).boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375);
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('filter pills are 44px targets on every tab', async ({ page }) => {
    for (const [tab, group] of [
      [undefined, 'Filter by what is holding the student up'],
      ['reasons', 'Filter reasons by kind'],
      ['classes', 'Filter classes'],
    ] as const) {
      await open(page, tab);
      const pills = page.getByRole('group', { name: group }).locator('.MuiChip-root');
      await expect(pills.first()).toBeVisible();
      const heights = await pills.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    }
  });

  test('Reasons shows 15, then offers the rest', async ({ page }) => {
    await open(page, 'reasons');
    const more = page.getByRole('button', { name: /^Show more/ });
    await expect(more).toBeVisible();
    const callsBefore = await page.getByRole('main').getByRole('link', { name: /^Call / }).count();
    expect(callsBefore).toBeLessThanOrEqual(15);
    await more.click();
    await expect.poll(() => page.getByRole('main').getByRole('link', { name: /^Call / }).count()).toBeGreaterThan(callsBefore);
    expect(await overflowing(page)).toEqual([]);
  });

  test('a class card keeps its menu on the actions row', async ({ page }) => {
    await open(page, 'classes');
    const menu = page.getByRole('button', { name: /^More actions for / }).first();
    await expect(menu).toBeVisible();
    const card = menu.locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][2]');
    const action = card.getByRole('button', { name: /Follow up|Attendance/ }).first();
    const [m, a] = [await menu.boundingBox(), await action.boundingBox()];
    // Same row: the centres line up within a few pixels.
    expect(Math.abs(m!.y + m!.height / 2 - (a!.y + a!.height / 2))).toBeLessThan(6);
    expect(await overflowing(page)).toEqual([]);
  });
});
