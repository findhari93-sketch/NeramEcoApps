/**
 * Public tool pages on the Tools app (app.neramclasses.com): what a crawler and
 * a signed-out student get. Every tool is one URL: server-rendered answer,
 * demo and guide for visitors; the full tool for signed-in students.
 *
 * Run: pnpm test:e2e tests/e2e/app-tools-seo.spec.ts --project=app-chrome --no-deps
 * Needs the app dev server on :3011 (pnpm dev:app).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const BASE = APP_URLS.student;

// The app-chrome project loads a saved student session; these pages must be
// tested signed out (and the sign-in test signs in itself).
test.use({ storageState: { cookies: [], origins: [] } });

const TOOL_PATHS = [
  '/tools/nata/cutoff-calculator',
  '/tools/nata/exam-centers',
  '/tools/nata/eligibility-checker',
  '/tools/nata/cost-calculator',
  '/tools/nata/image-crop',
  '/tools/nata/exam-planner',
  '/tools/nata/question-bank',
  '/tools/counseling/college-predictor',
  '/tools/counseling/josaa-predictor',
  '/tools/counseling/rank-predictor',
  '/tools/counseling/insights',
  '/tools/counseling/coa-checker',
];

async function html(request: APIRequestContext, path: string) {
  const res = await request.get(`${BASE}${path}`, { maxRedirects: 0, timeout: 240_000 });
  return { status: res.status(), headers: res.headers(), body: await res.text() };
}

const jsonLd = (body: string) =>
  [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test.describe('Public tool pages: crawler view (no JavaScript)', () => {
  test.setTimeout(300_000);

  for (const path of TOOL_PATHS) {
    test(`${path}: server HTML has the answer, demo and FAQ`, async ({ request }) => {
      const { status, body } = await html(request, path);
      expect(status).toBe(200);
      // One H1, a self canonical, indexable.
      expect(body.match(/<h1\b/g)?.length).toBe(1);
      expect(body).toContain(`<link rel="canonical" href="https://app.neramclasses.com${path}"/>`);
      expect(body).toMatch(/<meta name="robots" content="index, follow"\/>/);
      // Not the splash screen: the demo and the guide are in the HTML.
      expect(body).not.toContain('Loading aiArchitek');
      expect(body).toContain('id="demo-title"');
      expect(body).toContain('How it works');
      // Structured data parses, has WebApplication and FAQPage, and no rating.
      const ld = jsonLd(body);
      const types = ld.map((d) => d['@type']);
      expect(types).toContain('WebApplication');
      expect(types).toContain('FAQPage');
      expect(types).toContain('BreadcrumbList');
      expect(JSON.stringify(ld)).not.toContain('aggregateRating');
      // House rule: no em dashes in visible copy.
      const text = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
      expect(text).not.toContain('—');
    });
  }

  test('a city with a test city is indexed and answers directly', async ({ request }) => {
    const { status, body } = await html(request, '/tools/nata/exam-centers/tamil-nadu/chennai');
    expect(status).toBe(200);
    expect(body).toContain('index, follow');
    expect(body).toMatch(/Chennai is itself a NATA \d{4} test city/);
  });

  test('a state with no test city renders as noindex, follow', async ({ request }) => {
    const { status, body } = await html(request, '/tools/nata/exam-centers/lakshadweep');
    expect(status).toBe(200);
    expect(body).toContain('<meta name="robots" content="noindex, follow"/>');
  });

  test('a city alias and a wrong state redirect permanently to the one URL', async ({ request }) => {
    const alias = await html(request, '/tools/nata/exam-centers/karnataka/bengaluru');
    expect([301, 308]).toContain(alias.status);
    expect(alias.headers.location).toContain('/tools/nata/exam-centers/karnataka/bangalore');

    const wrongState = await html(request, '/tools/nata/exam-centers/kerala/hosur');
    expect([301, 308]).toContain(wrongState.status);
    expect(wrongState.headers.location).toContain('/tools/nata/exam-centers/tamil-nadu/hosur');
  });

  test('unknown places and states with nothing to say are 404', async ({ request }) => {
    expect((await html(request, '/tools/nata/exam-centers/atlantis')).status).toBe(404);
    expect((await html(request, '/tools/counseling/college-predictor/lakshadweep')).status).toBe(404);
  });

  test('old tool URLs redirect straight to the live page', async ({ request }) => {
    for (const [from, to] of [
      ['/tools/cutoff-calculator', '/tools/nata/cutoff-calculator'],
      ['/tools/college-predictor', '/tools/counseling/college-predictor'],
      ['/tools/nata/college-predictor', '/tools/counseling/college-predictor'],
      ['/tools/question-bank', '/tools/nata/question-bank'],
    ]) {
      const r = await html(request, from);
      expect([301, 308], from).toContain(r.status);
      expect(r.headers.location, from).toContain(to);
    }
  });

  test('sitemap index lists both child sitemaps and only indexable URLs', async ({ request }) => {
    const index = await html(request, '/sitemap.xml');
    expect(index.body).toContain('/sitemaps/core/sitemap.xml');
    expect(index.body).toContain('/sitemaps/tools-geo/sitemap.xml');

    const geo = await html(request, '/sitemaps/tools-geo/sitemap.xml');
    const locs = [...geo.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(20);
    expect(locs.some((l) => l.endsWith('/lakshadweep'))).toBe(false);
    // Spot-check that listed pages really are indexable.
    for (const loc of locs.slice(0, 3)) {
      const page = await html(request, new URL(loc).pathname);
      expect(page.status, loc).toBe(200);
      expect(page.body, loc).toContain('index, follow');
    }
  });

  test('robots.txt and llms.txt are served from the routes', async ({ request }) => {
    const robots = await html(request, '/robots.txt');
    expect(robots.body).toContain('Sitemap: https://app.neramclasses.com/sitemap.xml');
    expect(robots.body).toContain('Disallow: /tools/all');
    const llms = await html(request, '/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.body).toContain('/tools/nata/cutoff-calculator');
    expect(llms.body).not.toContain('4.8');
  });
});

test.describe('Public tool pages: signed-out demo', () => {
  test.setTimeout(300_000);

  test('cutoff demo gives the real total and offers sign-in without blocking it', async ({ page }) => {
    await page.goto(`${BASE}/tools/nata/cutoff-calculator`, { waitUntil: 'networkidle' });
    await page.getByLabel('Marks you scored').fill('450');
    await page.getByLabel('NATA Part A').fill('50');
    await page.getByLabel('NATA Part B').fill('70');
    await expect(page.getByText(/^300\s*out of 400$/)).toBeVisible();
    await expect(page.getByText('Board 180 of 200 plus NATA 120 of 200')).toBeVisible();
    const cta = page.getByRole('link', { name: 'Sign in free to continue' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/login?redirect=%2Ftools%2Fnata%2Fcutoff-calculator');
  });

  test('sign-in keeps the inputs for the full tool', async ({ page }) => {
    await page.goto(`${BASE}/tools/nata/cutoff-calculator`, { waitUntil: 'networkidle' });
    await page.getByLabel('Marks you scored').fill('450');
    await page.getByLabel('NATA Part A').fill('50');
    await page.getByLabel('NATA Part B').fill('70');
    await page.getByRole('link', { name: 'Sign in free to continue' }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible();
    const saved = await page.evaluate(() => sessionStorage.getItem('neram_tool_pending:nata-cutoff-calculator'));
    expect(JSON.parse(saved!).input).toMatchObject({ marksSecured: 450, partA: 50, partB: 70 });
    const redirect = await page.evaluate(() => sessionStorage.getItem('neram_auth_redirect_url'));
    expect(redirect).toBe('/tools/nata/cutoff-calculator');
  });

  test('college predictor demo shows three colleges and how many more', async ({ page }) => {
    await page.goto(`${BASE}/tools/counseling/college-predictor/tamil-nadu`, { waitUntil: 'networkidle' });
    await page.getByLabel('Your cutoff out of 400').fill('300');
    const items = page.locator('#demo-title ~ * ol > li');
    await expect(items).toHaveCount(3);
    await expect(page.getByText(/^\+\d+ more college/)).toBeVisible();
  });

  test('a login redirect to another host never lands there', async ({ page }) => {
    await page.goto(`${BASE}/login?redirect=${encodeURIComponent('//evil.example/x')}`, { waitUntil: 'networkidle' });
    const stored = await page.evaluate(() => JSON.stringify(sessionStorage));
    expect(stored).not.toContain('evil.example');
  });
});

test.describe('Public tool pages: phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.setTimeout(300_000);

  for (const path of ['/tools', '/tools/nata/exam-centers/tamil-nadu/hosur', '/tools/counseling/coa-checker/maharashtra', '/tools/counseling/rank-predictor/tnea']) {
    test(`${path}: no sideways scroll, 44px targets, no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await assertNoHorizontalOverflow(page);
      await page.evaluate(() => document.fonts.ready);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main a, main button')]
          .map((el) => ({ text: (el.textContent || '').trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height), w: el.getBoundingClientRect().width }))
          .filter((r) => r.w > 0 && r.h > 0 && r.h < 44)
      );
      expect(small, JSON.stringify(small)).toEqual([]);
      expect(errors.filter((e) => !/Download the React DevTools|favicon/.test(e))).toEqual([]);
    });
  }
});

test.describe('Same URL, signed in', () => {
  test.setTimeout(300_000);
  test.skip(!process.env.E2E_TEST_APP_EMAIL || !process.env.E2E_TEST_APP_PASSWORD, 'Needs E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD');

  test('signing in from the demo opens the full tool on the same page with the inputs kept', async ({ page }) => {
    await page.goto(`${BASE}/tools/nata/cutoff-calculator`, { waitUntil: 'networkidle' });
    await page.getByLabel('Marks you scored').fill('450');
    await page.getByLabel('NATA Part A').fill('50');
    await page.getByLabel('NATA Part B').fill('70');
    await page.getByRole('link', { name: 'Sign in free to continue' }).click();

    const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
    await dialog.getByLabel(/^Email/).fill(process.env.E2E_TEST_APP_EMAIL!);
    await dialog.getByLabel(/^Password/).fill(process.env.E2E_TEST_APP_PASSWORD!);
    await dialog.getByRole('button', { name: /sign in with email/i }).click();

    // Same URL, now the full calculator inside the app shell.
    await expect(page).toHaveURL(/\/tools\/nata\/cutoff-calculator$/, { timeout: 60_000 });
    await expect(page.locator('#demo-title')).toHaveCount(0, { timeout: 60_000 });
    // The session splash shows while the student is registered (slow in dev).
    // A test account without a verified phone then gets the phone modal on top,
    // which hides the page from the accessibility tree, so check the DOM.
    await expect(page.locator('h1', { hasText: 'Cutoff Calculator' })).toBeAttached({ timeout: 120_000 });
    await expect(page.locator('input[value="450"]').first()).toBeAttached({ timeout: 30_000 });
    // The pending input was used once and cleared.
    expect(await page.evaluate(() => sessionStorage.getItem('neram_tool_pending:nata-cutoff-calculator'))).toBeNull();
  });
});
