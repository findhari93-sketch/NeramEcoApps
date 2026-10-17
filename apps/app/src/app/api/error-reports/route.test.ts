// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route-level tests for the Tools App "Report a problem" button.
 *
 * Anyone signed in may report. What these tests hold:
 *   1. A lead (no enrollment) can report, and the ticket says 'lead'. An
 *      enrolled student's says 'enrolled'.
 *   2. Five reports per person per 24 hours, then a friendly 429.
 *   3. A report writes support_tickets only. No nexus_* table is ever written,
 *      and nexus_foundation_issues (the Nexus teacher inbox) is never touched:
 *      a lead's counseling question once surfaced there as NXS-0110.
 *   4. No token, no report.
 *
 * The enrollment lookup is NOT mocked. The fake Supabase client holds real rows
 * and applies the filters, so isEnrolledStudent runs for real.
 */

let enrollmentRows: Array<Record<string, unknown>> = [];
let recentCount = 0;
const touched: Array<{ table: string; op: string }> = [];

function fakeAdminClient() {
  return {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const rows = table === 'nexus_enrollments' ? enrollmentRows : [];
      const builder: Record<string, unknown> = {};
      const record = (op: string) => () => {
        touched.push({ table, op });
        return builder;
      };
      Object.assign(builder, {
        select: record('select'),
        insert: record('insert'),
        update: record('update'),
        upsert: record('upsert'),
        delete: record('delete'),
        limit: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({
            data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)),
            error: null,
          }).then(onFulfilled, onRejected),
      });
      return builder;
    },
  };
}

const createSupportTicket = vi.fn(async (input: Record<string, unknown>) => ({
  id: 'ticket-1',
  ticket_number: 'NERAM-TKT-00001',
  status: 'open',
  ...input,
}));
const createAdminNotification = vi.fn(async (_n: Record<string, unknown>) => undefined);
const sendTemplateEmail = vi.fn(async () => undefined);
const countRecentTicketsByUser = vi.fn(async (_u: string, _since: string) => recentCount);
const verifyIdToken = vi.fn(async (_t: string) => ({ uid: 'firebase-uid-1' }));

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: (t: string) => verifyIdToken(t),
}));

vi.mock('@neram/database', () => ({
  getUserByFirebaseUid: vi.fn(async () => ({
    id: 'user-1',
    name: 'Test Student',
    first_name: 'Test',
    email: 'student@example.com',
    phone: null,
  })),
  getSupabaseAdminClient: () => fakeAdminClient(),
  createSupportTicket: (input: Record<string, unknown>) => createSupportTicket(input),
  createAdminNotification: (n: Record<string, unknown>) => createAdminNotification(n),
  countRecentTicketsByUser: (u: string, since: string) => countRecentTicketsByUser(u, since),
  sendTemplateEmail: () => sendTemplateEmail(),
  isWhatsAppConfigured: () => false,
  sendWhatsAppTicketConfirmation: vi.fn(async () => undefined),
}));

const ACTIVE_STUDENT = { user_id: 'user-1', role: 'student', is_active: true };

function makeRequest(body: unknown, authHeader: string | null = 'Bearer token-abc') {
  return {
    headers: { get: (key: string) => (key === 'Authorization' ? authHeader : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

async function postReport(body: unknown, authHeader?: string | null) {
  const { POST } = await import('./route');
  return POST(makeRequest(body, authHeader === undefined ? 'Bearer token-abc' : authHeader));
}

function lastInput(): Record<string, unknown> {
  const calls = createSupportTicket.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  enrollmentRows = [];
  recentCount = 0;
  touched.length = 0;
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.com';
});

describe('POST /api/error-reports', () => {
  test('a lead with no enrollment can report, and is tagged lead', async () => {
    const res = await postReport({ title: 'For my cut which college suitable' });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ticket_number: 'NERAM-TKT-00001', ticket_id: 'ticket-1' });
    expect(createSupportTicket).toHaveBeenCalledTimes(1);
    expect(lastInput()).toMatchObject({ requester_segment: 'lead', source_app: 'app', user_id: 'user-1' });
  });

  test('a graduated student (inactive enrollment) reports as a lead', async () => {
    enrollmentRows = [{ user_id: 'user-1', role: 'student', is_active: false }];

    const res = await postReport({ title: 'Anything' });

    expect(res.status).toBe(201);
    expect(lastInput().requester_segment).toBe('lead');
  });

  test('an enrolled student is tagged enrolled and the ticket carries the report', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    const res = await postReport({
      title: 'Video will not play',
      description: 'Blank screen on chapter 3',
      category: 'technical_issue',
      page_url: '/tools/counseling/college-predictor',
      console_logs: [{ level: 'error', message: 'boom', at: '2026-10-17T10:00:00.000Z' }],
      device_info: { browser: 'Chrome', scroll_y: 420, online: true },
    });

    expect(res.status).toBe(201);
    expect(lastInput()).toMatchObject({
      user_id: 'user-1',
      subject: 'Video will not play',
      description: 'Blank screen on chapter 3',
      category: 'technical_issue',
      source_app: 'app',
      page_url: '/tools/counseling/college-predictor',
      requester_segment: 'enrolled',
      console_logs: [{ level: 'error', message: 'boom', at: '2026-10-17T10:00:00.000Z' }],
      device_info: { browser: 'Chrome', scroll_y: 420, online: true },
    });
  });

  test('rings the Admin bell with the ticket and the segment', async () => {
    await postReport({ title: 'Video will not play' });

    expect(createAdminNotification).toHaveBeenCalledTimes(1);
    const [n] = createAdminNotification.mock.calls[0];
    expect(n).toMatchObject({
      event_type: 'ticket_created',
      metadata: { ticket_id: 'ticket-1', ticket_number: 'NERAM-TKT-00001', requester_segment: 'lead' },
    });
  });

  test('answers 429 with friendly copy once five reports were sent in 24 hours', async () => {
    recentCount = 5;

    const res = await postReport({ title: 'Sixth one' });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'rate_limited',
      message: 'You have sent a few reports today. We will reply on the ones we have.',
    });
    expect(createSupportTicket).not.toHaveBeenCalled();

    const [userId, since] = countRecentTicketsByUser.mock.calls[0];
    expect(userId).toBe('user-1');
    const ageHours = (Date.now() - new Date(since).getTime()) / 3600000;
    expect(ageHours).toBeGreaterThan(23.9);
    expect(ageHours).toBeLessThan(24.1);
  });

  test('the fifth report of the day still goes through', async () => {
    recentCount = 4;

    const res = await postReport({ title: 'Fifth one' });

    expect(res.status).toBe(201);
  });

  test('never writes a nexus_* table and never touches the Nexus teacher inbox', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    await postReport({ title: 'Video will not play' });
    await postReport({ title: 'Lead question' });

    const nexusWrites = touched.filter((t) => t.table.startsWith('nexus_') && t.op !== 'select');
    expect(nexusWrites).toEqual([]);
    expect(touched.map((t) => t.table)).not.toContain('nexus_foundation_issues');
    // The only nexus table read is the enrollment lookup for the segment tag.
    expect(new Set(touched.filter((t) => t.table.startsWith('nexus_')).map((t) => t.table))).toEqual(
      new Set(['nexus_enrollments']),
    );
  });

  test('absolutises screenshot paths so the Admin view can render them', async () => {
    await postReport({
      title: 'Broken layout',
      screenshot_urls: ['user-1/shot.jpg', 'https://cdn.example.com/already-absolute.png'],
    });

    expect(lastInput().screenshot_urls).toEqual([
      'https://db.example.com/storage/v1/object/public/issue-screenshots/user-1/shot.jpg',
      'https://cdn.example.com/already-absolute.png',
    ]);
  });

  test('falls back to the subject when the optional details box is empty', async () => {
    await postReport({ title: 'Just a title', description: '   ' });

    expect(lastInput().description).toBe('Just a title');
  });

  test('coerces an unknown category rather than trusting the client', async () => {
    await postReport({ title: 'Something', category: 'bug' });

    expect(lastInput().category).toBe('technical_issue');
  });

  test('401 without an Authorization header, and nothing is filed', async () => {
    const res = await postReport({ title: 'Something' }, null);

    expect(res.status).toBe(401);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('401 when the token does not verify', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('expired'));

    const res = await postReport({ title: 'Something' });

    expect(res.status).toBe(401);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('requires a title', async () => {
    const res = await postReport({ title: '   ' });

    expect(res.status).toBe(400);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });
});
