/**
 * Bank-alert parser: decides what a message IS before any money moves.
 *
 * Sources (Phase 2 watchers):
 *  - sms:          the office phone forwards KVB SMS (sender like JD-KVBUPI-S).
 *                  UPI credits arrive here with the 12-digit UTR.
 *  - notification: the same phone forwards Google Pay's "X paid you ₹Y"
 *                  (amount + payer, no UTR). Corroborates the SMS.
 *  - email:        the Gmail script forwards KVB-no.reply@kvb.bank.in.
 *                  NEFT inward, IMPS and cash deposits come here; UPI never does.
 *
 * Everything that is not a credit (debits, the daily balance line, OTPs,
 * promos, other banks) is classified so it can never become money. The
 * available balance is redacted before anything is stored. Pure, no I/O.
 * Shapes are pinned by bank-alert-fixtures.ts (real KVB wording).
 */
import { toPaise } from './paise';

export const PARSER_VERSION = 'kvb-2026-10-20';

export type AlertSource = 'sms' | 'email' | 'notification';
export type CreditChannel = 'upi' | 'imps' | 'neft' | 'cash';

export interface AlertInput {
  source: AlertSource;
  sender?: string | null;
  subject?: string | null;
  text: string;
  /** ISO time the watcher received it; the credit time when the alert carries only a date. */
  receivedAt?: string | null;
}

export interface ParsedCredit {
  kind: 'credit';
  channel: CreditChannel;
  amountPaise: number;
  /** 12 digits for UPI/IMPS, the bank reference for NEFT, null for cash. */
  utr: string | null;
  /** The bank's own reference when it is not a UTR (NEFT ref, CDM id). */
  reference: string | null;
  payerName: string | null;
  /** "a/c linked to mobile xxxxxx6177": what the bank said about the payer when no name came. */
  payerHint: string | null;
  /** The remitter's note (NEFT "Remit Info"). */
  note: string | null;
  accountTail: string | null;
  creditedOn: string | null;
  creditedAt: string;
  rawRedacted: string;
  parserVersion: string;
}

export interface ParsedNonCredit {
  kind: 'debit' | 'balance' | 'otp' | 'other';
  reason: string;
  accountTail: string | null;
  rawRedacted: string;
  parserVersion: string;
}

export type ParsedAlert = ParsedCredit | ParsedNonCredit;

const GPAY_PACKAGE = 'com.google.android.apps.nbu.paisa.user';

/**
 * KVB on any telecom route and suffix (JD-KVBUPI-S, VM-KVBUPI-T, KVBUPI, VK-KVBANK-S),
 * the phone's contact label for it, the KVB mailbox, or the Google Pay app.
 * Matching is by keyword because the two-letter route prefix changes by circle.
 */
export function isBankSender(sender: string | null | undefined, allow: string[] = ['KVB', 'KARUR VYSYA']): boolean {
  if (!sender) return false;
  const s = sender.trim();
  if (!s) return false;
  if (s === GPAY_PACKAGE) return true;
  const upper = s.toUpperCase();
  return allow.some((token) => new RegExp(`(^|[^A-Z])${token.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(upper));
}

/** The last four digits of the account in any masking the bank uses (XXXX01183, **1183, ****1183, xx7911). */
export function accountTailOf(text: string): string | null {
  const m = /(?:X{2,}|\*{2,})0?(\d{4})\b/i.exec(text);
  return m ? m[1] : null;
}

/** Hide the available balance wherever the bank writes it. */
export function redactBalance(text: string): string {
  return text
    .replace(/(Avl\s*Bal(?:ance)?\.?\s*)(?:INR|Rs\.?)?\s*[\d,]+(?:\.\d{1,2})?/gi, '$1[hidden]')
    .replace(/(INR|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?(\s+is the Balance)/i, '$1 [hidden]$2');
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "16-Oct-2026", "06-OCT-26", "31-08-26", "24-07-2026" → calendar parts. */
function parseBankDate(raw: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : MONTHS[m[2].toLowerCase()];
  if (month === undefined || month < 0 || month > 11) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (d < 1 || d > 31) return null;
  return { y, m: month, d };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (p: { y: number; m: number; d: number }) => `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
/** A bank timestamp is IST; store UTC. */
const istToIso = (p: { y: number; m: number; d: number }, hh: number, mm: number, ss: number) =>
  new Date(Date.UTC(p.y, p.m, p.d, hh, mm, ss) - 5.5 * 3600 * 1000).toISOString();

const clean = (s: string) => s.replace(/&n\s*bsp;|&nbsp;/gi, ' ').replace(/\r/g, '');
const field = (text: string, label: string) => {
  const m = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i').exec(text);
  return m ? m[1].trim() : null;
};

export function parseBankAlert(input: AlertInput): ParsedAlert {
  const text = clean(input.text || '');
  const rawRedacted = redactBalance(text).slice(0, 2000);
  const accountTail = accountTailOf(text);
  const base = { accountTail, rawRedacted, parserVersion: PARSER_VERSION };
  const receivedAt = input.receivedAt || new Date().toISOString();
  const other = (reason: string): ParsedNonCredit => ({ kind: 'other', reason, ...base });

  if (!isBankSender(input.sender)) return other('sender is not the bank or Google Pay');

  // Google Pay notification: payer and amount, no UTR. Only the Google Pay app
  // itself may say "paid you"; the same words from any other app are not money.
  if (input.sender === GPAY_PACKAGE) {
    const m = /^(.+?)\s+paid you\s*₹\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text.trim());
    if (!m) return other('notification is not a payment received');
    return credit({ channel: 'upi', amountPaise: toPaise(m[2]), utr: null, reference: null, payerName: m[1].trim(), payerHint: null, note: null, creditedOn: null, creditedAt: receivedAt }, base);
  }
  if (input.source === 'notification') return other('notification from an app that is not Google Pay');

  if (/tokencode|\bOTP\b|one[- ]time password/i.test(text)) return { kind: 'otp', reason: 'one-time code', ...base };
  if (/is the Balance in a\/c/i.test(text)) return { kind: 'balance', reason: 'daily balance line', ...base };
  if (/is debited|debited by|Your NEFT Transfer of INR|has been debited/i.test(text)) return { kind: 'debit', reason: 'money going out', ...base };

  // UPI credit SMS: "... is credited Rs. 15000.00 from NAME on 16-Oct-2026.info :UPI/P2A/628967815958. Avl Bal ..."
  {
    const m = /is credited\s+Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\.?\s*info\s*:\s*UPI\/P2[AM]\/(\d{12})/i.exec(text);
    if (m) {
      const p = parseBankDate(m[3]);
      return credit({ channel: 'upi', amountPaise: toPaise(m[1]), utr: m[4], reference: null, payerName: m[2].trim(), payerHint: null, note: null, creditedOn: p ? dateKey(p) : null, creditedAt: receivedAt }, base);
    }
  }

  // IMPS credit email: "... is credited by INR 35,000.00 on 31-08-26 by a/c linked to mobile xxxxxx6177 (IMPS Ref no. 624312784861)."
  {
    const m = /is credited by\s+INR\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{1,2}-\d{1,2}-\d{2,4})\s*(.*?)\(?\s*IMPS Ref\.?\s*no\.?\s*:?\s*(\d{12})/i.exec(text);
    if (m) {
      const p = parseBankDate(m[2]);
      const hint = m[3].replace(/^by\s+/i, '').trim() || null;
      return credit({ channel: 'imps', amountPaise: toPaise(m[1]), utr: m[4], reference: null, payerName: null, payerHint: hint, note: null, creditedOn: p ? dateKey(p) : null, creditedAt: receivedAt }, base);
    }
  }

  // NEFT inward email: labelled fields.
  if (/RECEIVED AN NEFT INWARD/i.test(text)) {
    const amt = field(text, 'Amt');
    const ref = field(text, 'Ref No');
    const p = parseBankDate(field(text, 'Date'));
    const refClean = ref ? ref.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
    const amountPaise = toPaise(amt);
    if (amountPaise > 0) {
      return credit(
        { channel: 'neft', amountPaise, utr: refClean, reference: refClean, payerName: field(text, 'Sender Name'), payerHint: null, note: field(text, 'Remit Info'), creditedOn: p ? dateKey(p) : null, creditedAt: receivedAt },
        base,
      );
    }
  }

  // Cash deposit: 'A/c**1183 Credited Rs.49,500.00 on 16-JUL-2026 17:20:45"CASH DEPOSIT AT CDM-S1ECD129801",Avl Bal ...'
  {
    const m = /Credited\s+Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\s*"?([^",]*?CASH DEPOSIT[^",]*)"?/i.exec(text);
    if (m) {
      const p = parseBankDate(m[2]);
      const cdm = /CDM-[A-Z0-9]+/i.exec(m[6]);
      const creditedAt = p && m[3] ? istToIso(p, Number(m[3]), Number(m[4]), Number(m[5])) : receivedAt;
      return credit({ channel: 'cash', amountPaise: toPaise(m[1]), utr: null, reference: cdm ? cdm[0].toUpperCase() : null, payerName: null, payerHint: m[6].trim(), note: null, creditedOn: p ? dateKey(p) : null, creditedAt }, base);
    }
  }

  return other(/credited/i.test(text) ? 'a credit in a shape the parser does not know' : 'not a transaction alert');
}

function credit(c: Omit<ParsedCredit, 'kind' | 'accountTail' | 'rawRedacted' | 'parserVersion'>, base: { accountTail: string | null; rawRedacted: string; parserVersion: string }): ParsedAlert {
  if (!(c.amountPaise > 0)) return { kind: 'other', reason: 'credit without a readable amount', ...base };
  return { kind: 'credit', ...c, ...base };
}
