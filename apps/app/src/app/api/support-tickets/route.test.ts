// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * POST /api/support-tickets ("New request" on /support) shares the creation
 * path with the floating reporter, and GET lists the owner's tickets lean.
 */

const createSupportTicket = vi.fn(async (input: Record<string, unknown>) => ({
  id: 'ticket-9',
  ticket_number: 'NERAM-TKT-00009',
  status: 'open',
  ...input,
}));
const countRecentTicketsByUser = vi.fn(async () => 0);
const listUserTickets = vi.fn(async () => ({
  data: [
    {
      id: 't1',
      ticket_number: 'NERAM-TKT-00001',
      category: 'other',
      subject: 'Hi',
      status: 'waiting_on_student',
      console_logs: [{ message: 'SECRET' }],
      device_info: { ua: 'SECRET' },
      context: { reopens: [] },
      last_reply_by: 'staff',
      last_reply_at: '2026-10-02T00:00:00.000Z',
      student_seen_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
    },
  ],
  total: 1,
}));

vi.mock('@/lib/firebase-admin', () => ({ verifyIdToken: vi.fn(async () => ({ uid: 'u' })) }));

vi.mock('@neram/database', () => {
  const client = {
    from: () => {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        limit: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
      });
      return b;
    },
  };
  return {
    getSupabaseAdminClient: () => client,
    getUserByFirebaseUid: vi.fn(async () => ({ id: 'user-1', name: 'Lead Person', email: null, phone: null })),
    createSupportTicket: (i: Record<string, unknown>) => createSupportTicket(i),
    countRecentTicketsByUser: () => countRecentTicketsByUser(),
    listUserTickets: () => listUserTickets(),
    createAdminNotification: vi.fn(async () => undefined),
    sendTemplateEmail: vi.fn(async () => undefined),
    isWhatsAppConfigured: () => false,
    sendWhatsAppTicketConfirmation: vi.fn(async () => undefined),
  };
});

function req(body?: unknown, url = 'http://localhost/api/support-tickets') {
  return {
    headers: { get: (k: string) => (k === 'Authorization' ? 'Bearer t' : null) },
    json: async () => body,
    url,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/support-tickets', () => {
  test('always files as the Tools App, whatever the body says, and tags the requester', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      req({
        category: 'payment_issue',
        subject: 'Receipt missing',
        description: 'Paid yesterday',
        sourceApp: 'nexus',
        source_app: 'nexus',
        device_info: { browser: 'Chrome' },
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ticket_number: 'NERAM-TKT-00009', ticket_id: 'ticket-9' });
    expect(createSupportTicket.mock.calls[0][0]).toMatchObject({
      source_app: 'app',
      requester_segment: 'lead',
      category: 'payment_issue',
      device_info: { browser: 'Chrome' },
    });
  });

  test('429 past the daily limit', async () => {
    countRecentTicketsByUser.mockResolvedValueOnce(5);
    const { POST } = await import('./route');
    const res = await POST(req({ category: 'other', subject: 'x', description: 'y' }));
    expect(res.status).toBe(429);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });

  test('needs a description', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ category: 'other', subject: 'x', description: ' ' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/support-tickets', () => {
  test('lists lean rows (no logs, device info or context) with an unread flag', async () => {
    const { GET } = await import('./route');
    const res = await GET(req(undefined, 'http://localhost/api/support-tickets?limit=50'));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(body.tickets[0]).not.toHaveProperty('context');
    expect(body.tickets[0].has_unread).toBe(true);
  });
});
