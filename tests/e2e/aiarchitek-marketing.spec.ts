import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * /aiarchitek: the aiArchitek product hub on the marketing site.
 * Public page, so no role matrix: every visitor sees the same page.
 * Mobile first (375px), then tablet and desktop widths.
 */

test.use({ viewport: { width: 375, height: 812 } });
// The dev server compiles each page on first visit; give a cold start room.
test.describe.configure({ timeout: 120_000 });

const PATH = '/aiarchitek';

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types: string[] = [];
  for (const b of blocks) {
    const data = JSON.parse(b);
    for (const item of Array.isArray(data) ? data : [data]) if (item['@type']) types.push(item['@type']);
  }
  return types;
}

test.describe('aiArchitek hub', () => {
  test('is indexable with one H1, a self canonical and valid JSON-LD', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    const res = await page.goto(PATH);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['x-robots-tag']).toBeUndefined();

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('aiArchitek');
    await expect(page).toHaveTitle('aiArchitek by Neram Classes: AI-Powered NATA Preparation');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://neramclasses.com/aiarchitek');
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('index');
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);

    expect(await jsonLdTypes(page)).toEqual(
      expect.arrayContaining(['EducationalOrganization', 'WebApplication', 'BreadcrumbList', 'FAQPage']),
    );
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('ships the answers in the server HTML', async ({ request }) => {
    const html = await (await request.get(PATH)).text();
    expect(html).toContain('What is the difference between aiArchitek and Nexus?');
    expect(html).toContain('NATA Cutoff Calculator');
    expect(html).not.toMatch(/—/);
    expect(html).not.toMatch(/\bi\s?arch\b/i);
  });

  test('lists 12 live tools, each with a guide link and an app link', async ({ page }) => {
    await page.goto(PATH);
    const tools = page.locator('#tools article');
    await expect(tools).toHaveCount(12);
    for (const card of await tools.all()) {
      await expect(card.locator('h4 a')).toHaveAttribute('href', /^\/tools\/[a-z-]+$/);
      await expect(card.getByRole('link', { name: /^Open the / })).toHaveAttribute('href', /\/tools\/(nata|counseling)\//);
    }
  });

  test('labels every AI feature with an availability status', async ({ page }) => {
    await page.goto(PATH);
    const cards = page.locator('#ai-learning article');
    expect(await cards.count()).toBeGreaterThan(5);
    for (const card of await cards.all()) {
      await expect(card).toContainText(/Free for everyone|In the Neram classroom|Beta|Coming soon/);
    }
  });

  test('every internal link resolves', async ({ page, request }) => {
    // Each link is a cold compile on the dev server; 30+ of them need minutes.
    test.setTimeout(600_000);
    await page.goto(PATH);
    const hrefs = await page
      .locator('main a[href^="/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]))]);
    expect(hrefs.length).toBeGreaterThan(20);
    for (const href of hrefs.filter(Boolean)) {
      const res = await request.get(href, { maxRedirects: 5 });
      expect(res.status(), href).toBeLessThan(400);
    }
  });

  test('locale copies are noindexed with the English canonical', async ({ page }) => {
    const res = await page.goto(`/ta${PATH}`);
    expect(res?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://neramclasses.com/aiarchitek');
  });

  test('is listed in the sitemap', async ({ request }) => {
    const xml = await (await request.get('/sitemaps/core/sitemap.xml')).text();
    expect(xml).toContain('https://neramclasses.com/aiarchitek');
  });

  test('mobile: touch targets are at least 44px', async ({ page }) => {
    await page.goto(PATH);
    await assertTouchTargetSize(page, 'main .MuiButton-root');
    await assertTouchTargetSize(page, '#tools h4 a', 44);
    await assertTouchTargetSize(page, '#faq summary');
  });

  for (const width of [375, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PATH);
      await assertNoHorizontalOverflow(page);
    });
  }

  test('tool guides and the tools hub link back to the hub', async ({ page }) => {
    await page.goto('/tools/cutoff-calculator');
    await expect(page.locator('main a[href="/aiarchitek"]').first()).toBeVisible();
    await page.goto('/tools');
    await expect(page.locator('main a[href="/aiarchitek"]').first()).toBeVisible();
  });
});
