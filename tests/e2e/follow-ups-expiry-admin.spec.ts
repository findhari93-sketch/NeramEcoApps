import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin Follow-ups: old follow-ups close by themselves (2026-10-19).
 *
 *  - the old-follow-ups bar: preview, close now, nightly on or off
 *  - each card says the exam year and where the request came from
 *  - a request with no account can be closed by hand
 *  - "Closed by system" lists what the nightly job closed, with Reopen
 *  - "Where follow-ups come from" explains the sources and the rules
 *
 * API tests hit the real routes (local Admin reads the staging DB) and only
 * read or send invalid input. UI tests mock the page's API calls; they skip when
 * the runner has no Microsoft session, like the other admin UI specs.
 *
 * Run: pnpm test:e2e tests/e2e/follow-ups-expiry-admin.spec.ts --project=admin-chrome --no-deps
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';

const openRows = [
  {
    callback_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    user_id: '11111111-1111-4111-8111-111111111111',
    person_name: 'Kavya R',
    person_phone: '+919876543210',
    status: 'pending',
    due_at: '2026-10-20T12:30:00Z',
    preferred_slot: 'evening',
    query_type: 'aintra_chat',
    notes: 'Aintra chat: chat_1729000000_abc123. Fees for the 1-year course',
    attempt_count: 0,
    last_attempt_at: null,
    assigned_to: null,
    assigned_to_name: null,
    crm_owner_id: null,
    owner_name: null,
    lifecycle_stage: 'lead',
    crm_stage: null,
    contacted_status: null,
    overdue: false,
    demo_registration_id: null,
    interest_level: null,
    flags: [],
    exam_year: 2027,
    exam_year_source: 'stated',
    lifecycle_status: 'active',
    source: 'aintra',
  },
  {
    callback_id: 'aaaaaaaa-0000-4000-8000-000000000002',
    user_id: null,
    person_name: 'Guest Caller',
    person_phone: '9000000105',
    status: 'pending',
    due_at: '2026-10-01T04:30:00Z',
    preferred_slot: null,
    query_type: 'b_arch_counselling',
    notes: null,
    attempt_count: 0,
    last_attempt_at: null,
    assigned_to: null,
    assigned_to_name: null,
    crm_owner_id: null,
    owner_name: null,
    lifecycle_stage: null,
    crm_stage: null,
    contacted_status: null,
    overdue: true,
    demo_registration_id: null,
    interest_level: null,
    flags: [],
    exam_year: null,
    exam_year_source: null,
    lifecycle_status: null,
    source: 'website_form',
  },
];

const expiry = {
  enabled: false,
  total: 2,
  linked: 1,
  byReason: { earlier_season: 1, counselling_over: 1 },
  rows: [
    {
      callback_id: 'bbbbbbbb-0000-4000-8000-000000000001',
      user_id: null,
      matched_user_id: '22222222-2222-4222-8222-222222222222',
      name: 'Old Counselling',
      phone: '9000000104',
      query_type: 'b_arch_counselling',
      created_at: '2026-06-10T05:00:00Z',
      exam_year: 2026,
      reason: 'counselling_over',
    },
    {
      callback_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      user_id: '33333333-3333-4333-8333-333333333333',
      matched_user_id: null,
      name: 'Past Season',
      phone: '9000000102',
      query_type: null,
      created_at: '2026-04-02T05:00:00Z',
      exam_year: 2026,
      reason: 'earlier_season',
    },
  ],
};

const closed = [
  {
    callback_id: 'cccccccc-0000-4000-8000-000000000001',
    user_id: '33333333-3333-4333-8333-333333333333',
    person_name: 'Past Season',
    person_phone: '9000000102',
    query_type: null,
    source: 'website_form',
    notes: null,
    created_at: '2026-04-02T05:00:00Z',
    closed_at: '2026-10-19T22:20:00Z',
    closed_reason: 'earlier_season',
  },
];

async function mockApis(page: Page) {
  const calls: { url: string; body: unknown }[] = [];
  await page.route('**/api/crm/follow-ups?*', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('range') === 'closed') return route.fulfill({ json: { closed, dueCount: 2 } });
    return route.fulfill({ json: { followUps: openRows, dueCount: 2 } });
  });
  await page.route('**/api/crm/follow-ups/expiry', (route) => {
    if (route.request().method() === 'POST') {
      calls.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { success: true, run: { skipped: false, linked: 1, closed: 2, by_reason: expiry.byReason }, enabled: true } });
    }
    return route.fulfill({ json: expiry });
  });
  await page.route('**/api/crm/follow-ups/*/reopen', (route) => {
    calls.push({ url: route.request().url(), body: null });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/crm/follow-ups/*/outcome', (route) => {
    calls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  return calls;
}

async function open(page: Page, path = '/follow-ups') {
  const calls = await mockApis(page);
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Follow-ups' })
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
  return calls;
}

test.describe('Follow-up expiry: API', () => {
  test('preview answers with counts per reason', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/follow-ups/expiry`, { failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
    expect(body.total).toBe(body.rows.length);
    const sum = Object.values(body.byReason as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(body.total);
  });

  test('an unknown action is refused', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/follow-ups/expiry`, { data: { action: 'delete_all' }, failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(400);
  });

  test('closed list loads', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/follow-ups?range=closed`, { failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).closed)).toBe(true);
  });
});

test.describe('Follow-up expiry: page', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.describe.configure({ timeout: 120_000 });

  test('cards say the exam year and where the request came from, with a link to the chat', async ({ page }) => {
    await open(page);
    await expect(page.getByText('2027 exam', { exact: true })).toBeVisible();
    await expect(page.getByText(/From: Aintra chat/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'open the chat' })).toHaveAttribute('href', /aintra-inbox\?c=chat_1729000000_abc123/);
    await expect(page.getByText(/From: Counselling page form/)).toBeVisible();
  });

  test('a request with no account can be closed with a reason', async ({ page }) => {
    const calls = await open(page);
    await page.getByRole('button', { name: 'Close the request from Guest Caller' }).click();
    await page.getByRole('button', { name: 'Next year' }).click();
    await page.getByRole('button', { name: 'Stop follow-up' }).click();
    await expect(page.getByText('Request closed.')).toBeVisible();
    expect(calls.find((c) => c.url.includes('/outcome'))?.body).toMatchObject({ outcome: 'not_interested', reason: 'Next year' });
  });

  test('the bar previews and closes old follow-ups, turning on the nightly job', async ({ page }) => {
    const calls = await open(page);
    await expect(page.getByText(/2 follow-ups no longer need a call/)).toBeVisible();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Old Counselling')).toBeVisible();
    await expect(page.getByText('Attached by phone')).toBeVisible();
    await page.getByRole('button', { name: 'Close 2 now' }).last().click();
    await expect(page.getByLabel('Also close old follow-ups every night from now on')).toBeChecked();
    await page.getByRole('button', { name: 'Close 2', exact: true }).click();
    await expect(page.getByText(/2 closed, 1 attached to their person/)).toBeVisible();
    expect(calls.find((c) => c.url.endsWith('/expiry'))?.body).toEqual({ action: 'run', nightly: true });
  });

  test('Closed by system shows the reason and reopens', async ({ page }) => {
    const calls = await open(page, '/follow-ups?range=closed');
    await expect(page.getByText('Exam season has passed')).toBeVisible();
    await page.getByRole('button', { name: 'Reopen the follow-up for Past Season' }).click();
    await expect(page.getByText('Back on the list, due today.')).toBeVisible();
    expect(calls.some((c) => c.url.includes('/reopen'))).toBe(true);
  });

  test('Where follow-ups come from explains the sources and the nightly rules', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Where follow-ups come from' }).click();
    await expect(page.getByText(/the apply chat and the Aintra chat/)).toBeVisible();
    await expect(page.getByText(/close by themselves/)).toBeVisible();
  });

  test('no horizontal scroll at 1280 and 1024', async ({ page }) => {
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/follow-ups-expiry-${width}.png` });
    }
  });
});
