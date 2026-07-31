// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route-level tests for the student app problem reporter.
 *
 * These exist because of a real incident: a non-enrolled lead filed a
 * counseling question through this route and it surfaced in the Nexus teacher
 * inbox as NXS-0110. Two guarantees are asserted here.
 *
 *   1. Only a student with an active enrollment can file.
 *   2. A report writes support_tickets, and nothing ever touches
 *      nexus_foundation_issues.
 *
 * The enrollment rule itself is NOT mocked. The fake Supabase client holds real
 * rows and applies the filters, so isEnrolledStudent runs for real.
 */

let enrollmentRows: Array<Record<string, unknown>> = [];
const tablesTouched: string[] = [];

function fakeAdminClient() {
  return {
    from: (table: string) => {
      tablesTouched.push(table);
      const filters: Array<[string, unknown]> = [];
      const rows = table === 'nexus_enrollments' ? enrollmentRows : [];
      const builder: Record<string, unknown> = {
        select: () => builder,
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
      };
      return builder;
    },
  };
}

const createSupportTicket = vi.fn(async () => ({ id: 'ticket-1', ticket_number: 'TKT-0001' }));
const createAdminNotification = vi.fn(async () => undefined);
const sendTemplateEmail = vi.fn(async () => undefined);

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: vi.fn(async () => ({ uid: 'firebase-uid-1' })),
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
  createSupportTicket: (...args: unknown[]) => createSupportTicket(...(args as [])),
  createAdminNotification: (...args: unknown[]) => createAdminNotification(...(args as [])),
  sendTemplateEmail: (...args: unknown[]) => sendTemplateEmail(...(args as [])),
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

beforeEach(() => {
  enrollmentRows = [];
  tablesTouched.length = 0;
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.com';
});

describe('POST /api/error-reports', () => {
  test('rejects a user with no enrollment and files nothing', async () => {
    enrollmentRows = [];

    const res = await postReport({ title: 'For my cut which college suitable' });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_enrolled');
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('rejects a graduated student whose enrollment is inactive', async () => {
    enrollmentRows = [{ user_id: 'user-1', role: 'student', is_active: false }];

    const res = await postReport({ title: 'Anything' });

    expect(res.status).toBe(403);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('accepts an enrolled student and files a support ticket from the app', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    const res = await postReport({
      title: 'Video will not play',
      description: 'Blank screen on chapter 3',
      category: 'technical_issue',
      page_url: '/tools/counseling/college-predictor',
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ticket_number: 'TKT-0001' });

    expect(createSupportTicket).toHaveBeenCalledTimes(1);
    const [input] = createSupportTicket.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input).toMatchObject({
      user_id: 'user-1',
      subject: 'Video will not play',
      description: 'Blank screen on chapter 3',
      category: 'technical_issue',
      source_app: 'app',
      page_url: '/tools/counseling/college-predictor',
    });
  });

  test('never writes to the Nexus teacher inbox', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    await postReport({ title: 'Video will not play' });

    expect(tablesTouched).not.toContain('nexus_foundation_issues');
  });

  test('absolutises screenshot paths so the Admin view can render them', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    await postReport({
      title: 'Broken layout',
      screenshot_urls: ['user-1/shot.jpg', 'https://cdn.example.com/already-absolute.png'],
    });

    const [input] = createSupportTicket.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.screenshot_urls).toEqual([
      'https://db.example.com/storage/v1/object/public/issue-screenshots/user-1/shot.jpg',
      'https://cdn.example.com/already-absolute.png',
    ]);
  });

  test('falls back to the subject when the optional details box is empty', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    await postReport({ title: 'Just a title', description: '   ' });

    const [input] = createSupportTicket.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.description).toBe('Just a title');
  });

  test('coerces an unknown category rather than trusting the client', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    await postReport({ title: 'Something', category: 'bug' });

    const [input] = createSupportTicket.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.category).toBe('technical_issue');
  });

  test('requires an Authorization header', async () => {
    const res = await postReport({ title: 'Something' }, null);

    expect(res.status).toBe(401);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('requires a title', async () => {
    enrollmentRows = [ACTIVE_STUDENT];

    const res = await postReport({ title: '   ' });

    expect(res.status).toBe(400);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });
});
