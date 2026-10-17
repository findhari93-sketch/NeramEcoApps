// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The auto-close cron. autoCloseSupportTicket is the REAL one from
 * packages/database, run against a fake table, so the outcome rules
 * (waiting closes as no_response, to-confirm keeps its outcome) and the
 * "changed meanwhile" skip are tested end to end.
 */

const state = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  expired: [] as any[],
  activity: [] as any[],
  notify: vi.fn(),
  email: vi.fn(),
}));

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'support_ticket_activity') {
        return { insert: async (row: any) => (state.activity.push(row), { error: null }) };
      }
      let patch: any = null;
      const where: Record<string, unknown> = {};
      const chain: any = {
        update: (p: any) => ((patch = p), chain),
        eq: (col: string, val: unknown) => ((where[col] = val), chain),
        select: () => chain,
        maybeSingle: async () => {
          const row = state.rows.get(String(where.id));
          if (!row || row.status !== where.status) return { data: null, error: null };
          Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
      };
      return chain;
    },
  };
}

vi.mock('@neram/database', async () => {
  const queries = await vi.importActual<typeof import('../../../../../../../packages/database/src/queries/support-tickets')>(
    '../../../../../../../packages/database/src/queries/support-tickets'
  );
  return {
    getSupabaseAdminClient: () => fakeClient(),
    getExpiredSupportTickets: async () => state.expired,
    autoCloseSupportTicket: queries.autoCloseSupportTicket,
    createUserNotification: (...a: unknown[]) => state.notify(...a),
    sendTicketUpdateEmail: (...a: unknown[]) => state.email(...a),
    listOtherTicketsByRequester: async () => [],
  };
});

import { GET } from './route';

const row = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  ticket_number: `NERAM-TKT-0000${id}`,
  user_id: `u-${id}`,
  user_name: 'Priya',
  user_email: `p${id}@example.com`,
  subject: 'Something broke',
  status,
  resolution_code: null,
  resolved_at: null,
  auto_close_at: '2026-10-01T00:00:00Z',
  ...over,
});

const call = (auth?: string) =>
  GET(new Request('http://x/api/cron/support-tickets-auto-close', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = 'shh';
  state.rows.clear();
  state.activity = [];
  state.notify.mockReset().mockResolvedValue({});
  state.email.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('support-tickets-auto-close cron', () => {
  it('answers 401 without the secret, and when CRON_SECRET is unset', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call('Bearer undefined')).status).toBe(401);
  });

  it('closes waiting tickets as no_response and keeps a resolved ticket\'s outcome', async () => {
    const waiting = row('1', 'waiting_on_student');
    const confirm = row('2', 'awaiting_confirmation', { resolution_code: 'fixed', resolved_at: '2026-09-28T00:00:00Z' });
    state.rows.set('1', { ...waiting });
    state.rows.set('2', { ...confirm });
    state.expired = [waiting, confirm];

    const json = await (await call('Bearer shh')).json();
    expect(json).toMatchObject({ scanned: 2, closed: 2, skipped: 0, failed: 0 });

    expect(state.rows.get('1')).toMatchObject({ status: 'closed', resolution_code: 'no_response', auto_close_at: null });
    expect(state.rows.get('2')).toMatchObject({ status: 'closed', resolution_code: 'fixed', auto_close_at: null });
    expect(state.rows.get('1').closed_at).toBeTruthy();

    // A requester-visible auto_closed row for each.
    expect(state.activity).toHaveLength(2);
    expect(state.activity.every((a) => a.action === 'auto_closed' && a.visible_to_student === true && a.actor_id === null)).toBe(true);

    expect(state.notify.mock.calls.map((c) => c[0].event_type)).toEqual(['ticket_closed', 'ticket_closed']);
    expect(state.email.mock.calls.map((c) => [c[0].kind, c[0].outcomeLabel])).toEqual([
      ['auto_closed', 'No reply'],
      ['auto_closed', 'Fixed'],
    ]);
  });

  it('skips a ticket that changed after it was read, and tells nobody', async () => {
    const waiting = row('3', 'waiting_on_student');
    state.rows.set('3', { ...waiting, status: 'in_progress' }); // the requester replied meanwhile
    state.expired = [waiting];

    const json = await (await call('Bearer shh')).json();
    expect(json).toMatchObject({ scanned: 1, closed: 0, skipped: 1 });
    expect(state.rows.get('3').status).toBe('in_progress');
    expect(state.activity).toHaveLength(0);
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.email).not.toHaveBeenCalled();
  });
});
