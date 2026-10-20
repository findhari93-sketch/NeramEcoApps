// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * Phase 0 bridge: the legacy routes (enrol complete, pay-balance, Admin verify,
 * Admin fee-claims) keep their behaviour and ALSO write intents and attempts.
 * Pinned: a submission becomes an awaiting_review attempt priced from the
 * server; a staff decision moves that attempt; and the bridge never throws
 * into the route, because the legacy path is still the source of truth.
 */
let balanceDue: any;
vi.mock('../fee-payment-claims', () => ({ loadBalanceDue: async () => balanceDue }));

import { recordLegacyProofSubmission, recordLegacyBalanceClaim, reviewLegacyLink, reviewLegacyClaim } from './bridge';

const link = (over: any = {}) => ({
  id: 'link-1',
  status: 'active',
  payment_mode: 'student_pays',
  lead_profile_id: null,
  expires_at: '2026-10-26T17:12:44.000Z',
  total_fee: 30000,
  discount_amount: 0,
  offer_full_amount: 25000,
  offer_installment_1: 16500,
  offer_installment_2: 13500,
  ...over,
});
const PROOF = 'https://x.supabase.co/storage/v1/object/sign/payment-proofs/user-1/tok/1.jpg?token=abc';

let db: FakeDb;
let errors: any[];
beforeEach(() => {
  db = fakeDb();
  db.rpcResult = (fn, args) => ({ ok: true, attempt: { id: args.p_attempt_id, state: args.p_to_state }, duplicate: false });
  balanceDue = { amount: 13500, installmentNumber: 2, installmentId: 'inst-2', dueDate: '2026-12-05', leadProfileId: 'lead-1', isStudent: true };
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => errors.push(a));
});

const lastRpc = () => db.rpcCalls[db.rpcCalls.length - 1];

describe('recordLegacyProofSubmission', () => {
  const input = { link: link(), userId: 'user-1', scheme: 'full' as const, method: 'upi_direct' as const, utr: '123456789012', paidOn: '2026-10-20', proofUrl: PROOF };

  it('creates the intent and an awaiting_review attempt priced from the link', async () => {
    const res = await recordLegacyProofSubmission(db.client, input);
    expect(res).toEqual({ intentId: expect.any(String), attemptId: expect.any(String) });
    expect(db.rows('payment_intents')[0]).toMatchObject({ enrollment_link_id: 'link-1', scheme: 'full', amount_paise: 2500000, user_id: 'user-1' });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ method: 'upi_proof', amount_paise: 2500000, metadata: { link_id: 'link-1', legacy: true } });
    const args = lastRpc().args;
    expect(args.p_to_state).toBe('awaiting_review');
    expect(args.p_actor_id).toBe('user-1');
    expect(args.p_patch).toMatchObject({ utr: '123456789012', proof_object_path: 'user-1/tok/1.jpg', proof_channel: 'upload', paid_on_claimed: '2026-10-20' });
  });

  it('maps a bank transfer to a bank_proof attempt', async () => {
    await recordLegacyProofSubmission(db.client, { ...input, scheme: 'installment', method: 'bank_transfer', utr: 'KKBKH26291123456' });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ method: 'bank_proof', amount_paise: 1650000 });
    expect(lastRpc().args.p_patch.utr).toBe('KKBKH26291123456');
  });

  it('carries the WhatsApp channel, an empty UTR and the payer name', async () => {
    const res = await recordLegacyProofSubmission(db.client, { ...input, utr: null, proofUrl: null, proofChannel: 'whatsapp', payerName: 'Appa' });
    expect(res).not.toBeNull();
    expect(lastRpc().args.p_patch).toMatchObject({ proof_channel: 'whatsapp', proof_object_path: null, utr: null, payer_name: 'Appa' });
  });

  it('never throws into the route', async () => {
    db.rpcResult = () => ({ __error: { message: 'boom' } });
    const res = await recordLegacyProofSubmission(db.client, input);
    expect(res).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('recordLegacyBalanceClaim', () => {
  it('creates the installment intent and an attempt that remembers the claim', async () => {
    const claim = { id: 'claim-1', user_id: 'user-1', method: 'upi_direct', utr: '123456789012', paid_on: '2026-10-20', proof_url: PROOF, amount: 13500 };
    const res = await recordLegacyBalanceClaim(db.client, { claim, userId: 'user-1' });
    expect(res?.attemptId).toBeTruthy();
    expect(db.rows('payment_intents')[0]).toMatchObject({ purpose: 'installment', installment_id: 'inst-2', amount_paise: 1350000 });
    expect(db.rows('payment_attempts')[0]).toMatchObject({ method: 'upi_proof', metadata: { claim_id: 'claim-1', legacy: true } });
    expect(lastRpc().args.p_to_state).toBe('awaiting_review');
  });
});

describe('reviewLegacyLink', () => {
  beforeEach(() => {
    db = fakeDb({
      payment_intents: [{ id: 'int-1', enrollment_link_id: 'link-1', status: 'open' }],
      payment_attempts: [{ id: 'att-1', intent_id: 'int-1', state: 'awaiting_review' }],
    });
    db.rpcResult = (fn, args) => ({ ok: true, attempt: { id: args.p_attempt_id, state: args.p_to_state }, duplicate: false });
  });

  it('verifies the waiting attempt with the statement tick on the staff member\'s behalf', async () => {
    const ok = await reviewLegacyLink(db.client, { linkId: 'link-1', decision: 'verify', staffId: 'staff-1' });
    expect(ok).toBe(true);
    const args = lastRpc().args;
    expect(args.p_attempt_id).toBe('att-1');
    expect(args.p_to_state).toBe('succeeded');
    expect(args.p_patch).toMatchObject({ review_by: 'staff-1', statement_checked: true });
  });

  it('rejects with the staff reason', async () => {
    const ok = await reviewLegacyLink(db.client, { linkId: 'link-1', decision: 'reject', staffId: 'staff-1', reason: 'Not in the statement' });
    expect(ok).toBe(true);
    expect(lastRpc().args).toMatchObject({ p_to_state: 'rejected' });
    expect(lastRpc().args.p_patch.review_note).toBe('Not in the statement');
  });

  it('does nothing when there is no waiting attempt (a link made before the bridge)', async () => {
    db.rows('payment_attempts')[0].state = 'succeeded';
    const ok = await reviewLegacyLink(db.client, { linkId: 'link-1', decision: 'verify', staffId: 'staff-1' });
    expect(ok).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('reviewLegacyClaim', () => {
  it('also finds a backfilled attempt that only carries legacy_ref', async () => {
    db = fakeDb({ payment_attempts: [{ id: 'att-8', intent_id: 'int-8', state: 'awaiting_review', legacy_ref: 'claim:claim-8', metadata: {} }] });
    db.rpcResult = (fn, args) => ({ ok: true, attempt: { id: args.p_attempt_id, state: args.p_to_state }, duplicate: false });
    const ok = await reviewLegacyClaim(db.client, { claimId: 'claim-8', decision: 'reject', staffId: 'staff-1', reason: 'Not in the statement' });
    expect(ok).toBe(true);
    expect(lastRpc().args.p_attempt_id).toBe('att-8');
  });

  it('finds the attempt by the claim it remembers', async () => {
    db = fakeDb({ payment_attempts: [{ id: 'att-7', intent_id: 'int-7', state: 'awaiting_review', metadata: { claim_id: 'claim-7', legacy: true } }] });
    db.rpcResult = (fn, args) => ({ ok: true, attempt: { id: args.p_attempt_id, state: args.p_to_state }, duplicate: false });
    const ok = await reviewLegacyClaim(db.client, { claimId: 'claim-7', decision: 'verify', staffId: 'staff-1' });
    expect(ok).toBe(true);
    expect(lastRpc().args.p_attempt_id).toBe('att-7');
    expect(lastRpc().args.p_to_state).toBe('succeeded');
  });
});
