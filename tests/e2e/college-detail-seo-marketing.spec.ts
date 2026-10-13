import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * College detail page SEO/AEO: the raw server HTML (no JavaScript) must carry
 * the H1, the answer-first summary, a visible FAQ that matches the FAQPage
 * JSON-LD exactly, one @graph with the expected types, and no empty headings.
 *
 * Public, read-only pages: there is no data to seed or clean up, and every role
 * (anonymous, student, parent, teacher, admin) sees the same page, so access is
 * covered by the anonymous checks below.
 *
 * Run: pnpm test:e2e --project=marketing-chrome tests/e2e/college-detail-seo-marketing.spec.ts
 */

const BASE = APP_URLS.marketing;
const STATE = 'tamil-nadu';
/** Used when the state listing cannot be read (e.g. empty local data). */
const FALLBACK_PATHS = ['/colleges/karnataka/bms-coa-architecture', '/colleges/chandigarh/cca-chandigarh-architecture'];

type JsonNode = Record<string, unknown>;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, '')).trim();

async function collegePaths(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${BASE}/colleges/${STATE}`);
  if (res.ok()) {
    const html = await res.text();
    const found = Array.from(new Set(Array.from(html.matchAll(new RegExp(`href="(/colleges/${STATE}/[a-z0-9-]+)"`, 'g')), (m) => m[1])));
    if (found.length >= 2) return found.slice(0, 3);
  }
  return FALLBACK_PATHS;
}

function jsonLdBlocks(html: string): JsonNode[] {
  return Array.from(html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g), (m) => JSON.parse(m[1]) as JsonNode);
}

function collegeGraph(html: string): JsonNode[] {
  const blocks = jsonLdBlocks(html).filter((b) => Array.isArray(b['@graph']));
  expect(blocks, 'exactly one @graph script').toHaveLength(1);
  return blocks[0]['@graph'] as JsonNode[];
}

let paths: string[] = [];

test.describe('College detail page SEO (raw HTML)', () => {
  test.beforeAll(async ({ request }) => {
    paths = await collegePaths(request);
  });

  test('AC1: one H1, the summary and a title that fits', async ({ request }) => {
    for (const path of paths) {
      const res = await request.get(`${BASE}${path}`);
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html.match(/<h1[\s>]/g)?.length ?? 0, `${path} h1 count`).toBe(1);
      const summary = html.match(/<p[^>]*id="college-summary"[^>]*>([\s\S]*?)<\/p>/);
      expect(summary, `${path} #college-summary`).not.toBeNull();
      expect(stripTags(summary![1]).split(/\s+/).length).toBeGreaterThanOrEqual(8);
      const title = stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      expect(title.length, `${path} title "${title}"`).toBeGreaterThan(10);
      expect(title.length, `${path} title "${title}"`).toBeLessThanOrEqual(75);
      expect(html).not.toMatch(/will be updated soon|not yet available|N\/A/);
    }
  });

  test('AC2: visible FAQ questions equal the FAQPage JSON-LD', async ({ request }) => {
    for (const path of paths) {
      const html = await (await request.get(`${BASE}${path}`)).text();
      expect(html, `${path} #college-faqs`).toContain('id="college-faqs"');
      const visible = Array.from(html.matchAll(/<h3[^>]*data-faq-question[^>]*>([\s\S]*?)<\/h3>/g), (m) => stripTags(m[1]));
      expect(visible.length, `${path} visible FAQs`).toBeGreaterThan(0);
      const faqPage = collegeGraph(html).find((n) => n['@type'] === 'FAQPage');
      expect(faqPage, `${path} FAQPage`).toBeTruthy();
      const schemaQs = (faqPage!.mainEntity as JsonNode[]).map((q) => q.name as string);
      expect(visible).toEqual(schemaQs);
      // No second FAQPage anywhere else on the page.
      const others = jsonLdBlocks(html).filter((b) => b['@type'] === 'FAQPage');
      expect(others).toHaveLength(0);
    }
  });

  test('AC3: @graph has the page, college, programme and breadcrumb', async ({ request }) => {
    for (const path of paths) {
      const html = await (await request.get(`${BASE}${path}`)).text();
      const graph = collegeGraph(html);
      const types = graph.map((n) => n['@type']);
      for (const t of ['WebPage', 'CollegeOrUniversity', 'EducationalOccupationalProgram', 'BreadcrumbList']) {
        expect(types, `${path} ${t}`).toContain(t);
      }
      const org = graph.find((n) => n['@type'] === 'CollegeOrUniversity')!;
      expect(org).not.toHaveProperty('offers');
      const sameAs = (org.sameAs as string[] | undefined) ?? [];
      expect(sameAs.some((u) => u.includes('neramclasses.com'))).toBe(false);
    }
  });

  test('AC4: no empty headings (every h2 has content before the next h2)', async ({ request }) => {
    for (const path of paths) {
      const html = await (await request.get(`${BASE}${path}`)).text();
      const body = html.slice(html.indexOf('<body'));
      const parts = body.split(/<h2[\s>]/).slice(1);
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) {
        const heading = stripTags(part.slice(0, part.indexOf('</h2>')).replace(/^[^>]*>/, ''));
        const after = part.slice(part.indexOf('</h2>') + 5);
        const content = stripTags(after.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
        const hasControl = /<(input|textarea|button|table|a)\b/.test(after);
        expect(content.length > 0 || hasControl, `${path}: "${heading}" is followed by nothing`).toBe(true);
      }
    }
  });

  test('AC5: a wrong state in the URL 308s to the canonical URL', async ({ request }) => {
    const path = paths[0];
    const slug = path.split('/').pop()!;
    const res = await request.get(`${BASE}/colleges/not-a-real-state/${slug}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(new URL(res.headers()['location'], BASE).pathname).toBe(path);
  });

  test('unknown college is a 404 and noindex', async ({ request }) => {
    const res = await request.get(`${BASE}/colleges/${STATE}/no-such-college-e2e`);
    expect(res.status()).toBe(404);
    const html = await res.text();
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });

  test('anonymous visitor can open the page (public route, no auth)', async ({ page }) => {
    const res = await page.goto(`${BASE}${paths[0]}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('sitemap lists the college with a real lastmod, image sitemap is valid XML', async ({ request }) => {
    const xml = await (await request.get(`${BASE}/sitemaps/core/sitemap.xml`)).text();
    const loc = `https://neramclasses.com${paths[0]}`;
    const block = xml.match(new RegExp(`<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>[\\s\\S]*?</url>`));
    expect(block, 'college in core sitemap').not.toBeNull();
    expect(block![0]).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
    const img = await request.get(`${BASE}/sitemaps/college-images/sitemap.xml`);
    expect(img.status()).toBe(200);
    expect(await img.text()).toContain('<urlset');
  });

  test('llms-full.txt lists B.Arch colleges by state', async ({ request }) => {
    const txt = await (await request.get(`${BASE}/llms-full.txt`)).text();
    expect(txt).toContain('## B.Arch colleges in India');
    expect(txt).toContain(`https://neramclasses.com${paths[0]}`);
  });
});

test.describe('College detail page at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeAll(async ({ request }) => {
    if (!paths.length) paths = await collegePaths(request);
  });

  test('mobile: no horizontal overflow', async ({ page }) => {
    for (const path of paths) {
      await page.goto(`${BASE}${path}`);
      await assertNoHorizontalOverflow(page);
    }
  });

  test('mobile: FAQ rows and related links are at least 44px tall', async ({ page }) => {
    await page.goto(`${BASE}${paths[0]}`);
    await assertTouchTargetSize(page, '#college-faqs .MuiAccordionSummary-root', 44);
    await assertTouchTargetSize(page, 'nav[aria-label="Related pages"] a', 44);
  });

  test('mobile: quick facts are visible in the main column', async ({ page }) => {
    await page.goto(`${BASE}${paths[0]}`);
    await expect(page.getByText('Quick Facts').first()).toBeVisible();
  });
});
