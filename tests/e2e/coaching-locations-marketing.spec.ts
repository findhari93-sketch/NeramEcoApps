import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Nationwide coaching location pages (city, state, directory) plus the sitemap
 * index, llms.txt and the consolidation redirects. Mobile first: 375px.
 * Public pages, so no role matrix: every visitor sees the same page.
 */

test.use({ viewport: { width: 375, height: 812 } });

const city = (slug: string) => `/coaching/nata-coaching/nata-coaching-centers-in-${slug}`;

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types: string[] = [];
  for (const b of blocks) {
    const data = JSON.parse(b);
    for (const item of Array.isArray(data) ? data : [data]) if (item['@type']) types.push(...[item['@type']].flat());
  }
  return types;
}

async function robots(page: Page): Promise<string | null> {
  return page.locator('meta[name="robots"]').getAttribute('content');
}

test.describe('City coaching pages', () => {
  test('Chennai: the centre page, with answer first, visit section and centre schema', async ({ page }) => {
    await page.goto(city('chennai'));
    await expect(page.getByRole('heading', { level: 1, name: 'NATA Coaching Centre in Chennai' })).toBeVisible();
    const answer = page.locator('#answer');
    await expect(answer).toBeInViewport();
    await expect(answer).toContainText('classroom batches');
    await expect(page.getByRole('link', { name: 'Visit the classroom' })).toHaveAttribute('href', /nata-coaching-centers-in-chennai#visit$/);
    await expect(page.locator('#visit')).toContainText('Ashok Nagar');
    await expect(page.locator('#visit')).toContainText('Tambaram');
    await expect(page.locator('#visit').getByRole('button', { name: 'Book a centre visit' })).toBeVisible();
    await expect(page.getByText(/^Last updated/)).toBeVisible();
    const types = await jsonLdTypes(page);
    expect(types).toEqual(expect.arrayContaining(['Course', 'FAQPage', 'BreadcrumbList', 'LocalBusiness']));
    expect(types).not.toContain('AggregateRating');
    // The blended course instance points at the centre node on this page.
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(' ');
    const centreId = blocks.match(/"@id":"([^"]+#centre-chennai)"/)?.[1];
    expect(centreId).toBeTruthy();
    expect(blocks).toContain(`"location":{"@id":"${centreId}"}`);
    expect(await robots(page)).toContain('index');
    await assertNoHorizontalOverflow(page);
  });

  test('Madurai: address in the hero, a titled map, nearby towns and large image previews', async ({ page }) => {
    await page.goto(city('madurai'));
    await expect(page.getByRole('heading', { level: 1, name: 'NATA Coaching Centre in Madurai' })).toBeVisible();
    await expect(page).toHaveTitle(/NATA Coaching Centre in Madurai/);
    // The hero address jumps to the visit card.
    await expect(page.locator('a[href="#visit"]').filter({ hasText: 'Vasanth Nagar' })).toBeVisible();
    const map = page.locator('#visit iframe[title^="Map:"]');
    await expect(map).toHaveCount(1);
    await expect(map).toHaveAttribute('loading', 'lazy');
    // Towns without a centre of their own, linked to their pages.
    const centre = page.locator('#centre');
    await expect(centre).toContainText('Students travel here from');
    await expect(centre.locator('a[href*="nata-coaching-centers-in-"]').first()).toBeVisible();
    await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute('content', /max-image-preview:large/);
    await assertNoHorizontalOverflow(page);
  });

  test('Madurai at 1280px: no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(city('madurai'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('mobile sticky bar opens WhatsApp with the city and a page code', async ({ page }) => {
    await page.goto(city('madurai'));
    const wa = page.locator('a[href^="https://wa.me/"]').last();
    const href = decodeURIComponent((await wa.getAttribute('href')) ?? '');
    expect(href).toContain("I'm from Madurai");
    expect(href).toContain('[EN-MDU]');
  });

  test('a place near a centre but without one never says classroom', async ({ request, page }) => {
    // Bengaluru Rural is the same point as Bangalore and merges into it.
    const merged = await request.get(city('bengaluru-rural'), { maxRedirects: 0 });
    expect([301, 308]).toContain(merged.status());
    expect(merged.headers()['location']).toContain(city('bangalore'));
    await page.goto(city('hosur'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Classroom and live online')).toHaveCount(0);
  });

  test('Bangalore: classroom at the Electronic City centre', async ({ page }) => {
    await page.goto(city('bangalore'));
    await expect(page.locator('#answer')).toContainText('Electronic City');
  });

  test('Jaipur: online only, never claims a classroom', async ({ page }) => {
    await page.goto(city('jaipur'));
    await expect(page.locator('#answer')).toContainText('live online classes');
    await expect(page.getByRole('link', { name: /Visit the classroom|Nearest classroom/ })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/our Jaipur cent/i);
  });

  test('a city without enough local facts is noindex, follow and absent from the sitemap', async ({ page, request }) => {
    await page.goto(city('agartala'));
    expect(await robots(page)).toMatch(/noindex/);
    expect(await robots(page)).toMatch(/follow/);
    const xml = await (await request.get('/sitemaps/coaching-locations/sitemap.xml')).text();
    expect(xml).not.toContain(city('agartala'));
    expect(xml).toContain(city('chennai'));
  });

  test('alias slugs redirect permanently and unknown cities 404', async ({ request }) => {
    const alias = await request.get(city('bengaluru'), { maxRedirects: 0 });
    expect([301, 308]).toContain(alias.status());
    expect(alias.headers()['location']).toContain(city('bangalore'));
    expect((await request.get(city('atlantis'), { maxRedirects: 0 })).status()).toBe(404);
  });

  test('mobile: CTAs and FAQ toggles are at least 44px', async ({ page }) => {
    await page.goto(city('jaipur'));
    await assertTouchTargetSize(page, '#answer ~ div a, #faq summary, #nearby a');
  });
});

test.describe('State and directory pages', () => {
  test('state page lists its cities and the state counselling', async ({ page }) => {
    await page.goto('/coaching/nata-coaching-in-tamil-nadu');
    await expect(page.getByRole('heading', { level: 1, name: 'NATA Coaching in Tamil Nadu' })).toBeVisible();
    await expect(page.locator('#cities a').first()).toHaveAttribute('href', /nata-coaching-centers-in-/);
    await expect(page.locator('#counselling')).toContainText('TNEA');
    await assertNoHorizontalOverflow(page);
  });

  test('JEE Paper 2 state and city pages render', async ({ page }) => {
    await page.goto('/coaching/jee-paper-2-coaching-in-kerala');
    await expect(page.getByRole('heading', { level: 1, name: 'JEE Paper 2 Coaching in Kerala' })).toBeVisible();
    await page.goto('/coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-trichy');
    await expect(page.getByRole('heading', { level: 1, name: 'JEE Paper 2 Coaching Centre in Trichy' })).toBeVisible();
  });

  test('unknown state 404s', async ({ request }) => {
    expect((await request.get('/coaching/nata-coaching-in-atlantis')).status()).toBe(404);
  });

  test('the all-India directory lists every state', async ({ page }) => {
    await page.goto('/coaching/nata-coaching');
    await expect(page.getByRole('link', { name: 'NATA coaching in Sikkim' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('Sitemaps, llms.txt and redirects', () => {
  test('/sitemap.xml is an index of child sitemaps', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('/sitemaps/core/sitemap.xml');
    expect(xml).toContain('/sitemaps/coaching-locations/sitemap.xml');
    expect(xml).toContain('/sitemaps/videos/sitemap.xml');
  });

  test('/llms.txt states facts without unverified claims', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    const txt = await res.text();
    expect(txt).toContain('Founded: 2009');
    expect(txt).not.toMatch(/99\.9|2500\+ reviews|#1/);
  });

  test('retired URLs reach their one canonical page in a single hop', async ({ request }) => {
    for (const [from, to] of [
      ['/nata-coaching/pune', city('pune')],
      ['/blog/best-nata-coaching-chennai', city('chennai')],
      ['/nata-coaching-centers-in-chennai', city('chennai')],
      ['/coaching/nata-coaching-center-in-tamil-nadu', '/coaching/nata-coaching-in-tamil-nadu'],
      ['/nata-coaching-in-chennai', city('chennai')],
      ['/nata-coaching-center-in-tamil-nadu', '/coaching/nata-coaching-in-tamil-nadu'],
      ['/contact/nata-coaching-center-in-chennai', city('chennai')],
      ['/contact/nata-coaching-center-in-pudukkottai-nata', city('pudukkottai')],
      ['/coaching/nata-coaching-chennai/tambaram', city('tambaram')],
      ['/NATA-coaching-centers-nearby/x', '/coaching/nata-coaching'],
    ]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect([301, 308], from).toContain(res.status());
      expect(res.headers()['location'], from).toContain(to);
      const next = await request.get(to, { maxRedirects: 0 });
      expect(next.status(), `${to} should not redirect again`).toBe(200);
    }
  });
});
