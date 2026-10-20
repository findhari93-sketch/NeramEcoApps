// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';
import {
  createAttempt,
  transitionAttempt,
  submitProof,
  reviewAttempt,
  markCredited,
  expireAttempt,
  failAttempt,
  cancelAttempt,
} from './attempts';

/**
 * The attempt state machine. Pinned: every change goes through the
 * payments_transition RPC with the expected "from" states; the guards that
 * belong to the application (proof present, statement ticked, a reason given,
 * a UTR that can be real) are checked before the database is touched.
 */
let db: FakeDb;
const attemptRow = (over: any = {}) => ({ id: 'att-1', intent_id: 'int-1', method: 'upi_proof', state: 'created', amount_paise: 2500000, ...over });

beforeEach(() => {
  db = fakeDb({ payment_attempts: [attemptRow()] });
  db.rpcResult = (fn, args) => ({ ok: true, attempt: attemptRow({ state: args.p_to_state }), duplicate: false });
});

const lastRpc = () => db.rpcCalls[db.rpcCalls.length - 1];

describe('createAttempt', () => {
  it('inserts a created attempt with the server amount and returns the row', async () => {
    const row = await createAttempt(db.client, {
      intentId: 'int-1',
      method: 'upi_auto',
      amountPaise: 2500037,
      paiseTag: 37,
      expiresAt: '2026-10-21T10:00:00.000Z',
      idempotencyKey: 'idem-1',
      clientIpHash: 'h',
    });
    expect(row.state).toBe('created');
    expect(db.rows('payment_attempts').find((r) => r.id === row.id)).toMatchObject({
      intent_id: 'int-1',
      method: 'upi_auto',
      amount_paise: 2500037,
      paise_tag: 37,
      idempotency_key: 'idem-1',
      client_ip_hash: 'h',
    });
  });
});

describe('transitionAttempt', () => {
  it('calls the RPC with every argument and returns the new row', async () => {
    const res = await transitionAttempt(db.client, {
      attemptId: 'att-1',
      from: ['created'],
      to: 'awaiting_review',
      patch: { utr: '123456789012' },
      actor: { type: 'student', id: 'user-1' },
      action: 'submit_proof',
      jobs: [{ job: 'email_student:submitted', payload: { a: 1 } }],
      ipHash: 'iph',
    });
    expect(res.ok).toBe(true);
    expect(lastRpc().fn).toBe('payments_transition');
    expect(lastRpc().args).toEqual({
      p_attempt_id: 'att-1',
      p_from_states: ['created'],
      p_to_state: 'awaiting_review',
      p_patch: { utr: '123456789012' },
      p_actor_type: 'student',
      p_actor_id: 'user-1',
      p_action: 'submit_proof',
      p_jobs: [{ job: 'email_student:submitted', payload: { a: 1 } }],
      p_ip_hash: 'iph',
    });
  });

  it('reports a wrong state without throwing', async () => {
    db.rpcResult = () => ({ ok: false, code: 'WRONG_STATE', state: 'succeeded' });
    const res = await transitionAttempt(db.client, { attemptId: 'att-1', from: ['created'], to: 'cancelled' });
    expect(res).toEqual({ ok: false, code: 'WRONG_STATE', state: 'succeeded' });
  });

  it('throws on a database error so the caller retries', async () => {
    db.rpcResult = () => ({ __error: { message: 'connection reset' } });
    await expect(transitionAttempt(db.client, { attemptId: 'att-1', from: ['created'], to: 'cancelled' })).rejects.toThrow('connection reset');
  });
});

describe('submitProof', () => {
  const base = { attemptId: 'att-1', method: 'upi_proof' as const, paidOn: '2026-10-20', actorId: 'user-1' };

  it('needs a screenshot when the channel is upload', async () => {
    const res = await submitProof(db.client, { ...base, proofChannel: 'upload', proofObjectPath: null });
    expect(res).toEqual({ ok: false, code: 'PROOF_REQUIRED' });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('accepts "sent on WhatsApp" with no screenshot and no UTR', async () => {
    const res = await submitProof(db.client, { ...base, proofChannel: 'whatsapp' });
    expect(res.ok).toBe(true);
    const args = lastRpc().args;
    expect(args.p_from_states).toEqual(['created']);
    expect(args.p_to_state).toBe('awaiting_review');
    expect(args.p_patch).toMatchObject({ proof_channel: 'whatsapp', proof_object_path: null, utr: null, paid_on_claimed: '2026-10-20' });
    expect(args.p_actor_type).toBe('student');
    expect(args.p_jobs.map((j: any) => j.job)).toEqual(['email_student:submitted', 'alert_staff:verify']);
  });

  it('cleans a UTR and refuses one that cannot be real', async () => {
    const ok = await submitProof(db.client, { ...base, proofChannel: 'upload', proofObjectPath: 'attempts/x.jpg', utr: ' 1234 5678 9012 ' });
    expect(ok.ok).toBe(true);
    expect(lastRpc().args.p_patch.utr).toBe('123456789012');

    const bad = await submitProof(db.client, { ...base, proofChannel: 'upload', proofObjectPath: 'attempts/x.jpg', utr: '12AB' });
    expect(bad).toEqual({ ok: false, code: 'UTR_INVALID' });
  });

  it('lets a bank transfer carry a 16 character reference', async () => {
    const res = await submitProof(db.client, { ...base, method: 'bank_proof', proofChannel: 'upload', proofObjectPath: 'p', utr: 'kkbkh26291123456' });
    expect(res.ok).toBe(true);
    expect(lastRpc().args.p_patch.utr).toBe('KKBKH26291123456');
  });
});

describe('reviewAttempt', () => {
  it('will not verify until staff tick that they found it in the statement', async () => {
    const res = await reviewAttempt(db.client, { attemptId: 'att-1', decision: 'verify', staffId: 'staff-1', statementChecked: false });
    expect(res).toEqual({ ok: false, code: 'STATEMENT_REQUIRED' });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('verifies from awaiting_review to succeeded and queues fulfilment', async () => {
    const res = await reviewAttempt(db.client, { attemptId: 'att-1', decision: 'verify', staffId: 'staff-1', statementChecked: true });
    expect(res.ok).toBe(true);
    const args = lastRpc().args;
    expect(args.p_from_states).toEqual(['awaiting_review']);
    expect(args.p_to_state).toBe('succeeded');
    expect(args.p_patch).toMatchObject({ review_by: 'staff-1', review_decision: 'verify', statement_checked: true });
    expect(args.p_patch.review_at).toBeTruthy();
    expect(args.p_actor_type).toBe('staff');
    expect(args.p_jobs.map((j: any) => j.job)).toEqual(['fulfil_intent']);
  });

  it('needs a real reason to reject, then tells the student', async () => {
    const short = await reviewAttempt(db.client, { attemptId: 'att-1', decision: 'reject', staffId: 'staff-1', note: 'no' });
    expect(short).toEqual({ ok: false, code: 'REASON_REQUIRED' });

    const res = await reviewAttempt(db.client, { attemptId: 'att-1', decision: 'reject', staffId: 'staff-1', note: 'Amount not found in the statement' });
    expect(res.ok).toBe(true);
    const args = lastRpc().args;
    expect(args.p_to_state).toBe('rejected');
    expect(args.p_patch).toMatchObject({ review_decision: 'reject', review_note: 'Amount not found in the statement' });
    expect(args.p_jobs.map((j: any) => j.job)).toEqual(['email_student:rejected']);
  });
});

describe('markCredited', () => {
  it('succeeds an order from awaiting_credit, late (expired) or under review, and queues fulfilment', async () => {
    const res = await markCredited(db.client, {
      attemptId: 'att-1',
      creditId: 'cred-1',
      utr: '999999999999',
      payerVpa: 'radhika@okicici',
      actor: { type: 'observer' },
    });
    expect(res.ok).toBe(true);
    const args = lastRpc().args;
    expect(args.p_from_states).toEqual(['awaiting_credit', 'expired', 'awaiting_review']);
    expect(args.p_to_state).toBe('succeeded');
    expect(args.p_patch).toMatchObject({ matched_credit_id: 'cred-1', utr: '999999999999', payer_vpa: 'radhika@okicici' });
    expect(args.p_jobs.map((j: any) => j.job)).toEqual(['fulfil_intent']);
  });

  it('passes the duplicate flag through', async () => {
    db.rpcResult = (fn, args) => ({ ok: true, attempt: attemptRow({ state: 'succeeded' }), duplicate: true });
    const res = await markCredited(db.client, { attemptId: 'att-1', actor: { type: 'webhook' } });
    expect(res.ok && res.duplicate).toBe(true);
  });
});

describe('expire, fail, cancel', () => {
  it('expires only open orders', async () => {
    await expireAttempt(db.client, 'att-1');
    expect(lastRpc().args).toMatchObject({ p_from_states: ['created', 'awaiting_credit'], p_to_state: 'expired', p_actor_type: 'system' });
  });

  it('records why a gateway payment failed and tells the student once', async () => {
    await failAttempt(db.client, { attemptId: 'att-1', code: 'BAD_REQUEST_ERROR', reason: 'Card declined', actor: { type: 'webhook' } });
    const args = lastRpc().args;
    expect(args).toMatchObject({ p_from_states: ['created', 'awaiting_credit'], p_to_state: 'failed' });
    expect(args.p_patch).toMatchObject({ failure_code: 'BAD_REQUEST_ERROR', failure_reason: 'Card declined' });
    expect(args.p_jobs.map((j: any) => j.job)).toEqual(['email_student:failed']);
  });

  it('cancels an order the student walked away from', async () => {
    await cancelAttempt(db.client, { attemptId: 'att-1', actor: { type: 'student', id: 'user-1' } });
    expect(lastRpc().args).toMatchObject({ p_from_states: ['created', 'awaiting_credit'], p_to_state: 'cancelled', p_actor_id: 'user-1' });
  });
});

describe('reviewAttempt: an intent already paid', () => {
  it('verify on an attempt whose intent another attempt already paid returns INTENT_ALREADY_PAID and moves nothing', async () => {
    db = fakeDb({ payment_attempts: [attemptRow({ state: 'awaiting_review' })], payment_intents: [{ id: 'int-1', status: 'paid', paid_attempt_id: 'att-other' }] });
    const r = await reviewAttempt(db.client, { attemptId: 'att-1', decision: 'verify', staffId: 'staff-1', statementChecked: true });
    expect(r).toEqual({ ok: false, code: 'INTENT_ALREADY_PAID' });
    expect(db.rpcCalls).toHaveLength(0);
  });
});
