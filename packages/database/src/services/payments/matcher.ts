/**
 * The matcher: a bank credit becomes money on exactly one Instant UPI order,
 * or a question for staff. Never a guess.
 *
 *   candidates = upi_auto orders with the EXACT paise amount, credited inside
 *                [order created - 2 min, order expiry + 24 h]
 *   exactly one live (awaiting_credit / expired) candidate, intent open:
 *     claim the credit (whoever links it first wins; the loser leaves it alone)
 *     policy allows (on, not shadow, under the cap, two channels above the line,
 *       no cancelled order for the same amount in the window) → succeeded
 *     otherwise → awaiting_review with the credit attached, staff confirm
 *   the intent is already paid:
 *     by a proof attempt for the same money (same UTR, or same fee with no UTR)
 *       → the credit is linked to THAT attempt, the order is cancelled, no duplicate
 *     by anything else → duplicate flag, never a second enrolment
 *   the intent expired or was cancelled → unmatched, staff extend and assign
 *   zero or several live candidates → unmatched, staff bell
 */
import type { BankCreditEventRow, PaymentAttemptRow, PaymentIntentRow } from '../../types/payments-v2';
import { createAdminNotification } from '../../queries/notifications';
import { formatPaise } from '../../utils/paise';
import { markCredited, holdForReview, cancelAttempt } from './attempts';
import { enqueueOutbox } from './outbox';
import type { UpiAutoSettings } from './settings';

export type MatchOutcome =
  | { kind: 'matched'; attemptId: string }
  | { kind: 'review'; attemptId: string; reason: string }
  | { kind: 'duplicate'; attemptId: string }
  | { kind: 'same_payment'; attemptId: string }
  | { kind: 'claimed' }
  | { kind: 'unmatched'; candidates: number };

const BEFORE_MS = 2 * 60 * 1000;
const AFTER_MS = 24 * 60 * 60 * 1000;
const CREDITS_URL = '/collections?tab=credits';
const LIVE = ['awaiting_credit', 'expired'];
const DEAD = ['cancelled', 'failed'];

async function bell(supabase: any, title: string, message: string, metadata: Record<string, unknown>) {
  await createAdminNotification({ event_type: 'payment_to_verify', title, message, metadata: { ...metadata, url: CREDITS_URL } } as any, supabase).catch((e: any) =>
    console.error('[matcher] bell failed:', e?.message),
  );
}

export interface MatchOptions {
  /** Sweeps retry old credits every few minutes: do not ring the unmatched bell again. */
  quietUnmatched?: boolean;
}

/** Link the credit to this attempt, unless another writer already linked it. */
export async function claimCredit(supabase: any, creditId: string, attemptId: string, kind: 'auto' | 'staff', assignedBy?: string | null): Promise<boolean> {
  const { data, error } = await supabase
    .from('bank_credit_events')
    .update({ matched_attempt_id: attemptId, match_kind: kind, ...(assignedBy ? { assigned_by: assignedBy } : {}) })
    .eq('id', creditId)
    .is('matched_attempt_id', null)
    .is('ignored_at', null)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/** Undo a claim that did not lead to a transition. */
export async function releaseCredit(supabase: any, creditId: string, attemptId: string): Promise<void> {
  const { error } = await supabase.from('bank_credit_events').update({ matched_attempt_id: null, match_kind: null, assigned_by: null }).eq('id', creditId).eq('matched_attempt_id', attemptId);
  if (error) throw error;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** The money a proof attempt claims is the same money as this credit. */
function sameMoney(paying: PaymentAttemptRow, credit: BankCreditEventRow, order: PaymentAttemptRow): boolean {
  if (paying.method === 'upi_auto' || paying.method === 'razorpay') return false;
  if (paying.utr && credit.utr) return paying.utr === credit.utr;
  if (paying.utr || credit.utr) return paying.utr ? false : Number(paying.amount_paise) === Number(credit.amount_paise) - Number(order.paise_tag || 0);
  return Number(paying.amount_paise) === Number(credit.amount_paise) - Number(order.paise_tag || 0);
}

export async function matchCredit(supabase: any, credit: BankCreditEventRow, policy: UpiAutoSettings, now: Date = new Date(), opts: MatchOptions = {}): Promise<MatchOutcome> {
  const amount = Number(credit.amount_paise);
  const { data: rows, error } = await supabase
    .from('payment_attempts')
    .select('*')
    .eq('method', 'upi_auto')
    .eq('amount_paise', amount)
    .in('state', [...LIVE, ...DEAD]);
  if (error) throw error;
  const creditedAt = ms(credit.credited_at);
  const inWindow: PaymentAttemptRow[] = (rows || []).filter((a: PaymentAttemptRow) => {
    const created = ms(a.created_at);
    const expires = ms(a.expires_at);
    return creditedAt >= created - BEFORE_MS && creditedAt <= expires + AFTER_MS;
  });
  const live = inWindow.filter((a) => LIVE.includes(a.state));
  const dead = inWindow.filter((a) => DEAD.includes(a.state));

  if (live.length !== 1) {
    if (!opts.quietUnmatched) {
      const who = `${formatPaise(amount)}${credit.payer_name ? ` from ${credit.payer_name}` : ''}${credit.utr ? `, UTR ${credit.utr}` : ''}`;
      const message = live.length
        ? `${live.length} open orders ask for exactly ${formatPaise(amount)}; match it by hand.`
        : dead.length
          ? `${who} arrived after the only order for that amount was cancelled. If the student paid anyway, assign it to them from Bank credits.`
          : `${who} arrived with no matching order. Assign it to a student or mark it as not a fee.`;
      await bell(supabase, `Unmatched bank credit: ${formatPaise(amount)}`, message, { kind: 'unmatched_credit', credit_id: credit.id, candidates: live.length });
    }
    return { kind: 'unmatched', candidates: live.length };
  }

  const attempt = live[0];
  const { data: intent, error: iErr } = await supabase.from('payment_intents').select('*').eq('id', attempt.intent_id).maybeSingle();
  if (iErr) throw iErr;
  const intentRow = intent as PaymentIntentRow | null;

  if (!intentRow || intentRow.status !== 'open') {
    if (intentRow?.status === 'paid') {
      // The same payment may already be on the books through a screenshot the staff verified.
      let paying: PaymentAttemptRow | null = null;
      if (intentRow.paid_attempt_id) {
        const { data: p, error: pErr } = await supabase.from('payment_attempts').select('*').eq('id', intentRow.paid_attempt_id).maybeSingle();
        if (pErr) throw pErr;
        paying = (p as PaymentAttemptRow) || null;
      }
      if (paying && paying.id !== attempt.id && sameMoney(paying, credit, attempt)) {
        const claimed = await claimCredit(supabase, credit.id, paying.id, 'auto');
        if (!claimed) return { kind: 'claimed' };
        await cancelAttempt(supabase, { attemptId: attempt.id, actor: { type: 'system' } }).catch(() => undefined);
        return { kind: 'same_payment', attemptId: paying.id };
      }
      await enqueueOutbox(supabase, { aggregateId: attempt.id, job: 'flag_duplicate', payload: { intent_id: attempt.intent_id, credit_id: credit.id } });
      await supabase
        .from('bank_credit_events')
        .update({ metadata: { ...((credit as any).metadata || {}), duplicate_of_attempt: attempt.id } })
        .eq('id', credit.id);
      return { kind: 'duplicate', attemptId: attempt.id };
    }
    if (!opts.quietUnmatched) {
      await bell(
        supabase,
        `Paid after the link closed: ${formatPaise(amount)}`,
        `Order ${String(attempt.id).slice(0, 8)} belongs to a payment request that closed (${intentRow?.status || 'gone'}). Extend the student's link, then assign this credit from Bank credits.`,
        { kind: 'unmatched_credit', credit_id: credit.id, candidates: 1 },
      );
    }
    return { kind: 'unmatched', candidates: 1 };
  }

  // Claim first: the credit can settle one attempt only.
  const claimed = await claimCredit(supabase, credit.id, attempt.id, 'auto');
  if (!claimed) return { kind: 'claimed' };

  const reason = !policy.enabled
    ? 'Instant UPI switched off'
    : policy.shadowMode
      ? 'shadow mode'
      : amount > policy.instantCapPaise
        ? 'above the instant cap'
        : amount > policy.twoChannelAbovePaise && credit.confidence !== 'two_channel'
          ? 'only one channel above the two-channel line'
          : dead.length
            ? 'another order for this exact amount was cancelled inside the window'
            : null;

  if (reason) {
    const held = await holdForReview(supabase, { attemptId: attempt.id, creditId: credit.id, reason, actor: { type: 'observer' } });
    if (!held.ok) {
      await releaseCredit(supabase, credit.id, attempt.id);
      await bell(supabase, `Credit needs a look: ${formatPaise(amount)}`, `The matching order changed state (${held.code}). Check it by hand.`, { kind: 'unmatched_credit', credit_id: credit.id });
      return { kind: 'unmatched', candidates: 1 };
    }
    if (policy.shadowMode) {
      const { error: shErr } = await supabase.from('bank_credit_events').update({ shadow_attempt_id: attempt.id }).eq('id', credit.id);
      if (shErr) throw shErr;
      await bell(
        supabase,
        `Shadow: would have auto-confirmed ${formatPaise(amount)}`,
        `Instant UPI is in shadow mode. This credit matched order ${String(attempt.id).slice(0, 8)} exactly and is held for you; confirm it from Bank credits.`,
        { kind: 'shadow_match', credit_id: credit.id, attempt_id: attempt.id },
      );
    }
    return { kind: 'review', attemptId: attempt.id, reason };
  }

  const done = await markCredited(supabase, {
    attemptId: attempt.id,
    creditId: credit.id,
    utr: credit.utr,
    payerVpa: credit.payer_vpa,
    payerName: credit.payer_name,
    actor: { type: 'observer' },
    action: 'credit_matched',
  });
  if (!done.ok) {
    await releaseCredit(supabase, credit.id, attempt.id);
    await bell(supabase, `Credit needs a look: ${formatPaise(amount)}`, `The matching order changed state (${done.code}). Check it by hand.`, { kind: 'unmatched_credit', credit_id: credit.id });
    return { kind: 'unmatched', candidates: 1 };
  }
  return { kind: 'matched', attemptId: attempt.id };
}
