import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin: Instant UPI desk (Collections › Bank credits) and Settings › Instant UPI.
 *
 * API tests hit the real routes read-only (local Admin reads the staging DB).
 * UI tests mock /api/payments/credits and /api/settings/payment-methods so the
 * buckets, dialogs and guards are checked against known rows. UI tests skip
 * when the runner has no Microsoft session, like the other admin UI specs.
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const NOW = new Date();
const iso = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

const student = { name: 'Arun Kumar R', phone: '+919000000001', userId: 'u1', linkId: 'l1' };
const intent = { id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', purpose: 'enrolment', scheme: 'full', amount_paise: 2500000, status: 'open', user_id: 'u1', enrollment_link_id: 'l1', created_at: iso(60) };
const credit = (over: Record<string, unknown>) => ({
  id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c001',
  source: 'sms',
  source_ref: 'sms-1',
  utr: '628900000001',
  amount_paise: 2500037,
  payer_name: 'ARUN KUMAR R',
  payer_vpa: null,
  credited_at: iso(5),
  received_at: iso(5),
  confidence: 'single_channel',
  sources: ['sms'],
  matched_attempt_id: null,
  shadow_attempt_id: null,
  ignored_at: null,
  raw_redacted: 'Rs.25000.37 credited to a/c XX1183 on 21-10-26 info :UPI/P2A/628900000001/ARUN KUMAR R',
  ...over,
});
const attempt = (over: Record<string, unknown>) => ({
  id: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a001',
  intent_id: intent.id,
  method: 'upi_auto',
  state: 'succeeded',
  amount_paise: 2500037,
  paise_tag: 37,
  utr: '628900000001',
  created_at: iso(30),
  expires_at: iso(0),
  statement_checked: false,
  review_note: null,
  metadata: {},
  ...over,
});

const DESK = {
  unmatched: [credit({})],
  shadow: [],
  held: [
    {
      attempt: attempt({ id: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a002', state: 'awaiting_review', amount_paise: 5500012, metadata: { review_reason: 'above the instant cap' } }),
      intent,
      credit: credit({ id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c002', amount_paise: 5500012, utr: '628900000002' }),
      student,
      payment: null,
      reason: 'above the instant cap',
    },
  ],
  toConfirm: [{ attempt: attempt({}), intent, credit: credit({ id: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c003', matched_attempt_id: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a001' }), student, payment: { id: 'p1', receipt_number: 'NRM-2026-0042', reconciled_at: null, disputed_at: null }, reason: null }],
  disputed: [],
  openIntents: [
    { id: intent.id, purpose: 'enrolment', scheme: 'full', amountPaise: 2500000, createdAt: iso(60), student },
    { id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f02', purpose: 'installment', scheme: null, amountPaise: 1350000, createdAt: iso(600), student: { name: 'Bala Murugan', phone: null, userId: 'u2', linkId: null } },
  ],
  health: {
    healthy: true,
    sources: [
      { source: 'sms:office-phone-1', lastSeenAt: iso(2), minutesAgo: 2 },
      { source: 'email', lastSeenAt: iso(45), minutesAgo: 45 },
    ],
    outbox: { pending: 0, dead: 1 },
    mode: 'shadow',
    policy: { enabled: true, shadowMode: true, orderMinutes: 30, instantCapPaise: 5000000, twoChannelAbovePaise: 3000000, silentAfterMinutes: 10 },
  },
  watchers: { smsSenderKeywords: ['KVBUPI'], emailFromDomains: ['kvb.bank.in'], deviceIds: ['office-phone-1', 'gmail-script'], accountTail: '1183' },
};

const SETTINGS = {
  methods: { upiAuto: { enabled: false, shadowMode: true, orderMinutes: 30, instantCapPaise: 5000000, twoChannelAbovePaise: 3000000, silentAfterMinutes: 10 }, upiProof: { enabled: true }, bankProof: { enabled: true }, razorpay: { enabled: false, feePercent: 2.36 } },
  watchers: { smsSenderKeywords: ['KVB'], emailFromDomains: ['kvb.bank.in'], deviceIds: [], accountTail: null },
  health: { healthy: false, sources: [] },
};

async function mockDesk(page: Page) {
  const posts: { url: string; body: any }[] = [];
  await page.route('**/api/collections?**', (r) => r.fulfill({ json: { year: '2026-27', defaultYear: '2026-27', years: ['2026-27'], hasNoYear: false, rows: [], reports: [], totals: { students: 0, agreed: 0, collected: 0, toCollect: 0, overdueAmount: 0, overdueCount: 0, dueSoonCount: 0, noDateCount: 0, missingFeeCount: 0, openReports: 0 } } }));
  await page.route('**/api/payments/credits', (r) => r.fulfill({ json: DESK }));
  await page.route('**/api/payments/credits/*', (r) => {
    posts.push({ url: r.request().url(), body: JSON.parse(r.request().postData() || '{}') });
    return r.fulfill({ json: { success: true, attemptId: 'a-new' } });
  });
  await page.route('**/api/payments/attempts/*', (r) => {
    posts.push({ url: r.request().url(), body: JSON.parse(r.request().postData() || '{}') });
    return r.fulfill({ json: { success: true } });
  });
  return posts;
}

async function openCollections(page: Page) {
  await page.goto(`${ADMIN}/collections?tab=credits`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Collections' })
    .waitFor({ timeout: 60_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('Instant UPI desk @admin', () => {
  // A cold Admin dev server compiles each route on first hit (30s+); warm them once.
  test.describe.configure({ timeout: 120_000 });
  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(240_000);
    await Promise.all([
      request.get(`${ADMIN}/api/payments/credits`).catch(() => null),
      request.get(`${ADMIN}/api/settings/payment-methods`).catch(() => null),
      request.get(`${ADMIN}/collections?tab=credits`).catch(() => null),
      request.get(`${ADMIN}/settings`).catch(() => null),
    ]);
  });

  test.describe('API', () => {
    test('GET /api/payments/credits returns the buckets and health', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/payments/credits`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const key of ['unmatched', 'shadow', 'held', 'toConfirm', 'disputed', 'openIntents']) expect(Array.isArray(body[key]), key).toBe(true);
      expect(['off', 'shadow', 'live']).toContain(body.health.mode);
      expect(body.health.outbox).toEqual(expect.objectContaining({ pending: expect.any(Number), dead: expect.any(Number) }));
      expect(body.watchers.smsSenderKeywords.length).toBeGreaterThan(0);
    });

    test('GET /api/settings/payment-methods returns methods, watchers and health', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/settings/payment-methods`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.methods.upiAuto).toEqual(expect.objectContaining({ enabled: expect.any(Boolean), shadowMode: expect.any(Boolean), instantCapPaise: expect.any(Number) }));
      expect(Array.isArray(body.watchers.deviceIds)).toBe(true);
      expect(Array.isArray(body.health.sources)).toBe(true);
    });

    test('PUT refuses to take Instant UPI live with no watcher device', async ({ request }) => {
      const res = await request.put(`${ADMIN}/api/settings/payment-methods`, {
        data: { methods: { ...SETTINGS.methods, upiAuto: { ...SETTINGS.methods.upiAuto, enabled: true, shadowMode: false } }, watchers: { ...SETTINGS.watchers, deviceIds: [] } },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.fieldErrors.deviceIds).toMatch(/device id/);
    });

    test('credit and attempt actions refuse a malformed id and an unknown action', async ({ request }) => {
      const bad = await request.post(`${ADMIN}/api/payments/credits/not-a-uuid`, { data: { action: 'ignore', reason: 'test' } });
      expect([400, 401]).toContain(bad.status());
      const unknown = await request.post(`${ADMIN}/api/payments/attempts/a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a001`, { data: { action: 'nope' } });
      expect([400, 401]).toContain(unknown.status());
    });
  });

  test.describe('UI', () => {
    test('the desk shows the mode, both watchers, and every bucket with its rows', async ({ page }) => {
      await mockDesk(page);
      await openCollections(page);
      const desk = page.getByTestId('bank-credits-desk');
      await expect(desk.getByText('Shadow mode: matching, not enrolling')).toBeVisible();
      await expect(desk.getByText(/Phone office-phone-1 · 2 min ago/)).toBeVisible();
      await expect(desk.getByText(/Gmail script · 45 min ago/)).toBeVisible();
      await expect(desk.getByText('1 stuck job')).toBeVisible();

      await expect(page.getByTestId('desk-held').getByText('Arun Kumar R · ₹55,000.12')).toBeVisible();
      await expect(page.getByTestId('desk-held').getByText(/Held: above the instant cap/)).toBeVisible();
      await expect(page.getByTestId('desk-unmatched').getByText('₹25,000.37')).toBeVisible();
      await expect(page.getByTestId('desk-confirm').getByText(/receipt NRM-2026-0042/)).toBeVisible();
      await expect(page.getByTestId('desk-disputed').getByText('No open disputes.')).toBeVisible();
      await expect(page.getByTestId('desk-shadow').getByText(/No shadow matches/)).toBeVisible();
    });

    test('Assign never preselects a student; the closest request is listed first and the pick is posted', async ({ page }) => {
      const posts = await mockDesk(page);
      await openCollections(page);
      await page.getByTestId('desk-unmatched').getByRole('button', { name: 'Assign to a student' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Assign this credit to a student' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Assign' })).toBeDisabled();
      await dialog.getByRole('combobox').click();
      const options = page.getByRole('option');
      // The ₹25,000 request ranks above the ₹13,500 one for a ₹25,000.37 credit.
      await expect(options.nth(1)).toContainText('Arun Kumar R · ₹25,000');
      await options.nth(1).click();
      await dialog.getByRole('button', { name: 'Assign' }).click();
      await expect(page.getByText('Assigned. The student is being enrolled and emailed.')).toBeVisible();
      expect(posts[0].url).toContain(`/api/payments/credits/${DESK.unmatched[0].id}`);
      expect(posts[0].body).toEqual(expect.objectContaining({ action: 'assign', intentId: intent.id, force: false }));
    });

    test('Confirm on a held order needs the statement tick', async ({ page }) => {
      const posts = await mockDesk(page);
      await openCollections(page);
      await page.getByTestId('desk-held').getByRole('button', { name: 'Confirm' }).click();
      const dialog = page.getByRole('dialog');
      const submit = dialog.getByRole('button', { name: 'Confirm and enrol' });
      await expect(submit).toBeDisabled();
      await dialog.getByRole('checkbox').check();
      await submit.click();
      await expect(page.getByText('Confirmed. The student is being enrolled and emailed.')).toBeVisible();
      expect(posts[0].body).toEqual(expect.objectContaining({ action: 'confirm', statementChecked: true }));
    });

    test('Seen in statement posts reconcile without a dialog', async ({ page }) => {
      const posts = await mockDesk(page);
      await openCollections(page);
      await page.getByTestId('desk-confirm').getByRole('button', { name: 'Seen in statement' }).click();
      await expect(page.getByText('Ticked. It no longer shows here.')).toBeVisible();
      expect(posts[0].url).toContain(`/api/payments/attempts/${DESK.toConfirm[0].attempt.id}`);
      expect(posts[0].body).toEqual(expect.objectContaining({ action: 'reconcile' }));
    });

    test('Settings › Instant UPI shows the status and refuses live without a device id', async ({ page }) => {
      await page.route('**/api/settings/payment-methods', (r) => r.fulfill({ json: SETTINGS }));
      await page.goto(`${ADMIN}/settings`, { waitUntil: 'domcontentloaded' });
      const rendered = await page
        .locator('#instant-upi')
        .waitFor({ timeout: 60_000 })
        .then(() => true, () => false);
      test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
      const card = page.locator('#instant-upi');
      await expect(card.getByText('No watcher has reported yet')).toBeVisible();
      await card.getByRole('checkbox', { name: /Instant UPI on/ }).check();
      await card.getByRole('checkbox', { name: /Shadow mode/ }).uncheck();
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card.getByText('Add a watcher device id before going live.')).toBeVisible();
    });

    test('no horizontal scroll at 1280px on the desk', async ({ page }) => {
      await mockDesk(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await openCollections(page);
      await expect(page.getByTestId('bank-credits-desk')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  });
});
