import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * NIRF Architecture rankings page: SEO content and schema.
 *
 * The page ranked poorly because it was a bare table with its JSON-LD injected
 * after hydration. These tests read the raw server HTML (what a crawler gets
 * before any JS) and check the written sections, schema and links, then the
 * mobile layout. Public page, no auth or roles involved.
 */

const PATH = '/colleges/rankings/nirf';

function ldTypes(html: string): string[] {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  return blocks.flatMap((m) => {
    const data = JSON.parse(m[1]);
    return (Array.isArray(data) ? data : [data]).map((d: { '@type': string }) => d['@type']);
  });
}

test.describe('NIRF Architecture rankings SEO', () => {
  test('server HTML carries the title, sections and all schema', async ({ request }) => {
    const res = await request.get(PATH);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toMatch(/<title>NIRF Ranking \d{4} Architecture Colleges: Top \d+ in India \| Neram Classes<\/title>/);
    expect(html).toContain('<link rel="canonical" href="https://neramclasses.com/colleges/rankings/nirf"');
    expect(html).toMatch(/<h2[^>]*>Top 10 Architecture Colleges in India \(NIRF/);
    expect(html).toContain('Frequently Asked Questions');

    const types = ldTypes(html);
    expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'ItemList', 'FAQPage']));

    // English canonical URLs have no /en prefix; /en/... 308-redirects.
    expect(html).not.toMatch(/href="\/en\//);
    // Old breadcrumb pointed at a 404.
    expect(html).not.toMatch(/href="\/colleges\/rankings"/);
    // Content writing rule: no em dashes in visible copy.
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    expect(visible).not.toContain('—');
  });

  test('FAQ answers open on click and rank rows link to college history', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.getByRole('heading', { level: 1, name: /NIRF Architecture Rankings \d{4}/ })).toBeVisible();

    const faq = page.locator('details').filter({ hasText: 'Which NIT is best for architecture?' });
    await faq.locator('summary').click();
    await expect(faq).toHaveAttribute('open', '');
    await expect(faq).toContainText('JoSAA');

    const top10 = page.locator('section[aria-labelledby="nirf-top10"] ol a').first();
    await expect(top10).toHaveAttribute('href', /^\/colleges\/rankings\/nirf\/[a-z0-9-]+$/);
  });

  test('college history page has schema in the server HTML and no double brand', async ({ request, page }) => {
    await page.goto(PATH);
    const href = await page.locator('section[aria-labelledby="nirf-top10"] ol a').first().getAttribute('href');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(ldTypes(html)).toEqual(expect.arrayContaining(['EducationalOrganization', 'BreadcrumbList']));
    expect(html).not.toContain('| Neram | Neram Classes');
  });

  test.describe('mobile 375px', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('no horizontal overflow and touch targets of at least 44px', async ({ page }) => {
      await page.goto(PATH);
      await page.locator('#nirf-faq').scrollIntoViewIfNeeded();
      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, 'section[aria-labelledby="nirf-top10"] ol a');
      await assertTouchTargetSize(page, 'section[aria-labelledby="nirf-faq"] summary');
      await assertTouchTargetSize(page, 'section[aria-labelledby="nirf-admission"] a');
    });
  });
});
