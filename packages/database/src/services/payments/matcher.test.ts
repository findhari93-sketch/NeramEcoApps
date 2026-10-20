// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * The matcher turns a bank credit into money on exactly one order, or into a
 * question for staff. Pinned: exact paise + time window; one match and an open
 * intent → confirmed; shadow mode records but never moves; a paid intent →
 * duplicate flag, never a second enrolment; the cap and the two-channel rule
 * route to staff review; zero or several candidates → unmatched + bell.
 */
const bell = vi.fn(async () => undefined);
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));

import { matchCredit } from './matcher';
import { DEFAULT_PAYMENT_METHODS } from './settings';

const NOW = new Date('2026-10-21T04:10:00.000Z');
const iso = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * 60 * 1000).toISOString();
const live = { ...DEFAULT_PAYMENT_METHODS.upiAuto, enabled: true, shadowMode: false };
const shadow = { ...live, shadowMode: true };

const order = (over: any = {}) => ({ id: 'att-1', intent_id: 'int-1', method: 'upi_auto', state: 'awaiting_credit', amount_paise: 2500037, paise_tag: 37, created_at: iso(-10), expires_at: iso(20), ...over });
const intent = (over: any = {}) => ({ id: 'int-1', purpose: 'enrolment', enrollment_link_id: 'link-1', user_id: 'user-1', status: 'open', amount_paise: 2500000, ...over });
const credit = (over: any = {}) => ({ id: 'cred-1', source: 'sms', source_ref: 'sms-1', utr: '628900000001', amount_paise: 2500037, payer_name: 'ARUN KUMAR R', payer_vpa: null, credited_at: iso(-1), confidence: 'single_channel', matched_attempt_id: null, shadow_attempt_id: null, ...over });

let db: FakeDb;
beforeEach(() => {
  db = fakeDb({ payment_attempts: [order()], payment_intents: [intent()], bank_credit_events: [credit()], payment_outbox: [] });
  // The transition RPC: flip the state in the fake and report ok.
  db.rpcResult = (fn, args) => {
    if (fn !== 'payments_transition') return { ok: false };
    const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id);
    if (!row || !args.p_from_states.includes(row.state)) return { ok: false, code: 'WRONG_STATE', state: row?.state };
    row.state = args.p_to_state;
    Object.assign(row, args.p_patch || {});
    return { ok: true, attempt: row, duplicate: false };
  };
  bell.mockClear();
});

describe('matchCredit', () => {
  it('one open order with the exact paise amount inside the window: confirmed, credit linked', async () => {
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toEqual({ kind: 'matched', attemptId: 'att-1' });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ state: 'succeeded', matched_credit_id: 'cred-1', utr: '628900000001', payer_name: 'ARUN KUMAR R' });
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ matched_attempt_id: 'att-1', match_kind: 'auto' });
    const rpc = db.rpcCalls.find((c) => c.fn === 'payments_transition');
    expect(rpc?.args.p_actor_type).toBe('observer');
    expect(rpc?.args.p_jobs.map((j: any) => j.job)).toEqual(['fulfil_intent']);
  });

  it('one paisa off is not a match', async () => {
    db.rows('bank_credit_events')[0].amount_paise = 2500038;
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toMatchObject({ kind: 'unmatched', candidates: 0 });
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_credit');
    expect(bell).toHaveBeenCalledTimes(1);
  });

  it('a credit from before the order, or more than a day after it expired, does not match', async () => {
    db.rows('bank_credit_events')[0].credited_at = iso(-15);
    expect((await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW)).kind).toBe('unmatched');
    db.rows('payment_attempts')[0].state = 'expired';
    db.rows('payment_attempts')[0].expires_at = iso(-30 * 60);
    db.rows('bank_credit_events')[0].credited_at = iso(-1);
    expect((await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW)).kind).toBe('unmatched');
  });

  it('a late credit on an expired order still confirms it while the intent is open', async () => {
    db.rows('payment_attempts')[0].state = 'expired';
    db.rows('payment_attempts')[0].expires_at = iso(-60);
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toEqual({ kind: 'matched', attemptId: 'att-1' });
  });

  it('shadow mode holds the matched order for staff and records the shadow match; nothing is enrolled', async () => {
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, shadow, NOW);
    expect(r).toEqual({ kind: 'review', attemptId: 'att-1', reason: 'shadow mode' });
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_review');
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ shadow_attempt_id: 'att-1', matched_attempt_id: 'att-1', match_kind: 'auto' });
    const rpc = db.rpcCalls.find((c) => c.fn === 'payments_transition');
    expect(rpc?.args.p_jobs.map((j: any) => j.job)).not.toContain('fulfil_intent');
    expect((bell.mock.calls[0] as any[])[0].title).toMatch(/would have/i);
  });

  it('a credit for an intent that is already paid is a duplicate: flagged, never fulfilled', async () => {
    db.rows('payment_intents')[0].status = 'paid';
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toEqual({ kind: 'duplicate', attemptId: 'att-1' });
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_credit');
    expect(db.rows('payment_outbox').some((j) => j.job === 'flag_duplicate' && j.aggregate_id === 'att-1')).toBe(true);
    expect(db.rows('bank_credit_events')[0].matched_attempt_id).toBeNull();
  });

  it('above the instant cap the order waits for staff, with the credit attached', async () => {
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, { ...live, instantCapPaise: 2000000 }, NOW);
    expect(r).toMatchObject({ kind: 'review', attemptId: 'att-1' });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ state: 'awaiting_review', matched_credit_id: 'cred-1' });
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ matched_attempt_id: 'att-1', match_kind: 'auto' });
  });

  it('above the two-channel threshold a single-channel credit waits for staff; a two-channel one confirms', async () => {
    const policy = { ...live, twoChannelAbovePaise: 2000000 };
    expect((await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, policy, NOW)).kind).toBe('review');
    db = fakeDb({ payment_attempts: [order()], payment_intents: [intent()], bank_credit_events: [credit({ confidence: 'two_channel' })], payment_outbox: [] });
    db.rpcResult = (fn, args) => {
      const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id)!;
      row.state = args.p_to_state;
      return { ok: true, attempt: row, duplicate: false };
    };
    expect((await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, policy, NOW)).kind).toBe('matched');
  });

  it('two open orders on the same tagged amount (should never happen) go to staff, not to a guess', async () => {
    db.rows('payment_attempts').push(order({ id: 'att-2', intent_id: 'int-2' }));
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toMatchObject({ kind: 'unmatched', candidates: 2 });
  });
});

describe('matchCredit: review fixes', () => {
  it('Instant UPI switched off: a matched credit is held for staff, never auto-enrolled', async () => {
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, { ...live, enabled: false }, NOW);
    expect(r).toMatchObject({ kind: 'review', attemptId: 'att-1', reason: 'Instant UPI switched off' });
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_review');
  });

  it('a cancelled order for the same amount inside the window makes the live match a question for staff', async () => {
    db.rows('payment_attempts').push(order({ id: 'att-cancelled', intent_id: 'int-9', state: 'cancelled', created_at: iso(-8) }));
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toMatchObject({ kind: 'review', attemptId: 'att-1' });
    expect((r as any).reason).toMatch(/cancelled/);
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_review');
  });

  it('only a cancelled order matches: unmatched, and the bell says so', async () => {
    db.rows('payment_attempts')[0].state = 'cancelled';
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r.kind).toBe('unmatched');
    expect(bell).toHaveBeenCalledTimes(1);
    expect(String((bell.mock.calls[0] as any[])[0].message)).toMatch(/cancelled/);
  });

  it('a credit for an intent already paid by a proof attempt with the same UTR is the same money: linked, never a duplicate', async () => {
    db.rows('payment_intents')[0].status = 'paid';
    db.rows('payment_intents')[0].paid_attempt_id = 'att-proof';
    db.rows('payment_attempts').push({ id: 'att-proof', intent_id: 'int-1', method: 'upi_proof', state: 'succeeded', amount_paise: 2500000, utr: '628900000001', created_at: iso(-30) });
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r).toEqual({ kind: 'same_payment', attemptId: 'att-proof' });
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ matched_attempt_id: 'att-proof', match_kind: 'auto' });
    expect(db.rows('payment_outbox').some((j) => j.job === 'flag_duplicate')).toBe(false);
    expect(db.rows('payment_attempts')[0].state).toBe('cancelled');
  });

  it('a credit on an intent that expired or was cancelled is unmatched with a bell, not a refund', async () => {
    db.rows('payment_intents')[0].status = 'expired';
    const r = await matchCredit(db.client, db.rows('bank_credit_events')[0] as any, live, NOW);
    expect(r.kind).toBe('unmatched');
    expect(db.rows('payment_outbox').some((j) => j.job === 'flag_duplicate')).toBe(false);
    expect(String((bell.mock.calls[0] as any[])[0].message)).toMatch(/closed/);
  });

  it('claims the credit before confirming, so a credit another writer took meanwhile is left alone', async () => {
    db.rows('bank_credit_events')[0].matched_attempt_id = 'att-elsewhere';
    const stale = { ...db.rows('bank_credit_events')[0], matched_attempt_id: null } as any;
    const r = await matchCredit(db.client, stale, live, NOW);
    expect(r).toEqual({ kind: 'claimed' });
    expect(db.rows('payment_attempts')[0].state).toBe('awaiting_credit');
    expect(db.rows('bank_credit_events')[0].matched_attempt_id).toBe('att-elsewhere');
  });
});
