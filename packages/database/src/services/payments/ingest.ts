/**
 * Ingest: the door bank alerts come through (the office phone's SMS and
 * Google Pay notifications, the Gmail script's credit emails).
 *
 *   1. land in webhook_inbox first, unique on (provider, event_id): a repeat of
 *      a processed row is a no-op; a repeat of a row whose processing died
 *      finishes it (the retry, and the sweep's reprocess)
 *   2. refuse what did not prove itself (bad signature) or came from an unknown sender
 *   3. parse; only a credit for OUR account goes further
 *   4. one credit per payment: the same UTR from a second channel merges, and a
 *      Google Pay notification (no UTR) merges with the KVB SMS of the same
 *      amount within ten minutes, either order (two_channel)
 *   5. hand the credit to the matcher
 * The caller (the ingest route) has already authenticated the device.
 */
import type { BankCreditEventRow, WebhookInboxRow } from '../../types/payments-v2';
import { parseBankAlert, isBankSender, redactBalance, PARSER_VERSION, type AlertSource, type ParsedAlert } from '../../utils/bank-alert-parser';
import { matchCredit, type MatchOutcome } from './matcher';
import type { PaymentWatchersSettings, UpiAutoSettings } from './settings';

export interface IngestInput {
  provider: 'observer_sms' | 'observer_email';
  deviceId: string;
  /** The watcher's own id for the message (SMS id, Gmail message id). */
  eventId: string;
  source: AlertSource;
  sender: string | null;
  subject?: string | null;
  text: string;
  receivedAt: string;
  signatureOk: boolean;
  watchers: PaymentWatchersSettings;
  policy: UpiAutoSettings;
  now?: Date;
}

export interface IngestOutcome {
  inbox: 'new' | 'duplicate' | 'retry';
  parsed?: ParsedAlert;
  credit?: { id: string; merged: boolean } | null;
  match?: MatchOutcome | null;
  /** Why nothing was credited, in words. */
  skipped?: string;
}

/** Two alerts for one UPI payment arrive this close: the KVB SMS and the Google Pay notification. */
const TWIN_MS = 10 * 60 * 1000;

function emailAllowed(sender: string | null, domains: string[]): boolean {
  if (!sender) return false;
  const at = sender.lastIndexOf('@');
  if (at < 0) return false;
  const domain = sender.slice(at + 1).replace(/[>\s]/g, '').toLowerCase();
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export async function ingestAlert(supabase: any, input: IngestInput): Promise<IngestOutcome> {
  const { data: inbox, error: inErr } = await supabase
    .from('webhook_inbox')
    .insert({
      provider: input.provider,
      event_id: input.eventId,
      device_id: input.deviceId,
      signature_ok: input.signatureOk,
      headers_redacted: null,
      received_at: input.receivedAt,
      body: { source: input.source, sender: input.sender, subject: input.subject || null, text: redactBalance(input.text || '').slice(0, 4000), receivedAt: input.receivedAt },
    })
    .select('id')
    .single();
  if (inErr) {
    if (inErr.code !== '23505') throw inErr;
    // Seen before. Finished → nothing to do. Unfinished (the first run died) → finish it now.
    const { data: prior, error: pErr } = await supabase.from('webhook_inbox').select('id, processed_at').eq('provider', input.provider).eq('event_id', input.eventId).maybeSingle();
    if (pErr) throw pErr;
    if (!prior || prior.processed_at) return { inbox: 'duplicate' };
    return processInbox(supabase, prior.id, input, 'retry');
  }
  return processInbox(supabase, inbox.id, input, 'new');
}

/** The sweep's second chance for an inbox row whose first run never finished. */
export async function reprocessInboxRow(
  supabase: any,
  row: Pick<WebhookInboxRow, 'id' | 'provider' | 'event_id' | 'signature_ok'> & { device_id?: string | null; body?: any },
  ctx: { watchers: PaymentWatchersSettings; policy: UpiAutoSettings; now?: Date },
): Promise<IngestOutcome> {
  const body = row.body || {};
  const input: IngestInput = {
    provider: row.provider as IngestInput['provider'],
    deviceId: row.device_id || 'unknown',
    eventId: row.event_id,
    source: (body.source as AlertSource) || (row.provider === 'observer_email' ? 'email' : 'sms'),
    sender: body.sender ?? null,
    subject: body.subject ?? null,
    text: String(body.text || ''),
    receivedAt: body.receivedAt || new Date().toISOString(),
    signatureOk: Boolean(row.signature_ok),
    watchers: ctx.watchers,
    policy: ctx.policy,
    now: ctx.now,
  };
  return processInbox(supabase, row.id, input, 'retry');
}

async function processInbox(supabase: any, inboxId: string, input: IngestInput, inboxKind: 'new' | 'retry'): Promise<IngestOutcome> {
  const now = input.now || new Date();
  const finish = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from('webhook_inbox').update({ processed_at: now.toISOString(), ...fields }).eq('id', inboxId);
    if (error) console.error('[ingest] inbox update failed:', error.message);
  };
  const skip = async (reason: string, parsed?: ParsedAlert): Promise<IngestOutcome> => {
    await finish({ error: reason });
    return { inbox: inboxKind, parsed, credit: null, match: null, skipped: reason };
  };

  if (!input.signatureOk) return skip('bad signature');

  const senderOk = input.source === 'email' ? emailAllowed(input.sender, input.watchers.emailFromDomains) : isBankSender(input.sender, input.watchers.smsSenderKeywords);
  if (!senderOk) return skip('sender not in the allowlist');

  const parsed = parseBankAlert({ source: input.source, sender: input.sender, subject: input.subject, text: input.text, receivedAt: input.receivedAt });
  if (parsed.kind !== 'credit') return skip(`${parsed.kind}: ${parsed.reason}`, parsed);
  if (input.watchers.accountTail && parsed.accountTail && parsed.accountTail !== input.watchers.accountTail) {
    return skip(`another account (${parsed.accountTail})`, parsed);
  }

  // The same payment already here? By UTR first; then the SMS/notification twin.
  let existing: BankCreditEventRow | null = null;
  if (parsed.utr) {
    const { data, error } = await supabase.from('bank_credit_events').select('*').eq('utr', parsed.utr).maybeSingle();
    if (error) throw error;
    existing = (data as BankCreditEventRow) || null;
  }
  if (!existing && (input.source === 'sms' || input.source === 'notification')) existing = await findTwin(supabase, parsed, input);

  let credit: BankCreditEventRow | null = null;
  let merged = false;
  if (existing) {
    const sources: string[] = Array.from(new Set([...((existing.sources as string[]) || [existing.source]), input.source]));
    const patch = {
      sources,
      confidence: sources.length > 1 ? 'two_channel' : existing.confidence,
      utr: existing.utr || parsed.utr || null,
      payer_name: existing.payer_name || parsed.payerName || null,
      receiving_account: existing.receiving_account || parsed.accountTail || null,
    };
    const { error: upErr } = await supabase.from('bank_credit_events').update(patch).eq('id', existing.id);
    if (upErr) throw upErr;
    credit = { ...existing, ...patch } as BankCreditEventRow;
    merged = true;
  } else {
    const { data, error } = await supabase
      .from('bank_credit_events')
      .insert({
        source: input.source,
        source_ref: input.eventId,
        receiving_account: parsed.accountTail,
        utr: parsed.utr,
        amount_paise: parsed.amountPaise,
        payer_vpa: null,
        payer_name: parsed.payerName,
        credited_at: parsed.creditedAt,
        received_at: input.receivedAt,
        raw_redacted: parsed.rawRedacted,
        signature_ok: true,
        parser_version: PARSER_VERSION,
        sources: [input.source],
        confidence: 'single_channel',
        metadata: { channel: parsed.channel, note: parsed.note, payer_hint: parsed.payerHint, reference: parsed.reference, credited_on: parsed.creditedOn, device_id: input.deviceId },
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') return skip('duplicate credit', parsed);
      throw error;
    }
    credit = data as BankCreditEventRow;
  }

  // A merged credit that already settled an attempt needs no second match.
  if (merged && credit.matched_attempt_id) {
    await finish({ error: null });
    return { inbox: inboxKind, parsed, credit: { id: credit.id, merged }, match: { kind: 'claimed' } };
  }

  let match: MatchOutcome | null = null;
  try {
    match = await matchCredit(supabase, credit, input.policy, now);
  } catch (e: any) {
    console.error('[ingest] matcher failed:', e?.message);
    await finish({ error: `matcher: ${e?.message || 'failed'}` });
    return { inbox: inboxKind, parsed, credit: { id: credit.id, merged }, match: null, skipped: 'matcher failed; the sweep retries' };
  }
  await finish({ error: null });
  return { inbox: inboxKind, parsed, credit: { id: credit.id, merged }, match };
}

/** The other half of a UPI payment: same amount, the other channel, within ten minutes, UTRs not in conflict. */
async function findTwin(supabase: any, parsed: ParsedAlert & { kind: 'credit' }, input: IngestInput): Promise<BankCreditEventRow | null> {
  const other = input.source === 'sms' ? 'notification' : 'sms';
  const { data, error } = await supabase.from('bank_credit_events').select('*').eq('amount_paise', parsed.amountPaise).is('ignored_at', null).limit(50);
  if (error) throw error;
  const at = Date.parse(input.receivedAt);
  const twins = ((data || []) as BankCreditEventRow[]).filter((c) => {
    const sources: string[] = (c.sources as string[]) || [c.source];
    if (sources.includes(input.source) || !sources.includes(other)) return false;
    if (parsed.utr && c.utr && c.utr !== parsed.utr) return false;
    const when = Date.parse(c.received_at || c.credited_at);
    return Number.isFinite(when) && Math.abs(when - at) <= TWIN_MS;
  });
  twins.sort((a, b) => Math.abs(Date.parse(a.received_at || a.credited_at) - at) - Math.abs(Date.parse(b.received_at || b.credited_at) - at));
  return twins[0] || null;
}
