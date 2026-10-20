// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * Ingest is the door bank alerts come through. Pinned: every call lands in the
 * inbox first and a repeat is a no-op; only credits become credit events; the
 * same UTR from SMS and email is ONE credit with two channels; the account tail
 * and the sender allowlist are enforced; a credit is handed to the matcher.
 */
const bell = vi.fn(async () => undefined);
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));

import { ingestAlert } from './ingest';
import { DEFAULT_PAYMENT_METHODS } from './settings';
import { KVB_ALERT_FIXTURES as F } from '../../utils/bank-alert-fixtures';

const NOW = new Date('2026-10-16T10:36:00.000Z');
const watchers = { smsSenderKeywords: ['KVB'], emailFromDomains: ['kvb.bank.in'], deviceIds: ['office-phone', 'gmail'], accountTail: '1183' };
const policy = { ...DEFAULT_PAYMENT_METHODS.upiAuto, enabled: true, shadowMode: false };

const smsInput = (over: any = {}) => ({
  provider: 'observer_sms' as const,
  deviceId: 'office-phone',
  eventId: 'sms-1',
  source: 'sms' as const,
  sender: F.smsUpiCredit.sender,
  text: F.smsUpiCredit.text,
  receivedAt: NOW.toISOString(),
  signatureOk: true,
  watchers,
  policy,
  now: NOW,
  ...over,
});

let db: FakeDb;
beforeEach(() => {
  db = fakeDb({ webhook_inbox: [], bank_credit_events: [], payment_attempts: [], payment_intents: [], payment_outbox: [] });
  db.uniqueCheck = (table, row, rows) => {
    if (table === 'webhook_inbox' && rows.some((r) => r.provider === row.provider && r.event_id === row.event_id)) return { code: '23505', message: 'dup inbox' };
    if (table === 'bank_credit_events' && rows.some((r) => r.source === row.source && r.source_ref === row.source_ref)) return { code: '23505', message: 'dup ref' };
    if (table === 'bank_credit_events' && row.utr && rows.some((r) => r.utr === row.utr)) return { code: '23505', message: 'dup utr' };
    return null;
  };
  bell.mockClear();
});

describe('ingestAlert', () => {
  it('records the call in the inbox, parses a UPI credit and stores it with the redacted text', async () => {
    const r = await ingestAlert(db.client, smsInput());
    expect(r.inbox).toBe('new');
    expect(r.credit?.merged).toBe(false);
    const inbox = db.rows('webhook_inbox')[0];
    expect(inbox).toMatchObject({ provider: 'observer_sms', event_id: 'sms-1', device_id: 'office-phone', signature_ok: true });
    expect(inbox.processed_at).toBeTruthy();
    const c = db.rows('bank_credit_events')[0];
    expect(c).toMatchObject({ source: 'sms', source_ref: 'sms-1', utr: '628900000001', amount_paise: 1500000, payer_name: 'ARUN KUMAR R', confidence: 'single_channel', sources: ['sms'] });
    expect(c.raw_redacted).not.toContain('25229.82');
    expect(r.match).toMatchObject({ kind: 'unmatched' });
  });

  it('a repeated event id is a no-op', async () => {
    await ingestAlert(db.client, smsInput());
    const r = await ingestAlert(db.client, smsInput());
    expect(r.inbox).toBe('duplicate');
    expect(db.rows('bank_credit_events')).toHaveLength(1);
  });

  it('the same UTR from the email channel merges into the SMS credit as two channels', async () => {
    await ingestAlert(db.client, smsInput());
    const r = await ingestAlert(db.client, smsInput({
      provider: 'observer_email',
      deviceId: 'gmail',
      eventId: 'mail-9',
      source: 'email',
      sender: 'KVB-no.reply@kvb.bank.in',
      subject: 'IMPS Alert from KVB',
      text: 'Your a/c no. XXXXXXXXXXXX1183 is credited by INR 15,000.00 on 16-10-26 by a/c linked to mobile xxxxxx6177 (IMPS Ref no. 628900000001). Avl Bal INR 40,229.82 -KVB',
    }));
    expect(r.credit?.merged).toBe(true);
    expect(db.rows('bank_credit_events')).toHaveLength(1);
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ confidence: 'two_channel', sources: ['sms', 'email'] });
  });

  it('a balance line, a debit and an OTP never become credits, but stay on record', async () => {
    for (const [i, f] of [F.emailBalanceAlert, F.smsUpiDebit, F.smsOtp].entries()) {
      const r = await ingestAlert(db.client, smsInput({ eventId: `x-${i}`, provider: f.source === 'email' ? 'observer_email' : 'observer_sms', source: f.source, sender: f.sender, subject: (f as any).subject, text: f.text }));
      expect(r.credit ?? null).toBeNull();
      expect(r.skipped).toBeTruthy();
    }
    expect(db.rows('bank_credit_events')).toHaveLength(0);
    expect(db.rows('webhook_inbox')).toHaveLength(3);
    expect(db.rows('webhook_inbox').every((r) => r.processed_at)).toBe(true);
  });

  it('another account, or a sender outside the allowlist, is kept in the inbox but never credited', async () => {
    const other = await ingestAlert(db.client, smsInput({ eventId: 'o-1', sender: F.smsOtherBank.sender, text: F.smsOtherBank.text }));
    expect(other.credit ?? null).toBeNull();
    const tail = await ingestAlert(db.client, smsInput({ eventId: 'o-2', text: F.smsUpiCredit.text.replace('XXXXXXXXXXXX1183', 'XXXXXXXXXXXX7911') }));
    expect(tail.credit ?? null).toBeNull();
    expect(tail.skipped).toMatch(/account/i);
    expect(db.rows('bank_credit_events')).toHaveLength(0);
  });

  it('hands a credit to the matcher and confirms an open order with that exact amount', async () => {
    db.rows('payment_attempts').push({ id: 'att-1', intent_id: 'int-1', method: 'upi_auto', state: 'awaiting_credit', amount_paise: 2500037, paise_tag: 37, created_at: new Date(NOW.getTime() - 5 * 60000).toISOString(), expires_at: new Date(NOW.getTime() + 25 * 60000).toISOString() });
    db.rows('payment_intents').push({ id: 'int-1', purpose: 'enrolment', enrollment_link_id: 'link-1', user_id: 'user-1', status: 'open', amount_paise: 2500000 });
    db.rpcResult = (fn, args) => {
      const row = db.rows('payment_attempts').find((r) => r.id === args.p_attempt_id)!;
      row.state = args.p_to_state;
      return { ok: true, attempt: row, duplicate: false };
    };
    const r = await ingestAlert(db.client, smsInput({ eventId: 'sms-2', text: F.smsUpiCreditWithPaise.text }));
    expect(r.match).toEqual({ kind: 'matched', attemptId: 'att-1' });
    expect(db.rows('payment_attempts')[0].state).toBe('succeeded');
  });

  it('a bad signature is kept in the inbox, marked, and never parsed into money', async () => {
    const r = await ingestAlert(db.client, smsInput({ signatureOk: false }));
    expect(r.skipped).toMatch(/signature/i);
    expect(db.rows('webhook_inbox')[0].signature_ok).toBe(false);
    expect(db.rows('bank_credit_events')).toHaveLength(0);
  });
});

describe('ingestAlert: review fixes', () => {
  const gpay = (over: any = {}) => smsInput({ eventId: 'gpay-1', source: 'notification', sender: F.gpayNotification.sender, text: F.gpayNotification.text, ...over });
  const later = new Date(NOW.getTime() + 60_000).toISOString();

  it('the Google Pay notification merges onto the KVB SMS of the same payment: one credit, two_channel', async () => {
    await ingestAlert(db.client, smsInput());
    const r = await ingestAlert(db.client, gpay({ receivedAt: later, now: new Date(later) }));
    expect(r.credit?.merged).toBe(true);
    expect(db.rows('bank_credit_events')).toHaveLength(1);
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ utr: '628900000001', confidence: 'two_channel', sources: ['sms', 'notification'] });
  });

  it('the notification first, then the SMS: the SMS adopts the twin and brings the UTR', async () => {
    await ingestAlert(db.client, gpay());
    const r = await ingestAlert(db.client, smsInput({ receivedAt: later, now: new Date(later) }));
    expect(r.credit?.merged).toBe(true);
    expect(db.rows('bank_credit_events')).toHaveLength(1);
    expect(db.rows('bank_credit_events')[0]).toMatchObject({ utr: '628900000001', confidence: 'two_channel' });
    expect([...db.rows('bank_credit_events')[0].sources].sort()).toEqual(['notification', 'sms']);
  });

  it('a same-amount notification an hour apart is a different payment', async () => {
    await ingestAlert(db.client, smsInput());
    const hour = new Date(NOW.getTime() + 3600_000).toISOString();
    await ingestAlert(db.client, gpay({ receivedAt: hour, now: new Date(hour) }));
    expect(db.rows('bank_credit_events')).toHaveLength(2);
  });

  it('an inbox row whose processing died is finished on the retry, not dropped as a duplicate', async () => {
    const prev = db.uniqueCheck!;
    let boom = true;
    db.uniqueCheck = (table, row, rows) => (table === 'bank_credit_events' && boom ? { code: '57014', message: 'statement timeout' } : prev(table, row, rows));
    await expect(ingestAlert(db.client, smsInput())).rejects.toBeTruthy();
    boom = false;
    const r = await ingestAlert(db.client, smsInput());
    expect(r.inbox).toBe('retry');
    expect(r.credit).toBeTruthy();
    expect(db.rows('bank_credit_events')).toHaveLength(1);
    expect(db.rows('webhook_inbox')).toHaveLength(1);
    expect(db.rows('webhook_inbox')[0].processed_at).toBeTruthy();
  });
});
