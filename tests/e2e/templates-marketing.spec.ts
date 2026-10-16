import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Phase 5 page templates of the marketing design system
 * (apps/marketing/DESIGN_SYSTEM.md, "Templates"): one representative page per
 * template, its key behaviour, and no sideways scroll on phones and laptops.
 */

const PAGES = {
  tool: '/tools/cutoff-calculator', // T7
  hub: '/tools', // T3
  guide: '/nata-2026/syllabus', // T2
  counselling: '/counseling/acpc-barch', // T5
  city: '/coaching/nata-coaching/nata-coaching-centers-in-chennai', // T6
  legal: '/terms', // T9
};

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// The dev server compiles each page on its first visit; give a cold start room.
test.describe.configure({ timeout: 120_000 });

test.describe('Phase 5 templates', () => {
  for (const [name, path] of Object.entries(PAGES)) {
    for (const width of [375, 1280]) {
      test(`${name}: renders with one h1 and no overflow at ${width}px`, async ({ page }) => {
        const errors = await collectErrors(page);
        await page.setViewportSize({ width, height: 900 });
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await expect(page.locator('h1')).toHaveCount(1);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);
      });
    }
  }

  test('T7: the quick check works out a cutoff score out of 400', async ({ page }) => {
    await page.goto(PAGES.tool);
    const card = page.locator('section[aria-labelledby="cutoff-quick-check"]');
    await expect(card.getByRole('status')).toContainText('Enter all three marks');
    await card.getByLabel('Board PCM percentage').fill('85');
    await card.getByLabel('Part A').fill('55');
    await card.getByLabel('Part B').fill('80');
    // 85 x 2 + 55 + 80 = 305; NATA 135 is the NITs band
    await expect(card.getByRole('status')).toContainText('305');
    await expect(card.getByRole('status')).toContainText('NITs range');
    await expect(card.getByRole('link', { name: 'See matching colleges' })).toHaveAttribute('href', /app\.neramclasses\.com/);
  });

  test('T3: the search and category tabs filter the tool cards', async ({ page }) => {
    await page.goto(PAGES.hub);
    const cards = page.locator('main a[href^="/tools/"]');
    const all = await cards.count();
    expect(all).toBeGreaterThan(10);
    await page.getByRole('searchbox').fill('resizer');
    await expect(cards).toHaveCount(1);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: /Analysis and Insights/ }).click();
    await expect(page.getByRole('button', { name: /Analysis and Insights/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await cards.count()).toBeLessThan(all);
  });

  test('T2: the guide rail marks the current page', async ({ page }) => {
    await page.goto(PAGES.guide);
    const rail = page.getByRole('navigation', { name: 'NATA 2026 guide' });
    await expect(rail.locator('a[aria-current="page"]')).toHaveText(/Syllabus/);
    await expect(rail.locator('a')).toHaveCount(17); // overview + 16 spokes
  });

  test('T5: status banner and the schedule as a timeline', async ({ page }) => {
    await page.goto(PAGES.counselling);
    await expect(page.getByRole('status').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Important dates' })).toBeVisible();
    // Each milestone carries its state as text, not colour only
    // (the breadcrumb is also an <ol>, so look for the milestone rows themselves)
    await expect(page.locator('li', { hasText: /Done:|Current:|Upcoming:/ }).first()).toBeAttached();
  });

  test('T6: hero answer, facts table and the lead card', async ({ page }) => {
    await page.goto(PAGES.city);
    await expect(page.locator('#answer')).toBeVisible();
    await expect(page.locator('#facts table')).toBeVisible();
    await expect(page.locator('#callback')).toBeVisible();
  });

  test('T9: the policy switcher and the on-this-page anchors', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PAGES.legal);
    await expect(page.getByRole('navigation', { name: 'Policies' }).locator('a[aria-current="page"]')).toHaveText('Terms');
    const first = page.getByRole('navigation', { name: 'Terms & Conditions' }).locator('a').first();
    const target = (await first.getAttribute('href'))!;
    await first.click();
    await expect(page.locator(target)).toBeInViewport();
  });
});
