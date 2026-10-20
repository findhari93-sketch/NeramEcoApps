// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * The staff side of Instant UPI: the Bank credits desk. Pinned: an unmatched
 * credit can be assigned to an open intent (reusing the live order or making a
 * staff attempt) and the same fulfilment path runs; amounts must agree unless
 * staff force it; a credit can be ignored with a reason; an auto-confirmed
 * payment is ticked against the statement or disputed, and a dispute resolves
 * either way; the desk buckets what staff need to look at.
 */
const bell = vi.fn(async () => undefined);
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));

import { assignCredit, ignoreCredit, reconcileAttempt, disputeAttempt, resolveDispute, listCreditsDesk, rejectHeldAttempt } from './reconcile';
import { DEFAULT_PAYMENT_METHODS } from './settings';

const NOW = new Date('2026-10-21T04:10:00.000Z');
const iso = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * 60 * 1000).toISOString();
const STAFF = 'staff-1';

const intent = (over: any = {}) => ({ id: 'int-1', purpose: 'enrolment', enrollment_link_id: 'link-1', user_id: 'user-1', status: 'open', amount_paise: 2500000, scheme: 'full', created_at: iso(-60), ...over });
const order = (over: any = {}) => ({ id: 'att-1', intent_id: 'int-1', method: 'upi_auto', state: 'awaiting_credit', amount_paise: 2500037, paise_tag: 37, created_at: iso(-10), expires_at: iso(20), matched_credit_id: null, metadata: {}, ...over });
const credit = (over: any = {}) => ({ id: 'cred-1', source: 'sms', source_ref: 'sms-1', utr: '628900000001', amount_paise: 2500037, payer_name: 'ARUN KUMAR R', payer_vpa: null, credited_at: iso(-5), received_at: iso(-5), confidence: 'single_channel', matched_attempt_id: null, shadow_attempt_id: null, ignored_at: null, metadata: {}, ...over });

let db: FakeDb;
beforeEach(() => {
  db = fakeDb({
    payment_attempts: [],
    payment_intents: [intent()],
    bank_credit_events: [credit()],
    payment_outbox: [],
    payment_events: [],
    payments: [],
    users: [{ id: 'user-1', name: 'Arun Kumar', first_name: 'Arun', last_name: 'Kumar', phone: '+919000000001' }],
    direct_enrollment_links: [{ id: 'link-1', student_name: 'Arun Kumar R', status: 'active' }],
    watcher_heartbeats: [{ source: 'sms:office-phone-1', last_seen_at: iso(-2), last_event_at: iso(-30), app_version: '1.0', meta: {} }],
  });
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

describe('assignCredit', () => {
  it('uses the live order on the intent and confirms it as staff, fulfilment queued', async () => {
    db.rows('payment_attempts').push(order());
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r).toEqual({ ok: true, attemptId: 'att-1' });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ state: 'succeeded', matched_credit_id: 'cred-1', utr: '628900000001' });
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ matched_attempt_id: 'att-1', match_kind: 'staff', assigned_by: STAFF });
    const rpc = db.rpcCalls.find((c) => c.fn === 'payments_transition');
    expect(rpc?.args.p_actor_type).toBe('staff');
    expect(rpc?.args.p_actor_id).toBe(STAFF);
    expect(rpc?.args.p_action).toBe('credit_assigned');
    expect(rpc?.args.p_jobs.map((j: any) => j.job)).toEqual(['fulfil_intent']);
  });

  it('makes a staff attempt when the intent has no live order (the student paid an old QR)', async () => {
    db.rows('bank_credit_events')[0].amount_paise = 2500000;
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r.ok).toBe(true);
    const made = db.rows('payment_attempts')[0];
    expect(made).toMatchObject({ intent_id: 'int-1', method: 'upi_auto', state: 'succeeded', amount_paise: 2500000 });
    expect(made.metadata).toMatchObject({ assigned_from_credit: 'cred-1' });
    expect(db.rows('bank_credit_events')[0].matched_attempt_id).toBe(made.id);
  });

  it('refuses when the amounts disagree beyond a paise tag, unless staff force it', async () => {
    db.rows('bank_credit_events')[0].amount_paise = 2000000;
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r).toEqual({ ok: false, code: 'AMOUNT_MISMATCH', creditPaise: 2000000, intentPaise: 2500000 });
    expect(db.rows('payment_attempts')).toHaveLength(0);
    const forced = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF, force: true });
    expect(forced.ok).toBe(true);
    expect(db.rows('payment_attempts')[0].metadata).toMatchObject({ amount_mismatch: true });
  });

  it('refuses a credit already used and an intent that is not open', async () => {
    db.rows('bank_credit_events')[0].matched_attempt_id = 'att-9';
    expect(await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF })).toEqual({ ok: false, code: 'CREDIT_TAKEN' });
    db.rows('bank_credit_events')[0].matched_attempt_id = null;
    db.rows('payment_intents')[0].status = 'paid';
    expect(await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF })).toEqual({ ok: false, code: 'INTENT_NOT_OPEN' });
  });
});

describe('ignoreCredit', () => {
  it('needs a reason and stamps the credit', async () => {
    expect(await ignoreCredit(db.client, { creditId: 'cred-1', reason: ' ', staffId: STAFF })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    const r = await ignoreCredit(db.client, { creditId: 'cred-1', reason: 'Rent from the tenant, not a fee', staffId: STAFF });
    expect(r).toEqual({ ok: true });
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ ignored_reason: 'Rent from the tenant, not a fee' });
    expect(db.rows('bank_credit_events')[0].ignored_at).toBeTruthy();
    expect(db.rows('bank_credit_events')[0].metadata).toMatchObject({ ignored_by: STAFF });
  });

  it('will not ignore a credit that already paid for something', async () => {
    db.rows('bank_credit_events')[0].matched_attempt_id = 'att-1';
    expect(await ignoreCredit(db.client, { creditId: 'cred-1', reason: 'duplicate alert', staffId: STAFF })).toEqual({ ok: false, code: 'CREDIT_TAKEN' });
  });
});

describe('reconcileAttempt', () => {
  it('ticks a confirmed payment against the statement, on the attempt and the ledger, with an audit row', async () => {
    db.rows('payment_attempts').push(order({ state: 'succeeded', matched_credit_id: 'cred-1' }));
    db.rows('payments').push({ id: 'pay-1', attempt_id: 'att-1', reconciled_at: null });
    const r = await reconcileAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, now: NOW });
    expect(r).toEqual({ ok: true, ledgerStamped: true });
    expect(db.rows('payment_attempts')[0].statement_checked).toBe(true);
    expect(db.rows('payments')[0]).toMatchObject({ reconciled_at: NOW.toISOString(), reconciled_by: STAFF });
    expect(db.rows('payment_events')[0]).toMatchObject({ actor_type: 'staff', actor_id: STAFF, action: 'reconciled', attempt_id: 'att-1', intent_id: 'int-1' });
  });

  it('only a succeeded attempt can be ticked', async () => {
    db.rows('payment_attempts').push(order());
    expect(await reconcileAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, now: NOW })).toEqual({ ok: false, code: 'WRONG_STATE', state: 'awaiting_credit' });
  });
});

describe('disputeAttempt / resolveDispute', () => {
  beforeEach(() => {
    db.rows('payment_attempts').push(order({ state: 'succeeded', matched_credit_id: 'cred-1' }));
    db.rows('payments').push({ id: 'pay-1', attempt_id: 'att-1', reconciled_at: null, disputed_at: null });
  });

  it('a dispute needs a note, moves the attempt, marks the ledger and rings the bell', async () => {
    expect(await disputeAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, note: 'no', now: NOW })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    const r = await disputeAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, note: 'Not in the 20 Oct statement', now: NOW });
    expect(r.ok).toBe(true);
    expect(db.rows('payment_attempts')[0]).toMatchObject({ state: 'disputed', review_note: 'Not in the 20 Oct statement', review_by: STAFF });
    expect(db.rows('payments')[0].disputed_at).toBe(NOW.toISOString());
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bell.mock.calls[0][0]).toMatchObject({ metadata: expect.objectContaining({ kind: 'payment_disputed', attempt_id: 'att-1' }) });
  });

  it('keep: back to succeeded and ticked; reverse: reversed, ledger stays disputed', async () => {
    await disputeAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, note: 'Not in the 20 Oct statement', now: NOW });
    const kept = await resolveDispute(db.client, { attemptId: 'att-1', staffId: STAFF, outcome: 'keep', note: 'Found it under a different date', now: NOW });
    expect(kept.ok).toBe(true);
    expect(db.rows('payment_attempts')[0]).toMatchObject({ state: 'succeeded', statement_checked: true });
    expect(db.rows('payments')[0]).toMatchObject({ disputed_at: null, reconciled_at: NOW.toISOString(), reconciled_by: STAFF });

    await disputeAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, note: 'Still missing after the month closed', now: NOW });
    const reversed = await resolveDispute(db.client, { attemptId: 'att-1', staffId: STAFF, outcome: 'reverse', note: 'Founder confirmed, access to be removed', now: NOW });
    expect(reversed.ok).toBe(true);
    expect(db.rows('payment_attempts')[0].state).toBe('reversed');
    expect(db.rows('payments')[0].disputed_at).toBe(NOW.toISOString());
  });
});

describe('listCreditsDesk', () => {
  it('buckets credits and attempts for staff, names the student, and reports health', async () => {
    db.rows('bank_credit_events').push(
      credit({ id: 'cred-shadow', source_ref: 'sms-2', utr: '628900000002', shadow_attempt_id: 'att-s', received_at: iso(-20) }),
      credit({ id: 'cred-old', source_ref: 'sms-3', utr: '628900000003', received_at: iso(-40 * 24 * 60) }),
      credit({ id: 'cred-ignored', source_ref: 'sms-4', utr: '628900000004', ignored_at: iso(-1) }),
    );
    db.rows('payment_intents').push(intent({ id: 'int-2', purpose: 'installment', enrollment_link_id: null, user_id: 'user-1', amount_paise: 1350000, status: 'open' }));
    db.rows('payment_attempts').push(
      order({ id: 'att-s', state: 'awaiting_credit' }),
      order({ id: 'att-held', intent_id: 'int-2', state: 'awaiting_review', amount_paise: 1350012, matched_credit_id: 'cred-held', metadata: { review_reason: 'above the instant cap' } }),
      order({ id: 'att-ok', state: 'succeeded', matched_credit_id: 'cred-ok', created_at: iso(-50) }),
      order({ id: 'att-ticked', state: 'succeeded', matched_credit_id: 'cred-t', statement_checked: true }),
      order({ id: 'att-disp', state: 'disputed', created_at: iso(-80) }),
      order({ id: 'att-proof', method: 'upi_proof', state: 'awaiting_review' }),
    );
    db.rows('bank_credit_events').push(credit({ id: 'cred-held', source_ref: 'sms-5', utr: '628900000005', matched_attempt_id: 'att-held' }), credit({ id: 'cred-ok', source_ref: 'sms-6', utr: '628900000006', matched_attempt_id: 'att-ok' }));
    db.rows('payments').push({ id: 'pay-ok', attempt_id: 'att-ok', reconciled_at: null, receipt_number: 'R-1' });
    db.rows('payment_outbox').push({ id: 'o1', status: 'pending' }, { id: 'o2', status: 'dead' }, { id: 'o3', status: 'done' });

    const desk = await listCreditsDesk(db.client, { policy: { ...DEFAULT_PAYMENT_METHODS.upiAuto, enabled: true }, now: NOW });

    expect(desk.unmatched.map((c) => c.id)).toEqual(['cred-1']);
    expect(desk.shadow.map((c) => c.id)).toEqual(['cred-shadow']);
    expect(desk.shadow[0].attempt?.id).toBe('att-s');
    expect(desk.held.map((h) => h.attempt.id)).toEqual(['att-held']);
    expect(desk.held[0]).toMatchObject({ reason: 'above the instant cap', student: { name: 'Arun Kumar' }, credit: { id: 'cred-held' } });
    expect(desk.toConfirm.map((h) => h.attempt.id)).toEqual(['att-ok']);
    expect(desk.toConfirm[0]).toMatchObject({ student: { name: 'Arun Kumar R' }, payment: { id: 'pay-ok', receipt_number: 'R-1' } });
    expect(desk.disputed.map((h) => h.attempt.id)).toEqual(['att-disp']);
    expect(desk.openIntents.map((i) => i.id).sort()).toEqual(['int-1', 'int-2']);
    expect(desk.openIntents.find((i) => i.id === 'int-2')).toMatchObject({ purpose: 'installment', amountPaise: 1350000, student: { name: 'Arun Kumar' } });
    expect(desk.health).toMatchObject({ healthy: true, outbox: { pending: 1, dead: 1 }, mode: 'shadow' });
    expect(desk.health.sources[0]).toMatchObject({ source: 'sms:office-phone-1', minutesAgo: 2 });
  });
});

describe('reconcile: review fixes', () => {
  it('assignCredit claims the credit first: one another writer took between the read and the claim is refused, and the staff attempt is cancelled', async () => {
    db.rows('bank_credit_events')[0].amount_paise = 2500000;
    db.uniqueCheck = (table) => {
      if (table === 'payment_attempts') db.rows('bank_credit_events')[0].matched_attempt_id = 'att-9';
      return null;
    };
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r).toEqual({ ok: false, code: 'CREDIT_TAKEN' });
    expect(db.rows('payment_attempts').some((a) => a.state === 'succeeded')).toBe(false);
    expect(db.rows('payment_attempts')[0]?.state).toBe('cancelled');
    expect(db.rows('bank_credit_events')[0].matched_attempt_id).toBe('att-9');
  });

  it('a credit whose UTR already sits on a proof attempt under review points staff there instead of making a second attempt', async () => {
    db.rows('payment_attempts').push({ id: 'att-proof', intent_id: 'int-1', method: 'upi_proof', state: 'awaiting_review', amount_paise: 2500000, utr: '628900000001' });
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r).toEqual({ ok: false, code: 'UTR_IN_USE', attemptId: 'att-proof' });
    expect(db.rows('payment_attempts')).toHaveLength(1);
  });

  it('a staff attempt made for a tagged credit carries the paise tag, so the ledger records the fee', async () => {
    const r = await assignCredit(db.client, { creditId: 'cred-1', intentId: 'int-1', staffId: STAFF });
    expect(r.ok).toBe(true);
    expect(db.rows('payment_attempts')[0]).toMatchObject({ amount_paise: 2500037, paise_tag: 37, state: 'succeeded' });
  });

  it('rejecting a held order releases its credit back to Unmatched', async () => {
    db.rows('payment_attempts').push(order({ state: 'awaiting_review', matched_credit_id: 'cred-1' }));
    db.rows('bank_credit_events')[0].matched_attempt_id = 'att-1';
    db.rows('bank_credit_events')[0].match_kind = 'auto';
    const r = await rejectHeldAttempt(db.client, { attemptId: 'att-1', staffId: STAFF, note: 'Not our money, wrong account' });
    expect(r.ok).toBe(true);
    expect(db.rows('payment_attempts')[0].state).toBe('rejected');
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ matched_attempt_id: null, match_kind: null });
  });

  it('the desk flags an unmatched credit that looks like the second alert of a payment already matched', async () => {
    db.rows('payment_attempts').push(order({ id: 'att-ok', state: 'succeeded', matched_credit_id: 'cred-ok', amount_paise: 2500037 }));
    db.rows('bank_credit_events').push(credit({ id: 'cred-ok', source_ref: 'sms-9', utr: '628900000009', matched_attempt_id: 'att-ok', received_at: iso(-6) }));
    db.rows('bank_credit_events')[0].utr = null;
    db.rows('bank_credit_events')[0].source = 'notification';
    const desk = await listCreditsDesk(db.client, { policy: DEFAULT_PAYMENT_METHODS.upiAuto, now: NOW });
    expect(desk.unmatched[0].id).toBe('cred-1');
    expect(desk.unmatched[0].twin).toMatchObject({ creditId: 'cred-ok', attemptId: 'att-ok' });
  });
});
