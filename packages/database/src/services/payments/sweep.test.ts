// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';
import { sweepPayments } from './sweep';
import { DEFAULT_PAYMENT_METHODS } from './settings';

const bell = vi.fn(async () => undefined);
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));

/**
 * The sweep closes what time has closed: orders past their window expire,
 * and an open intent past its expiry with nothing live under it expires too.
 * It leaves alone anything that is waiting for staff or for the bank.
 */
let db: FakeDb;
const past = '2026-10-19T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';

beforeEach(() => {
  db = fakeDb({
    payment_attempts: [
      { id: 'a-open-late', intent_id: 'i1', state: 'awaiting_credit', expires_at: past },
      { id: 'a-open-fresh', intent_id: 'i1', state: 'awaiting_credit', expires_at: future },
      { id: 'a-review', intent_id: 'i2', state: 'awaiting_review', expires_at: past },
      { id: 'a-created-late', intent_id: 'i3', state: 'created', expires_at: past },
    ],
    payment_intents: [
      { id: 'i1', status: 'open', expires_at: past },
      { id: 'i2', status: 'open', expires_at: past },
      { id: 'i3', status: 'open', expires_at: past },
      { id: 'i4', status: 'open', expires_at: future },
      { id: 'i5', status: 'open', expires_at: null },
    ],
  });
  db.rpcResult = (fn, args) => {
    const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id);
    if (row) row.state = args.p_to_state;
    return { ok: true, attempt: row, duplicate: false };
  };
});

describe('sweepPayments: credits and watchers', () => {
  it('re-runs the matcher on unmatched credits from the last two days, so a credit that arrived before its order still lands', async () => {
    const now = new Date('2026-10-20T00:10:00.000Z');
    db = fakeDb({
      bank_credit_events: [{ id: 'c1', source: 'sms', source_ref: 's1', utr: '628900000009', amount_paise: 2500037, credited_at: '2026-10-20T00:04:00.000Z', received_at: '2026-10-20T00:04:00.000Z', confidence: 'single_channel', matched_attempt_id: null, shadow_attempt_id: null, ignored_at: null }],
      payment_attempts: [{ id: 'a1', intent_id: 'i1', method: 'upi_auto', state: 'awaiting_credit', amount_paise: 2500037, paise_tag: 37, created_at: '2026-10-20T00:05:00.000Z', expires_at: '2026-10-20T00:35:00.000Z' }],
      payment_intents: [{ id: 'i1', purpose: 'enrolment', enrollment_link_id: 'l1', user_id: 'u1', status: 'open', amount_paise: 2500000 }],
      payment_outbox: [],
      watcher_heartbeats: [],
    });
    db.rpcResult = (fn, args) => {
      const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id)!;
      row.state = args.p_to_state;
      return { ok: true, attempt: row, duplicate: false };
    };
    const result = await sweepPayments(db.client, now, { policy: { ...DEFAULT_PAYMENT_METHODS.upiAuto, enabled: true, shadowMode: false }, silentAfterMinutes: 10 });
    expect(result.creditsMatched).toBe(1);
    expect(db.rows('payment_attempts')[0].state).toBe('succeeded');
    expect(db.rows('bank_credit_events')[0].matched_attempt_id).toBe('a1');
  });

  it('rings the bell for a silent watcher', async () => {
    const now = new Date('2026-10-20T00:10:00.000Z');
    db = fakeDb({ bank_credit_events: [], payment_attempts: [], payment_intents: [], watcher_heartbeats: [{ source: 'email', last_seen_at: '2026-10-19T23:00:00.000Z', silent_notified_at: null }] });
    const result = await sweepPayments(db.client, now, { policy: DEFAULT_PAYMENT_METHODS.upiAuto, silentAfterMinutes: 10 });
    expect(result.watchersSilent).toEqual(['email']);
    expect(bell).toHaveBeenCalledTimes(1);
  });
});

describe('sweepPayments', () => {
  it('expires late open orders through the state machine and nothing else', async () => {
    const result = await sweepPayments(db.client, new Date('2026-10-20T00:00:00.000Z'));
    const byId = Object.fromEntries(db.rows('payment_attempts').map((r) => [r.id, r.state]));
    expect(byId).toEqual({ 'a-open-late': 'expired', 'a-open-fresh': 'awaiting_credit', 'a-review': 'awaiting_review', 'a-created-late': 'expired' });
    expect(db.rpcCalls.every((c) => c.fn === 'payments_transition' && c.args.p_to_state === 'expired')).toBe(true);
    expect(result.attemptsExpired).toBe(2);
  });

  it('expires open intents past their time unless something is still live under them', async () => {
    const result = await sweepPayments(db.client, new Date('2026-10-20T00:00:00.000Z'));
    const byId = Object.fromEntries(db.rows('payment_intents').map((r) => [r.id, r.status]));
    // i1: its fresh order is still awaiting credit, so it stays open. i2: under review, stays. i3: nothing live, expires.
    expect(byId).toEqual({ i1: 'open', i2: 'open', i3: 'expired', i4: 'open', i5: 'open' });
    expect(result.intentsExpired).toBe(1);
  });
});

describe('sweepPayments: review fixes', () => {
  const policy = { ...DEFAULT_PAYMENT_METHODS.upiAuto, enabled: true, shadowMode: false };
  const watchers = { smsSenderKeywords: ['KVB'], emailFromDomains: ['kvb.bank.in'], deviceIds: [], accountTail: null };

  it('finishes inbox rows that were written but never processed (older than two minutes)', async () => {
    const now = new Date('2026-10-20T00:10:00.000Z');
    db = fakeDb({
      webhook_inbox: [
        {
          id: 'in-1',
          provider: 'observer_sms',
          event_id: 'office-phone:1',
          device_id: 'office-phone',
          signature_ok: true,
          received_at: '2026-10-20T00:05:00.000Z',
          processed_at: null,
          body: { source: 'sms', sender: 'JD-KVBUPI-S', text: 'Your a/c XXXXXXXXXXXX1183 is credited Rs. 15000.00 from ARUN KUMAR R on 20-Oct-2026.info :UPI/P2A/628900000009. -KVB', receivedAt: '2026-10-20T00:05:00.000Z' },
        },
        { id: 'in-fresh', provider: 'observer_sms', event_id: 'office-phone:2', device_id: 'office-phone', signature_ok: true, received_at: '2026-10-20T00:09:30.000Z', processed_at: null, body: { source: 'sms', sender: 'JD-KVBUPI-S', text: 'x', receivedAt: '2026-10-20T00:09:30.000Z' } },
      ],
      bank_credit_events: [],
      payment_attempts: [],
      payment_intents: [],
      payment_outbox: [],
      watcher_heartbeats: [],
    });
    const r = await sweepPayments(db.client, now, { policy, watchers });
    expect(r.inboxReprocessed).toBe(1);
    expect(db.rows('bank_credit_events')).toHaveLength(1);
    expect(db.rows('bank_credit_events')[0].utr).toBe('628900000009');
    expect(db.rows('webhook_inbox')[0].processed_at).toBeTruthy();
    expect(db.rows('webhook_inbox')[1].processed_at ?? null).toBeNull();
  });

  it('bounds the credit retry to the last two days in the query itself, so old leftovers cannot starve new credits', async () => {
    const now = new Date('2026-10-20T00:10:00.000Z');
    db = fakeDb({
      bank_credit_events: Array.from({ length: 250 }, (_, i) => ({
        id: `c-${i}`,
        amount_paise: 100 + i,
        matched_attempt_id: null,
        shadow_attempt_id: null,
        ignored_at: null,
        received_at: i < 240 ? '2026-09-01T00:00:00.000Z' : '2026-10-19T23:00:00.000Z',
        credited_at: i < 240 ? '2026-09-01T00:00:00.000Z' : '2026-10-19T23:00:00.000Z',
      })),
      payment_attempts: [],
      payment_intents: [],
      payment_outbox: [],
      webhook_inbox: [],
    });
    const r = await sweepPayments(db.client, now, { policy });
    expect(r.creditsRetried).toBe(10);
  });
});
