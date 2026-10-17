// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** POST /api/support-tickets/[id]/comments: internal notes stay silent, replies move and notify once. */

const db = vi.hoisted(() => ({
  ticket: null as any,
  getSupportTicketByRef: vi.fn(),
  getSupportTicketDetail: vi.fn(),
  startSupportTicket: vi.fn(),
  requestSupportTicketInfo: vi.fn(),
  resolveSupportTicket: vi.fn(),
  addSupportTicketMessage: vi.fn(),
  createUserNotification: vi.fn(),
  sendTicketUpdateEmail: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: { id: 'admin-1', name: 'Real Admin', email: 'a@x' } }) };
      return chain;
    },
  }),
  getSupportTicketByRef: (...a: unknown[]) => db.getSupportTicketByRef(...a),
  getSupportTicketDetail: (...a: unknown[]) => db.getSupportTicketDetail(...a),
  getTicketComments: async () => [],
  startSupportTicket: (...a: unknown[]) => db.startSupportTicket(...a),
  requestSupportTicketInfo: (...a: unknown[]) => db.requestSupportTicketInfo(...a),
  resolveSupportTicket: (...a: unknown[]) => db.resolveSupportTicket(...a),
  addSupportTicketMessage: (...a: unknown[]) => db.addSupportTicketMessage(...a),
  createUserNotification: (...a: unknown[]) => db.createUserNotification(...a),
  sendTicketUpdateEmail: (...a: unknown[]) => db.sendTicketUpdateEmail(...a),
  listOtherTicketsByRequester: async () => [],
}));

import { POST } from './route';

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  ticket_number: 'NERAM-TKT-00001',
  user_id: 'u-1',
  user_name: 'Priya',
  user_email: 'priya@example.com',
  subject: 'Login fails',
  status: 'in_progress',
  ...over,
});

const post = (body: unknown, headers: Record<string, string> = { 'x-neram-admin-id': 'admin-1' }) =>
  POST(
    new Request('http://x/api/support-tickets/t-1/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as any,
    { params: { id: 't-1' } }
  );

beforeEach(() => {
  vi.clearAllMocks();
  db.ticket = ticket();
  db.getSupportTicketByRef.mockImplementation(async () => db.ticket);
  db.getSupportTicketDetail.mockImplementation(async () => ({ ...db.ticket, comments: [], activity: [] }));
  db.addSupportTicketMessage.mockImplementation(async (_t: unknown, input: any) => ({ id: 'c-1', ...input }));
  db.sendTicketUpdateEmail.mockResolvedValue(true);
});

describe('POST /api/support-tickets/[id]/comments', () => {
  it('answers 401 without a verified admin', async () => {
    expect((await post({ content: 'Hello there' }, { 'x-staff-name': 'Hari' })).status).toBe(401);
    expect(db.addSupportTicketMessage).not.toHaveBeenCalled();
  });

  it('an internal note never notifies and never moves the ticket, even on a New ticket', async () => {
    db.ticket = ticket({ status: 'open' });
    const res = await post({ content: 'Could not reproduce on Chrome', internal: true, adminName: 'Spoofed' });
    expect(res.status).toBe(200);
    expect(db.addSupportTicketMessage.mock.calls[0][1]).toMatchObject({ internal: true, author: { id: 'admin-1', name: 'Real Admin' } });
    expect(db.startSupportTicket).not.toHaveBeenCalled();
    expect(db.createUserNotification).not.toHaveBeenCalled();
    expect(db.sendTicketUpdateEmail).not.toHaveBeenCalled();
  });

  it('an internal note cannot ask or resolve', async () => {
    expect((await post({ content: 'note', internal: true, then: 'resolve' })).status).toBe(400);
  });

  it('a public reply on a New ticket starts it, then notifies once as a reply', async () => {
    db.ticket = ticket({ status: 'open' });
    db.startSupportTicket.mockResolvedValue(ticket({ status: 'in_progress' }));
    const res = await post({ content: 'Looking into it now.' });
    expect(res.status).toBe(200);
    expect(db.startSupportTicket).toHaveBeenCalledTimes(1);
    expect(db.createUserNotification).toHaveBeenCalledTimes(1);
    expect(db.createUserNotification.mock.calls[0][0].event_type).toBe('ticket_reply');
    expect(db.sendTicketUpdateEmail.mock.calls[0][0]).toMatchObject({ kind: 'reply', message: 'Looking into it now.' });
  });

  it('then: ask moves first and sends info_requested, not a plain reply', async () => {
    db.requestSupportTicketInfo.mockResolvedValue(ticket({ status: 'waiting_on_student' }));
    const res = await post({ content: 'Which page were you on?', then: 'ask' });
    expect(res.status).toBe(200);
    expect(db.requestSupportTicketInfo).toHaveBeenCalledTimes(1);
    expect(db.sendTicketUpdateEmail).toHaveBeenCalledTimes(1);
    expect(db.sendTicketUpdateEmail.mock.calls[0][0].kind).toBe('info_requested');
  });

  it('then: resolve needs an outcome and leaves the thread alone on a stale ticket', async () => {
    expect((await post({ content: 'Fixed it for you today', then: 'resolve' })).status).toBe(400);
    db.resolveSupportTicket.mockResolvedValue(null);
    const res = await post({ content: 'Fixed it for you today', then: 'resolve', resolution_code: 'fixed' });
    expect(res.status).toBe(409);
    expect(db.addSupportTicketMessage).not.toHaveBeenCalled();
    expect(db.createUserNotification).not.toHaveBeenCalled();
  });

  it('then: ask on a closed ticket answers 409', async () => {
    db.ticket = ticket({ status: 'closed' });
    const res = await post({ content: 'One more question', then: 'ask' });
    expect(res.status).toBe(409);
    expect(db.addSupportTicketMessage).not.toHaveBeenCalled();
  });
});
