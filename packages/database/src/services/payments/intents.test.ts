// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * Intents are what is owed. Pinned: the amount always comes from the link's
 * offer snapshot (or the fee plan's next due), never from the caller; one open
 * intent per link; a plan can change until a payment attempt is live.
 */
let balanceDue: any;
vi.mock('../fee-payment-claims', () => ({
  loadBalanceDue: async () => balanceDue,
}));

import { getOrCreateEnrolmentIntent, getOrCreateInstallmentIntent } from './intents';

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

let db: FakeDb;
beforeEach(() => {
  db = fakeDb();
  balanceDue = { amount: 13500, installmentNumber: 2, installmentId: 'inst-2', dueDate: '2026-12-05', leadProfileId: 'lead-1', isStudent: true };
});

describe('getOrCreateEnrolmentIntent', () => {
  it('creates an open intent priced from the link offer, not the caller', async () => {
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link(), scheme: 'full', userId: 'user-1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.amountPaise).toBe(2500000);
    expect(db.rows('payment_intents')[0]).toMatchObject({
      purpose: 'enrolment',
      enrollment_link_id: 'link-1',
      user_id: 'user-1',
      scheme: 'full',
      amount_paise: 2500000,
      status: 'open',
      expires_at: '2026-10-26T17:12:44.000Z',
    });
  });

  it('prices two installments at the first installment', async () => {
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link(), scheme: 'installment', userId: 'user-1' });
    expect(res.ok && res.amountPaise).toBe(1650000);
  });

  it('refuses a plan the link does not offer', async () => {
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link({ offer_installment_1: null, offer_installment_2: null }), scheme: 'installment', userId: 'user-1' });
    expect(res).toEqual({ ok: false, code: 'PLAN_NOT_OFFERED' });
    expect(db.rows('payment_intents')).toHaveLength(0);
  });

  it('refuses a link that is not active', async () => {
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link({ status: 'used' }), scheme: 'full', userId: 'user-1' });
    expect(res).toEqual({ ok: false, code: 'LINK_NOT_ACTIVE' });
  });

  it('returns the existing open intent for the same plan', async () => {
    db = fakeDb({ payment_intents: [{ id: 'int-1', enrollment_link_id: 'link-1', status: 'open', scheme: 'full', amount_paise: 2500000, user_id: 'user-1' }] });
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link(), scheme: 'full', userId: 'user-1' });
    expect(res.ok && res.intent.id).toBe('int-1');
    expect(db.rows('payment_intents')).toHaveLength(1);
  });

  it('switches the plan on an open intent while nothing is being paid', async () => {
    db = fakeDb({ payment_intents: [{ id: 'int-1', enrollment_link_id: 'link-1', status: 'open', scheme: 'full', amount_paise: 2500000, user_id: 'user-1' }] });
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link(), scheme: 'installment', userId: 'user-1' });
    expect(res.ok && res.amountPaise).toBe(1650000);
    expect(db.rows('payment_intents')[0]).toMatchObject({ id: 'int-1', scheme: 'installment', amount_paise: 1650000 });
  });

  it('locks the plan once an attempt is waiting for money or review', async () => {
    db = fakeDb({
      payment_intents: [{ id: 'int-1', enrollment_link_id: 'link-1', status: 'open', scheme: 'full', amount_paise: 2500000, user_id: 'user-1' }],
      payment_attempts: [{ id: 'att-1', intent_id: 'int-1', state: 'awaiting_credit' }],
    });
    const res = await getOrCreateEnrolmentIntent(db.client, { link: link(), scheme: 'installment', userId: 'user-1' });
    expect(res).toEqual({ ok: false, code: 'SCHEME_LOCKED' });
    expect(db.rows('payment_intents')[0].scheme).toBe('full');
  });
});

describe('getOrCreateInstallmentIntent', () => {
  it('creates an intent for the fee plan next due', async () => {
    const res = await getOrCreateInstallmentIntent(db.client, { userId: 'user-1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.amountPaise).toBe(1350000);
    expect(db.rows('payment_intents')[0]).toMatchObject({
      purpose: 'installment',
      installment_id: 'inst-2',
      user_id: 'user-1',
      lead_profile_id: 'lead-1',
      scheme: 'installment',
      amount_paise: 1350000,
      status: 'open',
      metadata: { installment_number: 2, due_date: '2026-12-05' },
    });
  });

  it('says so when nothing is due', async () => {
    balanceDue = { amount: null, isStudent: true };
    const res = await getOrCreateInstallmentIntent(db.client, { userId: 'user-1' });
    expect(res).toEqual({ ok: false, code: 'NOTHING_DUE' });
  });

  it('reuses the open intent for that installment and refreshes the amount', async () => {
    db = fakeDb({ payment_intents: [{ id: 'int-9', purpose: 'installment', installment_id: 'inst-2', status: 'open', amount_paise: 1400000, user_id: 'user-1' }] });
    const res = await getOrCreateInstallmentIntent(db.client, { userId: 'user-1' });
    expect(res.ok && res.intent.id).toBe('int-9');
    expect(db.rows('payment_intents')[0].amount_paise).toBe(1350000);
    expect(db.rows('payment_intents')).toHaveLength(1);
  });
});
