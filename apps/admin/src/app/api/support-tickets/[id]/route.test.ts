// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/support-tickets/[id]: the acting staff member comes only from the
 * verified header, moves are guarded by canTicketMove, a stale move answers
 * 409, and the requester is told about the moves that matter.
 */

const db = vi.hoisted(() => ({
  users: {} as Record<string, { id: string; name: string | null; email: string | null; user_type?: string }>,
  ticket: null as any,
  getSupportTicketByRef: vi.fn(),
  getSupportTicketDetail: vi.fn(),
  startSupportTicket: vi.fn(),
  requestSupportTicketInfo: vi.fn(),
  resumeSupportTicket: vi.fn(),
  resolveSupportTicket: vi.fn(),
  closeSupportTicketByStaff: vi.fn(),
  confirmSupportTicket: vi.fn(),
  reopenSupportTicket: vi.fn(),
  assignSupportTicket: vi.fn(),
  setSupportTicketField: vi.fn(),
  addSupportTicketMessage: vi.fn(),
  markSupportTicketSeen: vi.fn(),
  createUserNotification: vi.fn(),
  sendTicketUpdateEmail: vi.fn(),
}));

function fakeClient() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        limit: () => Promise.resolve({ data: [] }),
        maybeSingle: () => Promise.resolve({ data: table === 'users' ? db.users[String(filters.id)] ?? null : null }),
      };
      return chain;
    },
  };
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => fakeClient(),
  getSupportTicketByRef: (...a: unknown[]) => db.getSupportTicketByRef(...a),
  getSupportTicketDetail: (...a: unknown[]) => db.getSupportTicketDetail(...a),
  startSupportTicket: (...a: unknown[]) => db.startSupportTicket(...a),
  requestSupportTicketInfo: (...a: unknown[]) => db.requestSupportTicketInfo(...a),
  resumeSupportTicket: (...a: unknown[]) => db.resumeSupportTicket(...a),
  resolveSupportTicket: (...a: unknown[]) => db.resolveSupportTicket(...a),
  closeSupportTicketByStaff: (...a: unknown[]) => db.closeSupportTicketByStaff(...a),
  confirmSupportTicket: (...a: unknown[]) => db.confirmSupportTicket(...a),
  reopenSupportTicket: (...a: unknown[]) => db.reopenSupportTicket(...a),
  assignSupportTicket: (...a: unknown[]) => db.assignSupportTicket(...a),
  setSupportTicketField: (...a: unknown[]) => db.setSupportTicketField(...a),
  addSupportTicketMessage: (...a: unknown[]) => db.addSupportTicketMessage(...a),
  markSupportTicketSeen: (...a: unknown[]) => db.markSupportTicketSeen(...a),
  createUserNotification: (...a: unknown[]) => db.createUserNotification(...a),
  sendTicketUpdateEmail: (...a: unknown[]) => db.sendTicketUpdateEmail(...a),
  listOtherTicketsByRequester: async () => [],
}));

import { GET, PATCH } from './route';

const ADMIN = { id: 'admin-1', name: 'Real Admin', email: 'real@neramclasses.com', user_type: 'admin' };

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    ticket_number: 'NERAM-TKT-00001',
    user_id: 'u-1',
    user_name: 'Priya',
    user_email: 'priya@example.com',
    subject: 'Login fails',
    status: 'open',
    assigned_to: null,
    resolution_code: null,
    ...over,
  };
}

function patch(body: unknown, headers: Record<string, string> = { 'x-neram-admin-id': ADMIN.id }) {
  return PATCH(
    new Request('http://x/api/support-tickets/t-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as any,
    { params: { id: 't-1' } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.users = { [ADMIN.id]: ADMIN, 'staff-2': { id: 'staff-2', name: 'Teacher', email: 't@x', user_type: 'teacher' }, 'student-9': { id: 'student-9', name: 'S', email: 's@x', user_type: 'student' } };
  db.ticket = ticket();
  db.getSupportTicketByRef.mockImplementation(async () => db.ticket);
  db.getSupportTicketDetail.mockImplementation(async () => ({ ...db.ticket, comments: [], activity: [] }));
  db.createUserNotification.mockResolvedValue({});
  db.sendTicketUpdateEmail.mockResolvedValue(true);
});

describe('PATCH /api/support-tickets/[id]: who is acting', () => {
  it('answers 401 without a verified admin, whatever the body claims', async () => {
    const res = await patch({ action: 'start', staff_name: 'Hari', assigned_to: ADMIN.id }, { 'x-staff-name': 'Hari' });
    expect(res.status).toBe(401);
    expect(db.startSupportTicket).not.toHaveBeenCalled();
  });

  it('answers 401 when the verified id has no user row', async () => {
    const res = await patch({ action: 'start' }, { 'x-neram-admin-id': 'ghost' });
    expect(res.status).toBe(401);
  });

  it('ignores names and ids sent by the client', async () => {
    db.startSupportTicket.mockResolvedValue(ticket({ status: 'in_progress', assigned_to: ADMIN.id }));
    const res = await patch(
      { action: 'start', staff_name: 'Someone Else', resolved_by: 'Someone Else', adminId: 'staff-2' },
      { 'x-neram-admin-id': ADMIN.id, 'x-staff-name': 'Someone Else' }
    );
    expect(res.status).toBe(200);
    expect(db.startSupportTicket).toHaveBeenCalledWith(db.ticket, { id: ADMIN.id, name: ADMIN.name }, expect.anything());
  });

  it('GET also needs a verified admin', async () => {
    const res = await GET(new Request('http://x/api/support-tickets/t-1') as any, { params: { id: 't-1' } });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/support-tickets/[id]: moves', () => {
  it('answers 409 for a move the status does not allow', async () => {
    db.ticket = ticket({ status: 'closed' });
    const res = await patch({ action: 'resolve', resolution_code: 'fixed', note: 'All fixed now, thanks.' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_allowed');
    expect(db.resolveSupportTicket).not.toHaveBeenCalled();
  });

  it('answers 409 when someone else moved it first', async () => {
    db.startSupportTicket.mockResolvedValue(null);
    const res = await patch({ action: 'start' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('stale');
    expect(json.error).toBe('This ticket changed. Refresh to see its latest state.');
    expect(db.createUserNotification).not.toHaveBeenCalled();
  });

  it('requires an outcome and a 10 character note to resolve', async () => {
    db.ticket = ticket({ status: 'in_progress' });
    expect((await patch({ action: 'resolve', resolution_code: 'fixed', note: 'short' })).status).toBe(400);
    expect((await patch({ action: 'resolve', note: 'A long enough note here' })).status).toBe(400);
    expect((await patch({ action: 'resolve', resolution_code: 'no_response', note: 'A long enough note here' })).status).toBe(400);
    expect((await patch({ action: 'resolve', resolution_code: 'duplicate', note: 'A long enough note here' })).status).toBe(400);
    expect(db.resolveSupportTicket).not.toHaveBeenCalled();
  });

  it('resolves, then tells the requester by bell and email', async () => {
    db.ticket = ticket({ status: 'in_progress' });
    db.resolveSupportTicket.mockResolvedValue(ticket({ status: 'awaiting_confirmation', resolution_code: 'fixed' }));
    const res = await patch({ action: 'resolve', resolution_code: 'fixed', note: 'We fixed the login.' });
    expect(res.status).toBe(200);
    expect(db.resolveSupportTicket).toHaveBeenCalledWith(db.ticket, { id: ADMIN.id, name: ADMIN.name }, { resolution_code: 'fixed', note: 'We fixed the login.' }, expect.anything());
    expect(db.createUserNotification.mock.calls[0][0]).toMatchObject({ user_id: 'u-1', event_type: 'ticket_resolved', metadata: { href: '/support/t-1' } });
    expect(db.sendTicketUpdateEmail.mock.calls[0][0]).toMatchObject({ kind: 'resolved', to: 'priya@example.com', outcomeLabel: 'Fixed', staffName: ADMIN.name });
  });

  it('close as duplicate needs another ticket, not itself', async () => {
    db.ticket = ticket({ status: 'in_progress' });
    expect((await patch({ action: 'close', resolution_code: 'duplicate' })).status).toBe(400);
    expect((await patch({ action: 'close', resolution_code: 'duplicate', duplicate_of_ref: 'NERAM-TKT-00001' })).status).toBe(400);
    db.getSupportTicketByRef.mockImplementation(async (ref: string) => (ref === 'NERAM-TKT-00007' ? ticket({ id: 't-7', ticket_number: 'NERAM-TKT-00007' }) : db.ticket));
    db.closeSupportTicketByStaff.mockResolvedValue(ticket({ status: 'closed', resolution_code: 'duplicate' }));
    const res = await patch({ action: 'close', resolution_code: 'duplicate', duplicate_of_ref: 'NERAM-TKT-00007' });
    expect(res.status).toBe(200);
    expect(db.closeSupportTicketByStaff.mock.calls[0][2]).toMatchObject({ resolution_code: 'duplicate', duplicate_of: 't-7' });
    expect(db.sendTicketUpdateEmail.mock.calls[0][0].kind).toBe('closed');
  });

  it('assigns to the verified caller for "me" and refuses a non-staff assignee', async () => {
    db.assignSupportTicket.mockResolvedValue(ticket({ assigned_to: ADMIN.id }));
    expect((await patch({ action: 'assign', assignee_id: 'me' })).status).toBe(200);
    expect(db.assignSupportTicket).toHaveBeenCalledWith(db.ticket, ADMIN.id, { id: ADMIN.id, name: ADMIN.name }, expect.anything());
    expect((await patch({ action: 'assign', assignee_id: 'student-9' })).status).toBe(400);
    expect((await patch({ action: 'assign', assignee_id: 'staff-2' })).status).toBe(200);
    expect(db.createUserNotification).not.toHaveBeenCalled();
  });

  it('ask requester posts the question and notifies once', async () => {
    db.requestSupportTicketInfo.mockResolvedValue(ticket({ status: 'waiting_on_student' }));
    expect((await patch({ action: 'request_info' })).status).toBe(400);
    const res = await patch({ action: 'request_info', note: 'Which phone are you using?' });
    expect(res.status).toBe(200);
    expect(db.addSupportTicketMessage.mock.calls[0][1]).toMatchObject({ side: 'staff', content: 'Which phone are you using?' });
    expect(db.createUserNotification).toHaveBeenCalledTimes(1);
    expect(db.sendTicketUpdateEmail.mock.calls[0][0].kind).toBe('info_requested');
  });

  it('refuses an unknown action and a bad priority', async () => {
    expect((await patch({ action: 'delete' })).status).toBe(400);
    expect((await patch({ action: 'priority', value: 'urgent' })).status).toBe(400);
  });
});
