// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The student side of a support ticket: GET / PATCH /api/support-tickets/[id]
 * and POST /api/support-tickets/[id]/comments.
 *
 * The real @neram/database ticket queries run here (getSupportTicketDetail,
 * moveSupportTicket and friends) against a small in-memory Supabase stand-in,
 * so "staff fields are stripped" and "a stale move answers 409" are tested
 * through the code that does it, not a mock of it.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    /** Runs once before the next update, to simulate someone else moving the ticket. */
    beforeNextUpdate: null as null | (() => void),
    seq: 0,
  };

  function makeBuilder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let returnRows = false;
    let mode: 'many' | 'single' | 'maybe' = 'many';
    let head = false;

    const rows = () => (state.tables[table] ||= []);

    const run = () => {
      let result: Row[] = [];
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload as Row];
        result = list.map((r) => {
          state.seq += 1;
          const row = {
            id: `${table}-${state.seq}`,
            created_at: new Date(Date.now() + state.seq).toISOString(),
            ...r,
          };
          rows().push(row);
          return row;
        });
      } else if (op === 'update') {
        if (state.beforeNextUpdate) {
          const hook = state.beforeNextUpdate;
          state.beforeNextUpdate = null;
          hook();
        }
        result = rows().filter((r) => filters.every((f) => f(r)));
        for (const r of result) Object.assign(r, payload);
      } else {
        result = rows().filter((r) => filters.every((f) => f(r)));
      }
      if (op !== 'select' && !returnRows) return { data: null, error: null, count: null };
      if (head) return { data: null, error: null, count: result.length };
      if (mode === 'single') {
        return result.length === 1
          ? { data: { ...result[0] }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      if (mode === 'maybe') return { data: result[0] ? { ...result[0] } : null, error: null };
      return { data: result.map((r) => ({ ...r })), error: null, count: result.length };
    };

    const b: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (op === 'select') op = 'select';
        else returnRows = true;
        if (opts?.head) head = true;
        return b;
      },
      insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), b),
      update: (p: Row) => ((op = 'update'), (payload = p), b),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
      lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b),
      order: () => b,
      limit: () => b,
      range: () => b,
      single: () => ((mode = 'single'), b),
      maybeSingle: () => ((mode = 'maybe'), b),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return b;
  }

  const client = { from: (table: string) => makeBuilder(table), rpc: async () => ({ data: null, error: null }) };
  return { state, client };
});

const currentUser = vi.hoisted(() => ({ id: 'student-1', name: 'Asha Kumar' }));
const createAdminNotification = vi.hoisted(() => vi.fn(async (_n: Record<string, unknown>) => undefined));

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: vi.fn(async () => ({ uid: 'firebase-uid' })),
}));

vi.mock('@neram/database', async () => {
  const q = await import('../../../../../../../packages/database/src/queries/support-tickets');
  return {
    ...q,
    getSupabaseAdminClient: () => db.client,
    getUserByFirebaseUid: vi.fn(async () => ({
      id: currentUser.id,
      name: currentUser.name,
      first_name: currentUser.name.split(' ')[0],
      email: null,
      phone: null,
    })),
    createAdminNotification: (n: Record<string, unknown>) => createAdminNotification(n),
  };
});

const DAY = 86400000;
const TICKET_ID = '11111111-1111-4111-8111-111111111111';

function seed(overrides: Row = {}) {
  db.state.seq = 0;
  db.state.beforeNextUpdate = null;
  db.state.tables = {
    support_tickets: [
      {
        id: TICKET_ID,
        ticket_number: 'NERAM-TKT-00042',
        user_id: 'student-1',
        user_name: 'Asha Kumar',
        user_email: 'asha@example.com',
        user_phone: '9999999999',
        category: 'technical_issue',
        subject: 'Video stops at 2 minutes',
        description: 'Chapter 3 video freezes',
        page_url: '/dashboard',
        source_app: 'app',
        screenshot_urls: ['https://db.example.com/x.jpg'],
        console_logs: [{ level: 'error', message: 'SECRET_STACK_TRACE' }],
        device_info: { browser: 'DEVICE_FINGERPRINT' },
        context: { reopens: [{ reason: 'OLD_SNAPSHOT' }] },
        staff_seen_at: '2026-10-10T00:00:00.000Z',
        assigned_by: 'staff-9',
        status: 'in_progress',
        priority: 'medium',
        assigned_to: 'staff-1',
        resolved_by: null,
        resolution_code: null,
        resolution_notes: null,
        closed_at: null,
        auto_close_at: null,
        duplicate_of: null,
        reopen_count: 0,
        student_seen_at: null,
        last_reply_at: null,
        last_reply_by: null,
        first_response_at: null,
        requester_segment: 'lead',
        created_at: '2026-10-10T00:00:00.000Z',
        updated_at: '2026-10-10T00:00:00.000Z',
        ...overrides,
      },
    ],
    users: [{ id: 'staff-1', name: 'Priya Raman' }],
    support_ticket_comments: [
      {
        id: 'c1',
        ticket_id: TICKET_ID,
        user_id: 'staff-1',
        user_name: 'Priya Raman',
        is_admin: true,
        is_internal: false,
        content: 'Which phone are you using?',
        created_at: '2026-10-11T00:00:00.000Z',
      },
      {
        id: 'c2',
        ticket_id: TICKET_ID,
        user_id: 'staff-1',
        user_name: 'Priya Raman',
        is_admin: true,
        is_internal: true,
        content: 'INTERNAL_NOTE_DO_NOT_SHOW',
        created_at: '2026-10-11T01:00:00.000Z',
      },
    ],
    support_ticket_activity: [
      {
        id: 'a1',
        ticket_id: TICKET_ID,
        actor_id: 'student-1',
        actor_name: 'Asha Kumar',
        action: 'created',
        old_status: null,
        new_status: 'open',
        reason: null,
        metadata: {},
        visible_to_student: true,
        created_at: '2026-10-10T00:00:00.000Z',
      },
      {
        id: 'a2',
        ticket_id: TICKET_ID,
        actor_id: 'staff-1',
        actor_name: 'Priya Raman',
        action: 'priority_changed',
        old_status: 'in_progress',
        new_status: 'in_progress',
        reason: null,
        metadata: { from: 'low', to: 'medium' },
        visible_to_student: false,
        created_at: '2026-10-10T02:00:00.000Z',
      },
    ],
  };
}

const ticketRow = () => db.state.tables.support_tickets[0];
const activityActions = () => db.state.tables.support_ticket_activity.map((a) => a.action);

function req(body?: unknown, auth: string | null = 'Bearer t') {
  return {
    headers: { get: (k: string) => (k === 'Authorization' ? auth : null) },
    json: async () => body,
    url: 'http://localhost/api/support-tickets/x',
  } as unknown as NextRequest;
}

const params = (id = TICKET_ID) => ({ params: Promise.resolve({ id }) });

async function get(id?: string, auth?: string | null) {
  const { GET } = await import('./route');
  return GET(req(undefined, auth === undefined ? 'Bearer t' : auth), params(id));
}
async function patch(body: unknown, id?: string) {
  const { PATCH } = await import('./route');
  return PATCH(req(body), params(id));
}
async function comment(body: unknown, id?: string) {
  const { POST } = await import('./comments/route');
  return POST(req(body), params(id));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.id = 'student-1';
  currentUser.name = 'Asha Kumar';
  seed();
});

describe('GET /api/support-tickets/[id]', () => {
  test('returns the ticket with staff-only fields, internal notes and hidden activity removed', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = JSON.stringify(body);

    for (const leak of [
      'SECRET_STACK_TRACE',
      'DEVICE_FINGERPRINT',
      'OLD_SNAPSHOT',
      'INTERNAL_NOTE_DO_NOT_SHOW',
      'staff-1',
      'staff-9',
      'Raman',
      'priority_changed',
      'asha@example.com',
      '9999999999',
    ]) {
      expect(text, `leaked ${leak}`).not.toContain(leak);
    }
    for (const field of ['console_logs', 'device_info', 'context', 'staff_seen_at', 'assigned_by', 'assigned_to']) {
      expect(body.ticket).not.toHaveProperty(field);
    }

    expect(body.ticket.handler_label).toBe('Priya from Neram');
    expect(body.comments).toEqual([
      expect.objectContaining({ id: 'c1', side: 'staff', author_label: 'Priya from Neram' }),
    ]);
    expect(body.activity.map((a: { action: string }) => a.action)).toEqual(['created']);
    expect(body.activity[0].actor_label).toBe('You');
  });

  test('marks the thread read for the student', async () => {
    await get();
    expect(ticketRow().student_seen_at).toBeTruthy();
  });

  test('accepts the ticket number as well as the id', async () => {
    const res = await get('NERAM-TKT-00042');
    expect(res.status).toBe(200);
    expect((await res.json()).ticket.id).toBe(TICKET_ID);
  });

  test("someone else's ticket answers 404 and is not marked read", async () => {
    currentUser.id = 'student-2';
    const res = await get();
    expect(res.status).toBe(404);
    expect(ticketRow().student_seen_at).toBeNull();
  });

  test('401 without a token', async () => {
    const res = await get(undefined, null);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/support-tickets/[id]', () => {
  test('confirm closes a ticket that awaits confirmation', async () => {
    seed({ status: 'awaiting_confirmation', resolution_code: 'fixed', auto_close_at: new Date(Date.now() + DAY).toISOString() });

    const res = await patch({ action: 'confirm' });

    expect(res.status).toBe(200);
    expect(ticketRow().status).toBe('closed');
    expect(ticketRow().closed_at).toBeTruthy();
    expect(activityActions()).toContain('confirmed');
  });

  test('confirm on a ticket still being worked on answers 409', async () => {
    const res = await patch({ action: 'confirm' });
    expect(res.status).toBe(409);
    expect(ticketRow().status).toBe('in_progress');
  });

  test('reopen within 7 days of closing goes back to work, keeps a snapshot and rings the Admin bell', async () => {
    seed({ status: 'closed', resolution_code: 'fixed', closed_at: new Date(Date.now() - 6 * DAY).toISOString() });

    const res = await patch({
      action: 'reopen',
      reason: 'Still freezes',
      snapshot: { page_url: '/support/x', device_info: { browser: 'Chrome' }, console_logs: [{ level: 'error', message: 'again' }] },
    });

    expect(res.status).toBe(200);
    const row = ticketRow();
    expect(row.status).toBe('in_progress'); // someone owns it
    expect(row.reopen_count).toBe(1);
    expect(row.resolution_code).toBeNull();
    const reopens = (row.context as { reopens: Row[] }).reopens;
    expect(reopens[reopens.length - 1]).toMatchObject({
      reason: 'Still freezes',
      device_info: { browser: 'Chrome' },
      console_logs: [{ level: 'error', message: 'again' }],
    });
    expect(createAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'ticket_reopened', metadata: expect.objectContaining({ ticket_id: TICKET_ID }) }),
    );
  });

  test('reopen while awaiting confirmation is allowed ("still happening")', async () => {
    seed({ status: 'awaiting_confirmation', resolution_code: 'fixed' });
    const res = await patch({ action: 'reopen', reason: 'Nope' });
    expect(res.status).toBe(200);
    expect(ticketRow().status).toBe('in_progress');
  });

  test('reopen more than 7 days after closing answers 409 and points to a new request', async () => {
    seed({ status: 'closed', closed_at: new Date(Date.now() - 8 * DAY).toISOString() });

    const res = await patch({ action: 'reopen', reason: 'Again' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('reopen_window_passed');
    expect(ticketRow().status).toBe('closed');
  });

  test('reopen on a ticket that is still open answers 409', async () => {
    const res = await patch({ action: 'reopen', reason: 'Hmm' });
    expect(res.status).toBe(409);
  });

  test('a ticket moved by someone else meanwhile answers 409 and changes nothing more', async () => {
    seed({ status: 'awaiting_confirmation' });
    db.state.beforeNextUpdate = () => {
      ticketRow().status = 'in_progress';
    };

    const res = await patch({ action: 'confirm' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('changed');
    expect(ticketRow().status).toBe('in_progress');
    expect(activityActions()).not.toContain('confirmed');
  });

  test("someone else's ticket answers 404", async () => {
    seed({ status: 'awaiting_confirmation' });
    currentUser.id = 'student-2';
    const res = await patch({ action: 'confirm' });
    expect(res.status).toBe(404);
    expect(ticketRow().status).toBe('awaiting_confirmation');
  });

  test('an unknown action answers 400', async () => {
    const res = await patch({ action: 'resolve' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/support-tickets/[id]/comments', () => {
  test('a reply while staff wait on the student resumes the ticket and rings the Admin bell', async () => {
    seed({ status: 'waiting_on_student', auto_close_at: new Date(Date.now() + 5 * DAY).toISOString() });

    const res = await comment({ content: 'A Redmi Note 12' });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('in_progress');
    expect(body.comment).toMatchObject({ side: 'student', author_label: 'You', content: 'A Redmi Note 12' });

    const row = ticketRow();
    expect(row.status).toBe('in_progress');
    expect(row.auto_close_at).toBeNull();
    expect(row.last_reply_by).toBe('student');
    expect(activityActions()).toContain('student_replied');

    const saved = db.state.tables.support_ticket_comments.find((c) => c.content === 'A Redmi Note 12');
    expect(saved).toMatchObject({ is_admin: false, is_internal: false, user_id: 'student-1' });
    expect(createAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'ticket_student_replied' }),
    );
  });

  test('a reply on an open ticket keeps its status', async () => {
    const res = await comment({ content: 'Any update?' });
    expect(res.status).toBe(201);
    expect(ticketRow().status).toBe('in_progress');
  });

  test('a reply on a closed ticket answers 409 and saves nothing', async () => {
    seed({ status: 'closed', closed_at: new Date().toISOString() });
    const before = db.state.tables.support_ticket_comments.length;

    const res = await comment({ content: 'Hello?' });

    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/Still happening/);
    expect(db.state.tables.support_ticket_comments.length).toBe(before);
  });

  test("a reply on someone else's ticket answers 404", async () => {
    currentUser.id = 'student-2';
    const res = await comment({ content: 'Hi' });
    expect(res.status).toBe(404);
  });

  test('an empty reply answers 400', async () => {
    const res = await comment({ content: '   ' });
    expect(res.status).toBe(400);
  });
});
