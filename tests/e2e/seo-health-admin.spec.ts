import { test, expect, type Page } from '@playwright/test';

/**
 * SEO Health (Admin > SEO Health, /seo).
 *
 * Three layers:
 *  1. Guards: both crons refuse a call without CRON_SECRET, and the admin API
 *     refuses a caller with no token.
 *  2. Against the real API: the summary and findings answer, and ignore then
 *     reopen round-trips. Skips when migration 20261119090000 is not on this
 *     database, or when the test account is not user_type 'admin'.
 *  3. The screen, with the API mocked, at 1280 and 900 wide: KPIs, the issue
 *     list, the URL drawer with its fix advice, the empty state, the
 *     not-connected banner, the Ask Google card (reasons, copy URL then open Search Console), the
 *     "Check my fixes" run and no sideways scroll. Skips when the runner cannot
 *     get past Microsoft sign-in (see the MFA note in CLAUDE.md).
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/seo-health-admin.spec.ts
 */

const ADMIN_BASE = 'http://localhost:3013';

test.describe('SEO Health @admin', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('crons fail closed without the secret', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: ADMIN_BASE });
    for (const job of ['daily', 'weekly', 'indexing']) {
      const res = await anon.get(`/api/cron/seo-audit/${job}`, { failOnStatusCode: false });
      expect(res.status(), job).toBe(401);
    }
    await anon.dispose();
  });

  test('the admin API refuses a caller with no token', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: ADMIN_BASE });
    for (const path of ['/api/seo-audit/summary', '/api/seo-audit/findings', '/api/seo-audit/urls']) {
      const res = await anon.get(path, { failOnStatusCode: false });
      expect([401, 403], path).toContain(res.status());
    }
    for (const kind of ['crawl', 'recheck', 'indexing']) {
      const run = await anon.post('/api/seo-audit/run', { failOnStatusCode: false, data: { kind } });
      expect([401, 403], kind).toContain(run.status());
    }
    await anon.dispose();
  });

  test('summary, findings, and ignore then reopen (real API)', async ({ request }) => {
    const summary = await request.get('/api/seo-audit/summary', { failOnStatusCode: false });
    test.skip(summary.status() === 403 || summary.status() === 401, 'The E2E account is not an admin, or the runner is not signed in.');
    const body = await summary.json();
    test.skip(summary.status() === 500 && /does not exist|schema cache/i.test(body.error ?? ''), 'SEO Health migration is not applied on this database.');
    expect(summary.status()).toBe(200);
    expect(body.coverage).toHaveProperty('expected');
    expect(body.findings.bySeverity).toHaveProperty('critical');

    const list = await (await request.get('/api/seo-audit/findings?status=open')).json();
    test.skip(!list.findings.length, 'No open findings yet: run a crawl first.');
    const f = list.findings[list.findings.length - 1];

    const ignored = await request.patch('/api/seo-audit/findings', { data: { id: f.id, action: 'ignore', note: 'e2e' } });
    expect((await ignored.json()).finding.status).toBe('ignored');
    const reopened = await request.patch('/api/seo-audit/findings', { data: { id: f.id, action: 'reopen' } });
    expect((await reopened.json()).finding.status).toBe('open');

    const bad = await request.patch('/api/seo-audit/findings', { failOnStatusCode: false, data: { id: f.id, action: 'delete' } });
    expect(bad.status()).toBe(400);
  });

  test.describe('screen (API mocked)', () => {
    // The first visit compiles the page in dev.
    test.describe.configure({ timeout: 90_000 });
    const summary = {
      connection: { connected: true, missing: [], siteUrl: 'sc-domain:neramclasses.com', origins: ['https://neramclasses.com'], digest: true },
      runs: [
        { kind: 'search', status: 'ok', trigger: 'cron', started_at: '2026-10-13T03:00:00Z', counts: { rows: 4200, ranges: ['2026-10-08..2026-10-10'] } },
        { kind: 'inspect', status: 'ok', trigger: 'cron', started_at: '2026-10-13T03:01:00Z', counts: { inspected: 400, errors: 0 } },
        { kind: 'crawl', status: 'ok', trigger: 'cron', started_at: '2026-10-13T03:02:00Z', counts: { crawled: 150, remaining: 0, linksChecked: 300, sitemapUrls: 1037 } },
        { kind: 'analyze', status: 'ok', trigger: 'cron', started_at: '2026-10-13T03:04:00Z', counts: { findings: 2, created: 1, resolved: 3, reopened: 0 } },
        { kind: 'digest', status: null },
      ],
      coverage: { expected: 1037, inspected: 900, indexed: 640, crawled: 1037, tracked: 1050 },
      findings: { total: 2, bySeverity: { critical: 1, high: 0, medium: 1, info: 0 }, byCategory: { indexing: 1, performance: 0, onsite: 1, aeo: 0 } },
      aeo: { checks: 4, passing: 4 },
      askGoogle: [
        {
          url: 'https://neramclasses.com/coaching/nata-coaching-in-assam',
          coverage_state: 'Alternate page with proper canonical tag',
          reason: 'Google last read an old canonical on 22 Apr 2026. Ours is fixed, so ask for a re-crawl.',
          waiting: true,
        },
        { url: 'https://neramclasses.com/coaching/jee-paper-2-coaching-in-odisha', coverage_state: 'URL is unknown to Google', reason: 'Google has never seen this page.', waiting: false },
      ],
      search: {
        end: '2026-10-10',
        now: { clicks: 820, impressions: 41000, position: 14.2 },
        prev: { clicks: 700, impressions: 38000, position: 15.1 },
        trend: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, clicks: 20 + (i % 7), impressions: 1200 + i * 10 })),
      },
    };
    const findings = [
      { id: 'f1', rule_id: 'I1', category: 'indexing', severity: 'critical', url: 'https://neramclasses.com/colleges/kerala', title: 'Server error (5xx)', detail: {}, status: 'open', first_seen: '2026-10-12T03:04:00Z', last_seen: '2026-10-13T03:04:00Z' },
      { id: 'f2', rule_id: 'O3', category: 'onsite', severity: 'medium', url: 'https://neramclasses.com/colleges/fees/below-1-lakh', title: 'Page has no canonical link', detail: {}, status: 'open', first_seen: '2026-10-13T03:04:00Z', last_seen: '2026-10-13T03:04:00Z' },
    ];
    const urlDetail = {
      url: { url: findings[1].url, expected_index: true, sitemap: '/sitemaps/core/sitemap.xml', verdict: 'NEUTRAL', coverage_state: 'Duplicate without user-selected canonical', inspected_at: '2026-10-13T03:01:00Z', crawled_at: '2026-10-13T03:02:00Z', http_status: 200, title: 'Colleges under 1 lakh', canonical: null, h1_count: 1, word_count: 640, jsonld_types: ['BreadcrumbList'] },
      findings: [findings[1]],
      queries: [{ query: 'barch colleges low fees', clicks: 3, impressions: 120, position: 8.4 }],
    };

    async function open(page: Page, over: { summary?: object; findings?: object[] } = {}) {
      await page.route('**/api/seo-audit/summary', (r) => r.fulfill({ json: { ...summary, ...over.summary } }));
      await page.route('**/api/seo-audit/findings?*', (r) => r.fulfill({ json: { findings: over.findings ?? findings } }));
      await page.route('**/api/seo-audit/url?*', (r) => r.fulfill({ json: urlDetail }));
      await page.goto('/seo');
      // Either the page or the Microsoft sign-in screen, whichever comes first.
      const heading = page.getByRole('heading', { name: 'SEO Health' });
      await heading
        .or(page.getByRole('button', { name: /Sign in with Microsoft/ }))
        .first()
        .waitFor({ timeout: 45_000 })
        .catch(() => undefined);
      return (await heading.isVisible()) && !/login|microsoftonline/.test(page.url());
    }

    for (const width of [1280, 900]) {
      test(`at ${width}px: KPIs, issues and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        test.skip(!(await open(page)), 'Runner is not signed in to the admin app.');
        await expect(page.getByText('640 of 900')).toBeVisible();
        await expect(page.getByText('Clicks, last 28 days')).toBeVisible();
        await expect(page.getByRole('tab', { name: /Issues \(2\)/ })).toBeVisible();
        await expect(page.getByRole('gridcell', { name: 'Server error (5xx)' })).toBeVisible();
        await expect(page.getByText('Critical').first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        expect(errors.filter((e) => !/favicon|Download the React DevTools/.test(e))).toEqual([]);
      });
    }

    test('a row opens the URL drawer with Google, our crawl and how to fix it', async ({ page }) => {
      test.skip(!(await open(page)), 'Runner is not signed in to the admin app.');
      await page.getByRole('gridcell', { name: 'Page has no canonical link' }).click();
      const drawer = page.getByRole('presentation').last();
      await expect(drawer.getByText('Duplicate without user-selected canonical')).toBeVisible();
      await expect(drawer.getByText(/Every page should name itself as canonical/)).toBeVisible();
      await expect(drawer.getByRole('table', { name: 'Searches this page showed for' })).toContainText('barch colleges low fees');
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('gridcell', { name: 'Server error (5xx)' })).toBeVisible();
    });

    test('the tab is kept in the URL', async ({ page }) => {
      test.skip(!(await open(page)), 'Runner is not signed in to the admin app.');
      await page.route('**/api/seo-audit/urls', (r) => r.fulfill({ json: { urls: [] } }));
      await page.getByRole('tab', { name: /URLs/ }).click();
      await expect(page).toHaveURL(/tab=urls/);
      await expect(page.getByText('No URLs tracked yet')).toBeVisible();
    });

    test('empty list and not-connected banner', async ({ page }) => {
      const notConnected = { ...summary, connection: { ...summary.connection, connected: false, missing: ['GSC_SERVICE_ACCOUNT_KEY'] }, search: null };
      test.skip(!(await open(page, { summary: notConnected, findings: [] })), 'Runner is not signed in to the admin app.');
      await expect(page.getByText('Search Console is not connected yet')).toBeVisible();
      await expect(page.getByText('Nothing to fix')).toBeVisible();
      await expect(page.getByText('Waiting for Search Console data').first()).toBeVisible();
    });

    test('Ask Google: plain reasons, fixed pages marked, URL copied before Search Console opens', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN_BASE });
      const withAccount = { ...summary, connection: { ...summary.connection, accountEmail: 'seo@neramclasses.com' } };
      test.skip(!(await open(page, { summary: withAccount })), 'Runner is not signed in to the admin app.');
      const card = page.getByRole('region', { name: 'Ask Google to index today' });
      await expect(card.getByText('Google last read an old canonical on 22 Apr 2026. Ours is fixed, so ask for a re-crawl.')).toBeVisible();
      await expect(card.getByText('Fixed on our side')).toHaveCount(1);
      await expect(card.getByText('Google has never seen this page.')).toBeVisible();

      // Search Console cannot deep-link to one page any more (a URL in /inspect?id= is a 404), so we open the property.
      const consoleUrl = 'https://search.google.com/search-console?resource_id=sc-domain%3Aneramclasses.com&authuser=seo%40neramclasses.com';
      await expect(card.getByRole('link', { name: 'Open Search Console' })).toHaveAttribute('href', consoleUrl);

      const popup = page.waitForEvent('popup');
      await card.getByRole('button', { name: /Copy URL and open Search Console for \/coaching\/nata-coaching-in-assam/ }).click();
      expect((await popup).url()).toContain('search.google.com');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://neramclasses.com/coaching/nata-coaching-in-assam');

      // One button per row: no separate Copy URL.
      await expect(card.getByRole('button', { name: /^Copy URL of/ })).toHaveCount(0);
      await expect(page.getByText(/Page URL copied\. In Search Console, paste it in the Inspect box/)).toBeVisible();

      await card.getByRole('button', { name: 'Copy all URLs' }).click();
      await expect(page.getByText('2 page URLs copied, one per line.')).toBeVisible();
      expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n')).toEqual([
        'https://neramclasses.com/coaching/nata-coaching-in-assam',
        'https://neramclasses.com/coaching/jee-paper-2-coaching-in-odisha',
      ]);

      for (const target of [
        card.getByRole('button', { name: 'Copy all URLs' }),
        card.getByRole('link', { name: 'Open Search Console' }),
        card.getByRole('button', { name: /Copy URL and open/ }).first(),
        card.getByRole('button', { name: 'Mark asked' }).first(),
      ]) {
        const box = await target.boundingBox();
        expect(box?.height ?? 0, String(target)).toBeGreaterThanOrEqual(44);
      }
    });

    test('Check my fixes runs the recheck and reports what changed', async ({ page }) => {
      test.skip(!(await open(page)), 'Runner is not signed in to the admin app.');
      let posted: any = null;
      await page.route('**/api/seo-audit/run', async (r) => {
        posted = r.request().postDataJSON();
        await r.fulfill({ json: { checked: 12, crawl: { status: 'ok' }, inspect: { status: 'ok' }, analyze: { status: 'ok', resolved: 4, waiting: 9, open: 3 } } });
      });
      await page.getByRole('button', { name: 'Run now' }).click();
      const items = page.getByRole('menuitem');
      await expect(items.first()).toContainText('Check my fixes');
      await items.first().click();
      await expect(page.getByText('Checked 12 pages. 4 fixed, 9 waiting for Google, 3 still open.')).toBeVisible();
      expect(posted).toMatchObject({ kind: 'recheck' });
    });

    test('Ask Google now sends the list and the card shows the last automatic run', async ({ page }) => {
      const auto = {
        ...summary,
        connection: { ...summary.connection, indexingApi: true },
        runs: [...summary.runs, { kind: 'indexing', status: 'ok', trigger: 'cron', started_at: '2026-10-15T03:30:00Z', counts: { requested: 50, errors: 0 } }],
      };
      test.skip(!(await open(page, { summary: auto })), 'Runner is not signed in to the admin app.');
      const card = page.getByRole('region', { name: 'Ask Google to index today' });
      await expect(card.getByText('Sent automatically each morning')).toBeVisible();
      await expect(card.getByText(/Asked Google for 50 pages today|Last asked .*: 50 pages\./)).toBeVisible();
      await expect(card.getByRole('heading', { name: /Next in line \(2\), asked at the next 09:00 IST run/ })).toBeVisible();

      let posted: any = null;
      await page.route('**/api/seo-audit/run', async (r) => {
        posted = r.request().postDataJSON();
        await r.fulfill({ json: { kind: 'indexing', status: 'partial', requested: 3, errors: 1, firstError: 'Indexing API 429: Quota exceeded', hint: "Google's daily Indexing API quota is used up; the rest go tomorrow." } });
      });
      await page.getByRole('button', { name: 'Run now' }).click();
      await page.getByRole('menuitem', { name: /Ask Google now/ }).click();
      await expect(page.getByText("Asked Google for 3 pages. Google's daily Indexing API quota is used up; the rest go tomorrow.")).toBeVisible();
      expect(posted).toMatchObject({ kind: 'indexing' });
    });

    test('buttons meet the 44px target', async ({ page }) => {
      test.skip(!(await open(page)), 'Runner is not signed in to the admin app.');
      for (const name of ['Import URLs', 'Run now']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
      }
    });
  });
});
