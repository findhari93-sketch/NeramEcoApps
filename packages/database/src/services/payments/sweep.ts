/**
 * The sweep closes what time has closed and retries what arrived early. Runs
 * every 10 minutes from /api/cron/payments-sweep.
 *  - orders past their window expire through the state machine (a late credit can still revive them)
 *  - an open intent past its expiry with nothing live under it expires too
 *  - unmatched bank credits from the last two days are matched again (a credit
 *    can land before its order is written, or a second channel can arrive)
 *  - inbox rows whose first run died (written, never processed) are finished
 *  - a silent watcher rings the staff bell once
 * Anything waiting for staff or for the bank is left alone.
 */
import { LIVE_ATTEMPT_STATES } from '../../types/payments-v2';
import { expireAttempt } from './attempts';
import { matchCredit } from './matcher';
import { reprocessInboxRow } from './ingest';
import { notifySilence } from './health';
import { DEFAULT_PAYMENT_METHODS, type UpiAutoSettings, type PaymentWatchersSettings } from './settings';

export interface SweepResult {
  attemptsExpired: number;
  intentsExpired: number;
  creditsMatched: number;
  creditsRetried: number;
  inboxReprocessed: number;
  watchersSilent: string[];
}

export interface SweepOptions {
  policy?: UpiAutoSettings;
  /** Needed to reprocess inbox rows (sender allowlists, account tail). */
  watchers?: PaymentWatchersSettings;
  silentAfterMinutes?: number;
}

const INBOX_GRACE_MS = 2 * 60 * 1000;

const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

export async function sweepPayments(supabase: any, now: Date = new Date(), opts: SweepOptions = {}): Promise<SweepResult> {
  const nowIso = now.toISOString();
  const policy = opts.policy || DEFAULT_PAYMENT_METHODS.upiAuto;
  const result: SweepResult = { attemptsExpired: 0, intentsExpired: 0, creditsMatched: 0, creditsRetried: 0, inboxReprocessed: 0, watchersSilent: [] };

  const { data: lateAttempts, error: aErr } = await supabase
    .from('payment_attempts')
    .select('id')
    .in('state', ['created', 'awaiting_credit'])
    .lt('expires_at', nowIso)
    .limit(200);
  if (aErr) throw aErr;
  for (const row of lateAttempts || []) {
    const res = await expireAttempt(supabase, row.id);
    if (res.ok) result.attemptsExpired += 1;
  }

  const { data: lateIntents, error: iErr } = await supabase.from('payment_intents').select('id').eq('status', 'open').lt('expires_at', nowIso).limit(200);
  if (iErr) throw iErr;
  for (const intent of lateIntents || []) {
    const { data: live, error: lErr } = await supabase.from('payment_attempts').select('id').eq('intent_id', intent.id).in('state', LIVE_ATTEMPT_STATES).limit(1);
    if (lErr) throw lErr;
    if (live && live.length) continue;
    const { error: uErr } = await supabase.from('payment_intents').update({ status: 'expired', updated_at: nowIso }).eq('id', intent.id).eq('status', 'open');
    if (uErr) throw uErr;
    result.intentsExpired += 1;
  }

  // Inbox rows written but never finished (the first run died mid-way): finish them.
  if (opts.watchers) {
    const { data: stale, error: sErr } = await supabase
      .from('webhook_inbox')
      .select('*')
      .is('processed_at', null)
      .lt('received_at', new Date(now.getTime() - INBOX_GRACE_MS).toISOString())
      .limit(50);
    if (sErr) throw sErr;
    for (const row of stale || []) {
      result.inboxReprocessed += 1;
      try {
        await reprocessInboxRow(supabase, row, { watchers: opts.watchers, policy, now });
      } catch (e: any) {
        console.error('[payments-sweep] inbox reprocess failed:', row.id, e?.message);
      }
    }
  }

  // Credits nobody claimed yet, from the last two days only (bounded in the query,
  // newest first, so old leftovers can never starve new credits): try again,
  // quietly (the first arrival already rang the bell).
  const { data: credits, error: cErr } = await supabase
    .from('bank_credit_events')
    .select('*')
    .is('matched_attempt_id', null)
    .is('shadow_attempt_id', null)
    .is('ignored_at', null)
    .gte('received_at', new Date(now.getTime() - TWO_DAYS_MS).toISOString())
    .order('received_at', { ascending: false })
    .limit(200);
  if (cErr) throw cErr;
  for (const credit of credits || []) {
    result.creditsRetried += 1;
    try {
      const outcome = await matchCredit(supabase, credit, policy, now, { quietUnmatched: true });
      if (outcome.kind === 'matched' || outcome.kind === 'review' || outcome.kind === 'same_payment') result.creditsMatched += 1;
    } catch (e: any) {
      console.error('[payments-sweep] rematch failed:', credit.id, e?.message);
    }
  }

  if (opts.silentAfterMinutes) {
    result.watchersSilent = await notifySilence(supabase, { silentAfterMinutes: opts.silentAfterMinutes, now });
  }
  return result;
}
