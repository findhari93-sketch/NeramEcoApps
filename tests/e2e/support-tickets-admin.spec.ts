import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin > Support tickets: the lifecycle API and the split inbox.
 *
 * API walk (real routes, real staging/local DB): a ticket is raised through the
 * marketing form, then Admin starts it, asks the requester, resumes, resolves,
 * gets a 409 for a stale move, reopens, and closes it as a duplicate. The
 * admin-chrome project sends a `test_` staff token on every request
 * (playwright.config.ts), which middleware.ts verifies; the routes never trust a
 * name or id in the body.
 *
 * UI (mocked data, so it does not depend on seed rows): queue counts, the
 * ?ticket= deep link, J/K and R, Copy for Claude Code (clipboard), and the
 * Internal label on staff notes. Skips when the runner has no Microsoft session,
 * like the other admin UI specs.
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/support-tickets-admin.spec.ts
 */

const ADMIN = APP_URLS.admin;
const MARKETING = APP_URLS.marketing;

// ---------------------------------------------------------------------------
// API walk
// ---------------------------------------------------------------------------

test.describe('Support tickets API: lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  let id = '';
  let number = '';
  let otherNumber = '';

  test('a ticket raised on the website lands in New', async ({ request }) => {
    const raise = (subject: string) =>
      request.post(`${MARKETING}/api/support-tickets`, {
        data: {
          userName: 'E2E Ticket Tester',
          userEmail: 'e2e-support@example.com',
          category: 'technical_issue',
          subject,
          description: 'Created by Playwright (support-tickets-admin.spec.ts). Safe to delete.',
          pageUrl: '/en/apply',
          sourceApp: 'marketing',
        },
        failOnStatusCode: false,
      });
    const res = await raise('E2E lifecycle ticket');
    test.skip(res.status() >= 500 || res.status() === 404, `Marketing app is not reachable (${res.status()})`);
    const body = await res.json();
    id = body.ticketId;
    number = body.ticketNumber;
    expect(number).toMatch(/^NERAM-TKT-\d+$/);

    const other = await (await raise('E2E duplicate target')).json();
    otherNumber = other.ticketNumber;

    const list = await request.get(`${ADMIN}/api/support-tickets?queue=new&counts=1&q=${encodeURIComponent(number)}`);
    expect(list.status()).toBe(200);
    const json = await list.json();
    expect(json.data.map((t: any) => t.ticket_number)).toContain(number);
    expect(json.counts.new).toBeGreaterThan(0);
  });

  test('without a staff token the API answers 401', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ extraHTTPHeaders: {} });
    const res = await anon.patch(`${ADMIN}/api/support-tickets/${id || 'NERAM-TKT-00001'}`, {
      data: { action: 'start', staff_name: 'Not Staff' },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });

  test('GET by ticket number returns the detail and a requester card', async ({ request }) => {
    test.skip(!number, 'No ticket was created');
    const res = await request.get(`${ADMIN}/api/support-tickets/${number}?seen=1`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(id);
    expect(json.data.status).toBe('open');
    expect(Array.isArray(json.data.activity)).toBe(true);
    expect(json.requester.segment).toBe('guest');
  });

  test('start, ask, resume, resolve', async ({ request }) => {
    test.skip(!id, 'No ticket was created');
    const move = (data: Record<string, unknown>) => request.patch(`${ADMIN}/api/support-tickets/${id}`, { data, failOnStatusCode: false });

    let res = await move({ action: 'start', staff_name: 'Spoofed Name' });
    expect(res.status()).toBe(200);
    let t = (await res.json()).data;
    expect(t.status).toBe('in_progress');
    expect(t.assigned_to).toBeTruthy();
    expect(t.assignee_name).not.toBe('Spoofed Name');

    res = await move({ action: 'request_info', note: 'Which browser were you using?' });
    expect(res.status()).toBe(200);
    t = (await res.json()).data;
    expect(t.status).toBe('waiting_on_student');
    expect(t.auto_close_at).toBeTruthy();

    res = await move({ action: 'resume' });
    expect((await res.json()).data.status).toBe('in_progress');

    res = await move({ action: 'resolve', resolution_code: 'fixed', note: 'short' });
    expect(res.status()).toBe(400);

    res = await move({ action: 'resolve', resolution_code: 'fixed', note: 'Fixed the form validation. Please try again.' });
    expect(res.status()).toBe(200);
    t = (await res.json()).data;
    expect(t.status).toBe('awaiting_confirmation');
    expect(t.resolution_code).toBe('fixed');
  });

  test('a move the status does not allow answers 409', async ({ request }) => {
    test.skip(!id, 'No ticket was created');
    const res = await request.patch(`${ADMIN}/api/support-tickets/${id}`, { data: { action: 'start' }, failOnStatusCode: false });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('This ticket changed. Refresh to see its latest state.');
  });

  test('reopen, internal note, then close as a duplicate', async ({ request }) => {
    test.skip(!id || !otherNumber, 'No ticket was created');
    let res = await request.patch(`${ADMIN}/api/support-tickets/${id}`, { data: { action: 'reopen', reason: 'Still broken on Safari' } });
    let t = (await res.json()).data;
    expect(['in_progress', 'open']).toContain(t.status);
    expect(t.reopen_count).toBe(1);

    res = await request.post(`${ADMIN}/api/support-tickets/${id}/comments`, { data: { content: 'E2E internal note', internal: true } });
    expect(res.status()).toBe(200);
    t = (await res.json()).ticket;
    expect(t.comments.some((c: any) => c.is_internal && c.content === 'E2E internal note')).toBe(true);

    res = await request.patch(`${ADMIN}/api/support-tickets/${id}`, {
      data: { action: 'close', resolution_code: 'duplicate', duplicate_of_ref: number },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400); // itself

    res = await request.patch(`${ADMIN}/api/support-tickets/${id}`, { data: { action: 'close', resolution_code: 'duplicate', duplicate_of_ref: otherNumber } });
    expect(res.status()).toBe(200);
    t = (await res.json()).data;
    expect(t.status).toBe('closed');
    expect(t.duplicate_of_number).toBe(otherNumber);

    // Tidy the duplicate target too.
    await request.patch(`${ADMIN}/api/support-tickets/${otherNumber}`, {
      data: { action: 'close', resolution_code: 'not_a_bug', note: 'Created by an E2E run, closing.' },
      failOnStatusCode: false,
    });
  });
});

// ---------------------------------------------------------------------------
// UI (mocked API)
// ---------------------------------------------------------------------------

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  ticket_number: `NERAM-TKT-0000${n}`,
  user_id: `u-${n}`,
  user_name: `Requester ${n}`,
  category: 'technical_issue',
  subject: `Ticket subject ${n}`,
  source_app: 'app',
  status: 'open',
  priority: 'medium',
  assigned_to: null,
  resolution_code: null,
  auto_close_at: null,
  closed_at: null,
  last_reply_at: null,
  last_reply_by: null,
  staff_seen_at: null,
  requester_segment: 'lead',
  reopen_count: 0,
  created_at: ago(60 * n),
  updated_at: ago(60 * n),
  screenshot_count: 0,
  assignee_name: null,
  ...over,
});

const LIST = [row(1, { last_reply_by: 'student', last_reply_at: ago(5) }), row(2), row(3)];
const COUNTS = { new: 3, in_progress: 4, waiting: 1, to_confirm: 2, closed: 9, all: 19, mine: 1, unread: 1 };

const detailOf = (n: number) => ({
  ...row(n),
  user_email: 'requester@example.com',
  user_phone: '+919876543210',
  description: 'The question bank spins forever.',
  page_url: '/tools/nata/question-bank',
  enrollment_link_id: null,
  screenshot_urls: [],
  console_logs: [{ level: 'error', message: 'HTTP 500 /api/questions', status: 500, at: ago(61) }],
  device_info: { device_type: 'mobile', browser: 'Chrome', os: 'Android' },
  assigned_at: null,
  resolution_notes: null,
  resolved_by: null,
  resolved_at: null,
  duplicate_of: null,
  assigned_by: null,
  first_response_at: null,
  student_seen_at: null,
  context: {},
  resolver_name: null,
  duplicate_of_number: null,
  comments: [
    { id: 'c1', ticket_id: 't', user_id: 's', user_name: 'Staff Person', is_admin: true, is_internal: true, content: 'Checked the logs, looks like the API.', created_at: ago(30) },
  ],
  activity: [{ id: 'a1', ticket_id: 't', actor_id: null, actor_name: `Requester ${n}`, action: 'created', old_status: null, new_status: 'open', reason: null, metadata: {}, visible_to_student: true, created_at: ago(60 * n) }],
});

async function mockInbox(page: Page) {
  const posts: any[] = [];
  await page.route(/\/api\/support-tickets\?/, (r) => r.fulfill({ json: { success: true, data: LIST, total: LIST.length, hasMore: false, counts: COUNTS } }));
  await page.route('**/api/support-tickets/staff', (r) => r.fulfill({ json: { staff: [{ id: 's', name: 'Staff Person', email: 's@x', avatar_url: null }], me: { id: 's', name: 'Staff Person' } } }));
  await page.route(/\/api\/support-tickets\/[^/?]+\/comments$/, (r) => {
    posts.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ json: { success: true, ticket: detailOf(1) } });
  });
  await page.route(/\/api\/support-tickets\/(NERAM-TKT-\d+|[0-9a-f-]{36})(\?.*)?$/, (r) => {
    const ref = decodeURIComponent(r.request().url().split('/').pop()!.split('?')[0]);
    const n = Number(ref.slice(-1));
    return r.fulfill({
      json: {
        success: true,
        data: detailOf(n),
        requester: { user_id: `u-${n}`, name: `Requester ${n}`, email: 'requester@example.com', phone: null, user_type: 'student', segment: 'lead', enrolled: false, avatar_url: null, other_tickets: [] },
      },
    });
  });
  return { posts };
}

async function open(page: Page, path = '/support-tickets') {
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Support tickets' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('Support inbox UI', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('queue tabs show counts, and the list shows the unread ticket', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    const tabs = page.getByRole('tablist', { name: 'Ticket queues' });
    await expect(tabs.getByRole('tab', { name: /New\s*3/ })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /To confirm\s*2/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /NERAM-TKT-00001: Ticket subject 1, new reply/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('?ticket= deep link opens that ticket, internal notes are labelled', async ({ page }) => {
    await mockInbox(page);
    await open(page, '/support-tickets?ticket=NERAM-TKT-00002');
    const detail = page.getByRole('region', { name: 'Ticket detail' });
    await expect(detail.getByRole('heading', { name: 'Ticket subject 2' })).toBeVisible();
    await expect(detail.getByText('Internal', { exact: true })).toBeVisible();
    await expect(detail.getByText('Checked the logs, looks like the API.')).toBeVisible();
  });

  test('J and K move between tickets, R focuses the reply box', async ({ page }) => {
    await mockInbox(page);
    await open(page);
    await expect(page.getByRole('button', { name: /NERAM-TKT-00001/ })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('j');
    await expect(page).toHaveURL(/ticket=NERAM-TKT-00001/);
    await page.keyboard.press('j');
    await expect(page).toHaveURL(/ticket=NERAM-TKT-00002/);
    await page.keyboard.press('k');
    await expect(page).toHaveURL(/ticket=NERAM-TKT-00001/);
    await expect(page.getByRole('heading', { name: 'Ticket subject 1' })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByRole('textbox', { name: 'Reply' })).toBeFocused();
    // Typing j in the box types, it does not move.
    await page.keyboard.type('just checking');
    await expect(page).toHaveURL(/ticket=NERAM-TKT-00001/);
  });

  test('an internal note is sent as internal', async ({ page }) => {
    const { posts } = await mockInbox(page);
    await open(page, '/support-tickets?ticket=NERAM-TKT-00001');
    await page.getByRole('button', { name: 'Internal note' }).click();
    await page.getByRole('textbox', { name: 'Internal note' }).fill('Only for staff');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ content: 'Only for staff', internal: true });
  });

  test('Copy for Claude Code puts a usable prompt on the clipboard', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ADMIN });
    await mockInbox(page);
    await open(page, '/support-tickets?ticket=NERAM-TKT-00001');
    await page.getByRole('button', { name: 'Copy for Claude Code' }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Debug and fix this user-reported issue in apps/app.');
    expect(text).toContain('NERAM-TKT-00001');
    expect(text).toContain('(tools)/tools/nata/question-bank/page.tsx');
    expect(text).toContain('HTTP 500 /api/questions');
    expect(text).not.toContain('requester@example.com');
    expect(text).not.toContain('9876543210');
    expect(text).not.toContain('Checked the logs'); // internal notes stay out
    await expect(page.getByRole('button', { name: /Copy images/ })).toBeDisabled();
  });
});
