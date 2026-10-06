import { test, expect, type Page } from '@playwright/test';

/**
 * Marketing Intelligence (the Google Ads agent) in the admin app.
 *
 * Three layers:
 *  1. Guards that need no data: the nightly crons refuse a call without
 *     CRON_SECRET, and the admin API refuses an unauthenticated caller.
 *  2. The full loop against the real API in GOOGLE_ADS_MODE=mock (the default):
 *     audit -> recommendations -> approve and apply -> audit log -> undo.
 *     Skips when the migrations (20261107090000, 20261107090100) are not on
 *     this database yet, or when the test account is not user_type 'admin'.
 *  3. The screens, with the API mocked, at 1280 and 900 wide. Skips when the
 *     runner cannot get past Microsoft sign-in (see the MFA note in CLAUDE.md).
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/marketing-ai-admin.spec.ts
 */

const ADMIN_BASE = 'http://localhost:3013';

test.describe('Marketing Intelligence @admin', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('nightly crons fail closed without the secret', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: ADMIN_BASE });
    for (const job of ['ingest', 'analyze', 'conversions']) {
      const res = await anon.get(`/api/cron/marketing-ai/${job}`, { failOnStatusCode: false });
      expect(res.status(), job).toBe(401);
    }
    await anon.dispose();
  });

  test('the admin API refuses a caller with no token', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: ADMIN_BASE });
    const res = await anon.get('/api/marketing-ai/overview', { failOnStatusCode: false });
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });

  test('audit, approve and apply, audit log, undo (mock Google Ads account)', async ({ request }) => {
    test.setTimeout(180_000);
    const overview = await request.get('/api/marketing-ai/overview', { failOnStatusCode: false });
    test.skip(overview.status() === 403, 'The E2E account is staff but not user_type admin.');
    const body = await overview.json();
    test.skip(overview.status() === 500 && /does not exist|schema cache/i.test(body.error ?? ''), 'Marketing AI migrations are not applied on this database.');
    expect(overview.status()).toBe(200);
    test.skip(body.connection.mode !== 'mock', 'Only runs against the mock account, never a live one.');

    const run = await request.post('/api/marketing-ai/runs', { data: { kind: 'audit' } });
    expect(run.status()).toBe(200);
    const stats = (await run.json()).analyze.stats;
    expect(stats.findings).toBeGreaterThan(0);

    // Safe actions run automatically only on the nightly schedule, so a manual audit leaves them pending.
    const list = await (await request.get('/api/marketing-ai/recommendations?status=pending&category=add_negative')).json();
    const neg = list.items.find((r: any) => r.proposed_change?.kind === 'add_negative');
    expect(neg, 'the mock account always has an off-scope search to block').toBeTruthy();
    expect(neg.evidence.rows.length).toBeGreaterThan(0);

    const approved = await request.post(`/api/marketing-ai/recommendations/${neg.id}/approve`, { data: { execute: true, note: 'e2e' } });
    expect(approved.status()).toBe(200);
    expect((await approved.json()).execution.status).toMatch(/executed|noop/);

    const detail = await (await request.get(`/api/marketing-ai/recommendations/${neg.id}`)).json();
    expect(detail.recommendation.status).toBe('executed');
    expect(detail.audit.map((a: any) => a.event)).toEqual(expect.arrayContaining(['recommendation.approved', 'action.executed']));

    const undoable = detail.actions.find((a: any) => a.can_undo);
    if (undoable) {
      const undo = await request.post(`/api/marketing-ai/actions/${undoable.id}/revert`);
      expect((await undo.json()).status).toBe('executed');
    }

    // Approving twice is refused: the lifecycle only moves forward.
    const again = await request.post(`/api/marketing-ai/recommendations/${neg.id}/approve`, { failOnStatusCode: false, data: {} });
    expect(again.status()).toBe(409);

    // Turning a category to automatic before it has earned it is refused.
    const settings = await request.put('/api/marketing-ai/settings', { failOnStatusCode: false, data: { autonomy: { categories: { bid_raise: 'auto' } } } });
    expect(settings.status()).toBe(409);
  });

  test.describe('screens (API mocked)', () => {
    const overview = {
      budget: { target_cpa_inr: 650, monthly_spend_cap_inr: 7000, in_season: false, season_months: [3, 4, 5, 6], month: '2026-10', spent: 4100, projected: 4240, daily_budgets: 230, budgets_allow: 6992 },
      connection: { mode: 'mock', apiVersion: 'v25', customerId: '1', missing: [], mutationsAllowed: false, conversionActions: { phone: true, demo: false, paid: false } },
      signups: { verified: 31, from_google_ads: 22, spent: 4100, cost_per_google_signup: 186 },
      activity: [{ id: 'a1', recommendation_id: 'r1', title: 'Block "neet" as a phrase match negative', status: 'succeeded', automatic: true, dry_run: false, error: null, created_at: '2026-10-31T01:05:00Z', can_undo: true }],
      report: { week_start: '2026-10-24', summary: 'Spend was ₹1,640 for 9 sign-ups.', next_steps: ['Approve the new ad.'], created_at: '2026-10-31T02:00:00Z' },
      endDate: '2026-10-30',
      notServing: [] as Array<{ campaign_id: string; name: string; reasons: string[] }>,
      historyFrom: '2026-01-01',
      hasData: true,
      last7: period(8400, 13, 646),
      last30: period(36900, 57, 647),
      trend: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, cost: 1100 + (i % 5) * 60, conversions: 1 + (i % 3) })),
      recommendations: { byStatus: { pending_approval: 6, executed: 3, rejected: 1 }, pendingByPriority: { critical: 0, high: 3, medium: 3, low: 0 } },
      eligibility: ['add_negative', 'pause_keyword', 'budget_cut', 'budget_raise', 'bid_cut', 'bid_raise', 'add_keyword', 'new_ad', 'pause_ad'].map((category) => ({ category, decided: 2, approved: 2, rate: 1, eligible: false })),
      settings: {
        autonomy: { level: 2, kill_switch: false, categories: { add_negative: 'auto', budget_cut: 'auto', pause_keyword: 'auto', budget_raise: 'approve', add_keyword: 'approve', new_ad: 'approve', pause_ad: 'approve' } },
        targets: { target_cpa_inr: 650, monthly_spend_cap_inr: 7000, conversions_since: '2026-10-07', proxy_history_since: '2026-01-01', season: { months: [3, 4, 5, 6], target_cpa_inr: 650, monthly_spend_cap_inr: 40000 } },
        guardrails: {},
      },
      runs: { ingest: { status: 'succeeded', trigger: 'cron', started_at: '2026-10-31T00:30:00Z', finished_at: '2026-10-31T00:31:00Z' } },
      conversions: { phone_verified: { uploaded: 22 } },
      autopilot: { actions7d: 0 },
    };
    const rec = {
      id: 'r1',
      rule_id: 'R2',
      category: 'add_negative',
      entity_type: 'search_term',
      entity_id: '1002~neet coaching',
      title: 'Block "neet" as a phrase match negative',
      reason: 'The search "neet coaching centre near me" is outside what Neram sells and has cost ₹310 for 6 clicks with 0 conversions in 30 days.',
      priority: 'medium',
      risk_level: 'low',
      status: 'pending_approval',
      ai_intent: 'other_exam',
      confidence: 0.92,
      ai_assessment: 'NEET is a medical entrance exam, so these searchers will not join NATA coaching.',
      proposed_change: { kind: 'add_negative', campaign_id: '111', text: 'neet', match_type: 'PHRASE' },
      evidence: { window: { from: '2026-10-01', to: '2026-10-30', days: 30 }, rows: [{ key: 'k', label: 'neet coaching centre near me', impressions: 90, clicks: 6, cost: 310, conversions: 0, ctr: 6.67, cpc: 51.67, cpa: null }] },
      created_at: '2026-10-31T01:00:00Z',
      decided_at: null,
    };

    const bidRec = {
      ...rec,
      id: 'r2',
      rule_id: 'R17',
      category: 'bid_raise',
      entity_type: 'keyword',
      title: 'Raise the bid on "nata past papers" from ₹30 to ₹33.2',
      reason: "It brings conversions at ₹140 each over 270 days (6), well under the target of ₹650, but its bid is below the first-page bid of ₹33.2. Based on last season's Sign-up conversions, before the OTP conversion went live.",
      ai_intent: null,
      confidence: null,
      proposed_change: { kind: 'keyword_bid', campaign_id: '111', ad_group_id: '1001', criterion_id: '9007', text: 'nata past papers', from_micros: 30e6, to_micros: 33.2e6, pct: 11 },
      evidence: { ...rec.evidence, proxy: true, facts: { current_bid_inr: 30, proposed_bid_inr: 33.2, first_page_bid_inr: 33.2, quality_score: 6 } },
    };

    async function mockApi(page: Page, over: Partial<typeof overview> = {}) {
      await page.route('**/api/marketing-ai/overview', (r) => r.fulfill({ json: { ...overview, ...over } }));
      await page.route('**/api/marketing-ai/recommendations/r2', (r) => r.fulfill({ json: { recommendation: bidRec, actions: [], audit: [] } }));
      await page.route('**/api/marketing-ai/recommendations?*', (r) => r.fulfill({ json: { items: [rec], connection: overview.connection } }));
      await page.route('**/api/marketing-ai/recommendations/r1', (r) => r.fulfill({ json: { recommendation: rec, actions: [], audit: [] } }));
    }

    async function open(page: Page, path: string, over: Partial<typeof overview> = {}) {
      await mockApi(page, over);
      await page.goto(path);
      // Without a Microsoft session the dashboard layout stays blank (or redirects
      // to /login), so "signed in" means a page heading actually rendered.
      const rendered = await page.locator('main h1, h1').first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
      return rendered && !/login|microsoftonline/.test(page.url());
    }

    for (const width of [1280, 900]) {
      test(`overview at ${width}px shows health, the queue and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        test.skip(!(await open(page, '/marketing-ai')), 'Runner is not signed in to the admin app.');
        await expect(page.getByRole('heading', { name: 'Marketing Intelligence' })).toBeVisible();
        await expect(page.getByText('Cost per conversion')).toBeVisible();
        await expect(page.getByText(/₹4,100 of ₹7,000/)).toBeVisible();
        await expect(page.getByText('Sign-ups this month')).toBeVisible();
        await expect(page.getByText('Automatic', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Undo: Block/ })).toBeVisible();
        await expect(page.getByText('Weekly AI report')).toBeVisible();
        await expect(page.getByText(/Showing a sample account/)).toBeVisible();
        await expect(page.getByRole('link', { name: /Review recommendations \(6\)/ })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }

    test('ads not showing: a red banner that names the campaign and links to billing', async ({ page }) => {
      const stopped = { notServing: [{ campaign_id: '111', name: 'TN Local - NATA 2026', reasons: ['NOT_ELIGIBLE'] }] };
      test.skip(!(await open(page, '/marketing-ai', stopped)), 'Runner is not signed in to the admin app.');
      const banner = page.getByRole('alert').filter({ hasText: 'Ads are not showing' });
      await expect(banner).toContainText('TN Local - NATA 2026');
      await expect(banner.getByRole('link', { name: /Open billing/ })).toHaveAttribute('href', /ads\.google\.com/);
    });

    test('a keyword bid shows the bids and flags last season data', async ({ page }) => {
      test.skip(!(await open(page, '/marketing-ai/recommendations?id=r2')), 'Runner is not signed in to the admin app.');
      const drawer = page.getByRole('presentation').last();
      await expect(drawer.getByText(/Based on last season's conversions/)).toBeVisible();
      const preview = drawer.getByLabel('Bid change for nata past papers');
      await expect(preview).toContainText('Max CPC now');
      await expect(preview).toContainText('₹33.20');
      await expect(preview).toContainText('6/10');
    });

    test('a recommendation separates observed data from the AI and confirms before applying', async ({ page }) => {
      test.skip(!(await open(page, '/marketing-ai/recommendations?id=r1')), 'Runner is not signed in to the admin app.');
      const drawer = page.getByRole('presentation').last();
      await expect(drawer.getByText('What the data shows')).toBeVisible();
      await expect(drawer.getByRole('table', { name: 'Observed Google Ads data' })).toContainText('neet coaching centre near me');
      await expect(drawer.getByText('AI assessment')).toBeVisible();
      await expect(drawer.getByText('Other exam')).toBeVisible();
      await drawer.getByRole('button', { name: 'Approve and apply' }).click();
      await expect(page.getByRole('dialog', { name: 'Approve and apply this change?' })).toContainText('sample account');
    });
  });
});

function period(cost: number, conversions: number, cpa: number) {
  const t = { cost, conversions, cpa, clicks: Math.round(cost / 41), impressions: Math.round(cost / 4), value: 0, ctr: 8.1, cpc: 41, convRate: 6.3, roas: null };
  return { current: t, previous: { ...t, cost: cost * 0.95, cpa: cpa * 1.05 }, change: { cost: 5.3, conversions: 2.1, cpa: -4.8, ctr: 0.4, cpc: 1.2, convRate: 0.6, clicks: 3.1 } };
}
