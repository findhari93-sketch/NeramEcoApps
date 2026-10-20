// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';
import { createInstantUpiOrder, pickPaiseTag, attemptStatusView } from './orders';

/**
 * An Instant UPI order asks for the base amount plus a 1..99 paise tag that no
 * other open order shares, so the bank alert alone identifies it. Pinned: tags
 * never collide, an open order is reused, 99 open orders on one amount hide the
 * method, and the amount always comes from the intent.
 */
const NOW = new Date('2026-10-21T04:00:00.000Z');
const payee = { upiId: 'neramclassroom-1@okicici', payeeName: 'Manoharan Trust' };
const intent = (over: any = {}) => ({ id: 'int-1', purpose: 'enrolment', enrollment_link_id: 'link-1', user_id: 'user-1', scheme: 'full', amount_paise: 2500000, status: 'open', ...over });
const openOrder = (tag: number, over: any = {}) => ({ id: `att-${tag}`, intent_id: 'int-other', method: 'upi_auto', state: 'awaiting_credit', amount_paise: 2500000 + tag, paise_tag: tag, expires_at: '2099-01-01T00:00:00.000Z', ...over });

let db: FakeDb;
beforeEach(() => {
  db = fakeDb({ payment_attempts: [], payment_events: [] });
  // The partial unique index: one open upi_auto order per exact amount.
  db.uniqueCheck = (table, row, rows) =>
    table === 'payment_attempts' && row.method === 'upi_auto' && row.state === 'awaiting_credit' && rows.some((r) => r.method === 'upi_auto' && r.state === 'awaiting_credit' && r.amount_paise === row.amount_paise)
      ? { code: '23505', message: 'duplicate key' }
      : null;
});

describe('pickPaiseTag', () => {
  it('picks from 1..99 and never a taken tag', () => {
    const taken = new Set(Array.from({ length: 98 }, (_, i) => i + 1));
    expect(pickPaiseTag(taken, () => 0.5)).toBe(99);
    expect(pickPaiseTag(new Set(Array.from({ length: 99 }, (_, i) => i + 1)))).toBeNull();
    const t = pickPaiseTag(new Set(), () => 0);
    expect(t).toBeGreaterThanOrEqual(1);
    expect(t).toBeLessThanOrEqual(99);
  });
});

describe('createInstantUpiOrder', () => {
  it('creates an awaiting_credit order with a tagged amount, a 30 minute window and a UPI link for it', async () => {
    const r = await createInstantUpiOrder(db.client, { intent: intent() as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'NRM ABC123' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reused).toBe(false);
    expect(r.attempt.state).toBe('awaiting_credit');
    expect(r.attempt.method).toBe('upi_auto');
    expect(r.attempt.paise_tag).toBeGreaterThanOrEqual(1);
    expect(r.attempt.amount_paise).toBe(2500000 + r.attempt.paise_tag);
    expect(r.attempt.expires_at).toBe('2026-10-21T04:30:00.000Z');
    expect(r.upiUri).toContain(`am=${(r.attempt.amount_paise / 100).toFixed(2)}`);
    expect(r.upiUri).toContain('pa=neramclassroom-1@okicici');
    expect(db.rows('payment_events').some((e) => e.action === 'order_created' && e.attempt_id === r.attempt.id)).toBe(true);
  });

  it('reuses an open order for the same intent instead of making a second tag', async () => {
    db.rows('payment_attempts').push(openOrder(37, { intent_id: 'int-1' }));
    const r = await createInstantUpiOrder(db.client, { intent: intent() as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'NRM ABC123' });
    expect(r.ok && r.reused).toBe(true);
    expect(r.ok && r.attempt.paise_tag).toBe(37);
    expect(db.rows('payment_attempts')).toHaveLength(1);
  });

  it('never hands out a tag another open order on the same amount already holds', async () => {
    for (let t = 1; t <= 98; t++) db.rows('payment_attempts').push(openOrder(t));
    const r = await createInstantUpiOrder(db.client, { intent: intent() as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'x' });
    expect(r.ok && r.attempt.paise_tag).toBe(99);
  });

  it('retries when the unique index beats it to a tag, and gives up cleanly when every tag is taken', async () => {
    for (let t = 1; t <= 99; t++) db.rows('payment_attempts').push(openOrder(t));
    const r = await createInstantUpiOrder(db.client, { intent: intent() as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'x' });
    expect(r).toEqual({ ok: false, code: 'TAGS_EXHAUSTED' });
  });

  it('refuses an intent that is not open', async () => {
    const r = await createInstantUpiOrder(db.client, { intent: intent({ status: 'paid' }) as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'x' });
    expect(r).toEqual({ ok: false, code: 'INTENT_NOT_OPEN' });
  });
});

describe('attemptStatusView', () => {
  it('tells the page the state, the amount, the deadline and whether the student is now enrolled', () => {
    const view = attemptStatusView(openOrder(37) as any, intent({ status: 'paid' }) as any, { status: 'used' });
    expect(view).toMatchObject({ state: 'awaiting_credit', amountPaise: 2500037, expiresAt: '2099-01-01T00:00:00.000Z', intentStatus: 'paid', enrolled: true });
    expect(attemptStatusView(openOrder(37) as any, intent() as any, { status: 'active' }).enrolled).toBe(false);
  });
});

describe('createInstantUpiOrder: review fixes', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
  const create = () => createInstantUpiOrder(db.client, { intent: intent() as any, payee, orderMinutes: 30, now: NOW, paymentNote: 'NRM ABC123' });

  it('skips a tag that a cancelled or expired order on the same amount used in the last 24 hours', async () => {
    for (let t = 1; t <= 99; t++) if (t !== 50 && t !== 51) db.rows('payment_attempts').push(openOrder(t));
    db.rows('payment_attempts').push(openOrder(50, { id: 'att-cancelled', state: 'cancelled', created_at: minutesAgo(10) }));
    const r = await create();
    expect(r.ok && r.attempt.paise_tag).toBe(51);
  });

  it('frees that tag again after a day', async () => {
    for (let t = 1; t <= 99; t++) if (t !== 50) db.rows('payment_attempts').push(openOrder(t));
    db.rows('payment_attempts').push(openOrder(50, { id: 'att-old', state: 'cancelled', created_at: minutesAgo(30 * 60) }));
    const r = await create();
    expect(r.ok && r.attempt.paise_tag).toBe(50);
  });

  it('a second tab racing the first supersedes the order it lost to: one open order per intent', async () => {
    const prev = db.uniqueCheck!;
    db.uniqueCheck = (table, row, rows) => {
      if (table === 'payment_attempts' && row.method === 'upi_auto' && row.state === 'awaiting_credit' && rows.some((r) => r.intent_id === row.intent_id && r.method === 'upi_auto' && r.state === 'awaiting_credit')) {
        return { code: '23505', message: 'duplicate key value violates unique constraint "payment_attempts_one_open_order_per_intent"' };
      }
      return prev(table, row, rows);
    };
    db.rpcResult = (fn, args) => {
      const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id);
      if (row) row.state = args.p_to_state;
      return { ok: true, attempt: row, duplicate: false };
    };
    // The other tab's order exists but has under a minute left, so this tab does not reuse it.
    db.rows('payment_attempts').push(openOrder(7, { id: 'att-other-tab', intent_id: 'int-1', expires_at: new Date(NOW.getTime() + 30_000).toISOString() }));
    const r = await create();
    expect(r.ok).toBe(true);
    expect(db.rows('payment_attempts').find((a) => a.id === 'att-other-tab')?.state).toBe('cancelled');
    expect(db.rows('payment_attempts').filter((a) => a.intent_id === 'int-1' && a.state === 'awaiting_credit')).toHaveLength(1);
  });
});
