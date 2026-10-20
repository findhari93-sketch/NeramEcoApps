import { describe, it, expect } from 'vitest';
import { parseBankAlert, isBankSender, redactBalance, accountTailOf, PARSER_VERSION } from './bank-alert-parser';
import { KVB_ALERT_FIXTURES as F } from './bank-alert-fixtures';

/**
 * The bank-alert parser decides what a message IS before any money moves.
 * Pinned against real KVB shapes: UPI credits (SMS and the Google Pay
 * notification), IMPS and NEFT credits (email), cash deposits, and everything
 * that must never become a credit: debits, balance lines, OTPs, promos and
 * other banks' messages. The available balance never leaves the parser.
 */
const RECEIVED = '2026-10-16T10:36:00.000Z';
const parse = (f: { source: any; sender: string; subject?: string; text: string }) =>
  parseBankAlert({ source: f.source, sender: f.sender, subject: f.subject, text: f.text, receivedAt: RECEIVED });

describe('UPI credit SMS', () => {
  it('reads amount, payer, date, UTR and the account tail', () => {
    const r = parse(F.smsUpiCredit);
    expect(r).toMatchObject({
      kind: 'credit',
      channel: 'upi',
      amountPaise: 1500000,
      utr: '628900000001',
      payerName: 'ARUN KUMAR R',
      accountTail: '1183',
      creditedOn: '2026-10-16',
      parserVersion: PARSER_VERSION,
    });
  });

  it('keeps a long payer name whole and works for any telecom route prefix', () => {
    const r = parse(F.smsUpiCreditLongName);
    expect(r.kind === 'credit' && r.payerName).toBe('PRIYA SUDHIR KOOTHAPALEKEL');
    expect(r.kind === 'credit' && r.utr).toBe('628500000002');
  });

  it('keeps the paise tag exactly', () => {
    const r = parse(F.smsUpiCreditWithPaise);
    expect(r.kind === 'credit' && r.amountPaise).toBe(2500037);
  });

  it('uses the time the message arrived as the credit time (the SMS carries only a date)', () => {
    const r = parse(F.smsUpiCredit);
    expect(r.kind === 'credit' && r.creditedAt).toBe(RECEIVED);
  });

  it('never leaks the available balance', () => {
    const r = parse(F.smsUpiCredit);
    expect(r.rawRedacted).not.toContain('25229.82');
    expect(r.rawRedacted).toContain('628900000001');
  });
});

describe('things that are not credits', () => {
  it('a UPI debit is a debit', () => {
    expect(parse(F.smsUpiDebit).kind).toBe('debit');
  });
  it('our own NEFT outward transfer is a debit', () => {
    expect(parse(F.emailNeftOutward).kind).toBe('debit');
  });
  it('the daily balance line is a balance, and its figure is hidden', () => {
    const r = parse(F.emailBalanceAlert);
    expect(r.kind).toBe('balance');
    expect(r.rawRedacted).not.toContain('23,219.82');
  });
  it('a one-time token is an otp', () => {
    expect(parse(F.smsOtp).kind).toBe('otp');
  });
  it('marketing, recharges and other banks are other', () => {
    expect(parse(F.emailPromo).kind).toBe('other');
    expect(parse(F.smsRecharge).kind).toBe('other');
    expect(parse(F.smsOtherBank).kind).toBe('other');
    expect(parse(F.gpayNotificationRequest).kind).toBe('other');
  });
});

describe('email credits', () => {
  it('IMPS: amount, 12-digit reference, two-digit year, payer hint', () => {
    const r = parse(F.emailImpsCredit);
    expect(r).toMatchObject({ kind: 'credit', channel: 'imps', amountPaise: 3500000, utr: '624300000005', creditedOn: '2026-08-31', accountTail: '1183' });
    expect(r.kind === 'credit' && r.payerHint).toContain('6177');
    expect(r.rawRedacted).not.toContain('72,267.13');
  });

  it('NEFT inward: amount, sender name, remit note and the bank reference, through the HTML leftovers', () => {
    const r = parse(F.emailNeftInward);
    expect(r).toMatchObject({
      kind: 'credit',
      channel: 'neft',
      amountPaise: 1500000,
      utr: 'CNRBH00100000006',
      payerName: 'KARTHIK R',
      note: 'K MRUDULA FEES',
      creditedOn: '2026-07-24',
      accountTail: '1183',
    });
  });

  it('cash deposit: amount, the machine reference and the exact time in IST', () => {
    const r = parse(F.emailCashDeposit);
    expect(r).toMatchObject({ kind: 'credit', channel: 'cash', amountPaise: 4950000, utr: null, reference: 'CDM-S1ECD100008', creditedOn: '2026-07-16' });
    expect(r.kind === 'credit' && r.creditedAt).toBe('2026-07-16T11:50:45.000Z');
    expect(r.rawRedacted).not.toContain('2,27,183.13');
  });
});

describe('Google Pay notification', () => {
  it('is a UPI credit with payer and amount, and no UTR', () => {
    const r = parse(F.gpayNotification);
    expect(r).toMatchObject({ kind: 'credit', channel: 'upi', amountPaise: 1500000, utr: null, payerName: 'ARUN KUMAR R', creditedAt: RECEIVED });
  });
  it('keeps paise', () => {
    expect(parse(F.gpayNotificationWithPaise)).toMatchObject({ kind: 'credit', amountPaise: 2500037, payerName: 'RADHIKA K' });
  });
  it('only the Google Pay app counts as a notification sender; a "paid you" text from anyone else is not money', () => {
    expect(parse({ source: 'notification', sender: 'JD-KVBUPI-S', text: 'ARUN KUMAR R paid you ₹15,000' }).kind).toBe('other');
    expect(parse({ source: 'notification', sender: 'com.whatsapp', text: 'ARUN KUMAR R paid you ₹15,000' }).kind).toBe('other');
  });
});

describe('helpers', () => {
  it('recognises KVB senders on any telecom route, the mailbox, and Google Pay', () => {
    expect(isBankSender('JD-KVBUPI-S')).toBe(true);
    expect(isBankSender('VA-KVBUPI-S')).toBe(true);
    expect(isBankSender('VK-KVBANK-S')).toBe(true);
    expect(isBankSender('KVB-no.reply@kvb.bank.in')).toBe(true);
    expect(isBankSender('com.google.android.apps.nbu.paisa.user')).toBe(true);
    expect(isBankSender('JG-JioPay-S')).toBe(false);
    expect(isBankSender('BV-INDBNK-S')).toBe(false);
    expect(isBankSender('')).toBe(false);
  });

  it('matches the KVBUPI keyword under every telecom route and suffix the phone has seen', () => {
    // From the office phone's inbox (2026-10-20): the two-letter route and the -S/-T suffix vary, and some have neither.
    const seen = ['JD-KVBUPI-T', 'VK-KVBUPI-S', 'CP-KVBUPI-S', 'JX-KVBUPI-S', 'JM-KVBUPI-T', 'KVBUPI-T', 'KVBUPI-S', 'VM-KVBUPI-T', 'JM-KVBUPI-S', 'JK-KVBUPI-S', 'AD-KVBUPI-S', 'AX-KVBUPI-S', 'KVBUPI', 'JD-KVBUPI'];
    for (const id of seen) expect(isBankSender(id), id).toBe(true);
    for (const id of seen) expect(isBankSender(id, ['KVBUPI', 'KVBANK']), id).toBe(true);
    // A forwarder may send the phone's contact label instead of the raw ID.
    expect(isBankSender('Karur Vysya Bank')).toBe(true);
  });

  it('honours an explicit allowlist', () => {
    expect(isBankSender('BV-INDBNK-S', ['INDBNK'])).toBe(true);
    expect(isBankSender('JD-KVBUPI-S', ['INDBNK'])).toBe(false);
  });

  it('finds the account tail in every masking the bank uses', () => {
    expect(accountTailOf('Your a/c XXXXXXXXXXXX1183 is credited')).toBe('1183');
    expect(accountTailOf('Acct No : XXXX01183')).toBe('1183');
    expect(accountTailOf('A/c**1183 Credited')).toBe('1183');
    expect(accountTailOf('Balance in a/c ****1183 as of')).toBe('1183');
    expect(accountTailOf('from A/c No:XX01183 to')).toBe('1183');
    expect(accountTailOf('Your A/C xx7911 is classified')).toBe('7911');
    expect(accountTailOf('nothing here')).toBeNull();
  });

  it('redacts every balance phrasing', () => {
    expect(redactBalance('x. Avl Bal INR 25229.82 -KVB')).toBe('x. Avl Bal [hidden] -KVB');
    expect(redactBalance('",Avl Bal Rs.2,27,183.13 -KVB')).toBe('",Avl Bal [hidden] -KVB');
    expect(redactBalance('INR 23,219.82 is the Balance in a/c ****1183')).toBe('INR [hidden] is the Balance in a/c ****1183');
  });
});
