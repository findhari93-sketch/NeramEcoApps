import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Marketing design system (apps/marketing/DESIGN_SYSTEM.md):
 * the /design-system styleguide, and the Home page rebuilt on it
 * (dark hero, light body, dark run, light SEO band, CtaBand last).
 *
 * Visual baselines are opt-in (VISUAL=1) because snapshots are per OS:
 *   VISUAL=1 pnpm test:e2e tests/e2e/design-system-marketing.spec.ts --project=marketing-chrome --update-snapshots
 */

const WIDTHS = [375, 768, 1024, 1440];
const GOLD = 'rgb(232, 160, 32)';
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('Design system styleguide', () => {
  test('renders tokens, type scale and components without errors', async ({ page }) => {
    const errors = await collectErrors(page);
    const res = await page.goto('/design-system');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'One token set, two surfaces' })).toBeVisible();
    for (const name of ['Colour', 'CtaButton', 'SectionHeader', 'FaqList', 'Breadcrumb and StatStrip']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    // Every swatch shows its contrast ratio
    await expect(page.getByText(/Aa \d+\.\d:1/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('is noindex', async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/design-system');
      await assertNoHorizontalOverflow(page);
    });
  }

  test('FaqList keeps one answer open at a time', async ({ page }) => {
    await page.goto('/design-system');
    const faq = page.locator('#faq');
    const questions = faq.getByRole('button');
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await questions.nth(2).click();
    await expect(questions.nth(2)).toHaveAttribute('aria-expanded', 'true');
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(faq.getByRole('region')).toHaveCount(1);
  });

  test('focus ring is the gold outline', async ({ page }) => {
    await page.goto('/design-system');
    const cta = page.locator('#buttons').getByRole('link', { name: 'Apply Now' }).first();
    await cta.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline).toEqual({ color: GOLD, width: '2px', style: 'solid' });
  });
});

test.describe('Home on the design system', () => {
  test('opens dark, reads light, closes with the CtaBand above the footer', async ({ page }) => {
    const errors = await collectErrors(page);
    await page.goto('/');
    const hero = page.locator('section[aria-labelledby="home-hero-title"]');
    await expect(hero).toHaveAttribute('data-surface', 'dark');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#featured-courses')).toHaveAttribute('data-surface', 'light');
    await expect(page.locator('#learning-tools')).toHaveAttribute('data-surface', 'white');
    await expect(page.locator('#about-neram')).toHaveAttribute('data-surface', 'white');

    // CtaBand is the last band before the footer
    const order = await page.evaluate(() => {
      const ids = ['featured-courses', 'learning-tools', 'about-neram', 'cta'];
      return ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1);
    });
    expect(order.every((top) => top >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('hero and tool cards use icons, never emoji', async ({ page }) => {
    await page.goto('/');
    const heroText = await page.locator('section[aria-labelledby="home-hero-title"]').innerText();
    const toolsText = await page.locator('#learning-tools').innerText();
    expect(PICTOGRAPH.test(heroText)).toBe(false);
    expect(PICTOGRAPH.test(toolsText)).toBe(false);
    await expect(page.locator('#learning-tools svg').first()).toBeVisible();
  });

  test('tool links use the /tools/* scheme on this site', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('section[aria-labelledby="home-hero-title"] a[href*="/tools/"], #learning-tools a[href*="/tools/"]')
      .evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/(\w{2}\/)?tools\/[a-z-]+$/);
      expect(href).not.toContain('/tools/nata/');
    }
  });

  test('home FAQ keeps every answer in the HTML', async ({ page }) => {
    await page.goto('/');
    const faq = page.locator('#about-neram');
    const count = await faq.getByRole('button', { expanded: false }).count();
    expect(count).toBeGreaterThan(0);
    // Closed answers are hidden but present (crawlers read them)
    expect(await faq.locator('[role="region"][hidden]').count()).toBe(count);
  });

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await assertNoHorizontalOverflow(page);
    });
  }

  test('mobile: hero CTA and tool cards are at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await assertTouchTargetSize(page, 'section[aria-labelledby="home-hero-title"] a', 44);
    await assertTouchTargetSize(page, '#learning-tools a', 44);
  });

  test('mobile: hero copy is never below 16px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const size = await page
      .locator('section[aria-labelledby="home-hero-title"] h1 + p')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});

test.describe('Visual baselines (opt-in)', () => {
  test.skip(!process.env.VISUAL, 'Set VISUAL=1 to compare screenshots (baselines are per OS).');

  for (const width of [375, 768, 1280]) {
    test(`styleguide at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/design-system');
      await expect(page).toHaveScreenshot(`design-system-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
    });

    test(`home hero at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('section[aria-labelledby="home-hero-title"]')).toHaveScreenshot(`home-hero-${width}.png`, {
        maxDiffPixelRatio: 0.02,
        mask: [page.locator('canvas')],
      });
    });
  }
});
