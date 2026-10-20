/**
 * Instant UPI orders. The student pays the base amount plus a 1..99 paise tag
 * that no other open order on that amount shares, so the bank alert alone
 * identifies the order. The partial unique index on (amount_paise) for open
 * upi_auto attempts is the allocator: an insert that loses the race retries
 * with another tag. A tag any order on that amount used in the last 24 hours
 * (cancelled, expired or paid) rests, so a student who paid and then tapped
 * "another way" cannot hand their money to the next student with that tag.
 * One open order per intent: a second tab supersedes the first.
 */
const TAG_REST_MS = 24 * 60 * 60 * 1000;
import type { PaymentAttemptRow, PaymentIntentRow } from '../../types/payments-v2';
import { buildUpiUri } from '../../utils/student-pay';
import { fromPaise } from '../../utils/paise';
import { cancelAttempt } from './attempts';

export function pickPaiseTag(taken: Set<number>, random: () => number = Math.random): number | null {
  const free: number[] = [];
  for (let t = 1; t <= 99; t++) if (!taken.has(t)) free.push(t);
  if (!free.length) return null;
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}

export interface CreateOrderInput {
  intent: PaymentIntentRow;
  payee: { upiId: string; payeeName: string };
  orderMinutes: number;
  paymentNote: string;
  now?: Date;
  clientIpHash?: string | null;
  clientUa?: string | null;
}

export type CreateOrderResult =
  | { ok: true; attempt: PaymentAttemptRow; upiUri: string; reused: boolean }
  | { ok: false; code: 'INTENT_NOT_OPEN' | 'TAGS_EXHAUSTED' };

const upiFor = (attempt: PaymentAttemptRow, input: CreateOrderInput) =>
  buildUpiUri({ vpa: input.payee.upiId, payeeName: input.payee.payeeName, amount: fromPaise(Number(attempt.amount_paise)), note: input.paymentNote });

export async function createInstantUpiOrder(supabase: any, input: CreateOrderInput): Promise<CreateOrderResult> {
  const { intent } = input;
  if (intent.status !== 'open') return { ok: false, code: 'INTENT_NOT_OPEN' };
  const now = input.now || new Date();

  // An order already waiting for this intent is reused, so a refresh does not burn tags.
  const { data: mine, error: mineErr } = await supabase
    .from('payment_attempts')
    .select('*')
    .eq('intent_id', intent.id)
    .eq('method', 'upi_auto')
    .eq('state', 'awaiting_credit')
    .limit(5);
  if (mineErr) throw mineErr;
  const reusable = (mine || []).find((a: any) => new Date(a.expires_at).getTime() > now.getTime() + 60 * 1000);
  if (reusable) return { ok: true, attempt: reusable, upiUri: upiFor(reusable, input), reused: true };

  const base = Number(intent.amount_paise);
  const expiresAt = new Date(now.getTime() + input.orderMinutes * 60 * 1000).toISOString();

  for (let i = 0; i < 10; i++) {
    const { data: used, error: usedErr } = await supabase
      .from('payment_attempts')
      .select('amount_paise, state, created_at')
      .eq('method', 'upi_auto')
      .gte('amount_paise', base + 1)
      .lte('amount_paise', base + 99);
    if (usedErr) throw usedErr;
    const taken = new Set<number>(
      (used || [])
        .filter((r: any) => r.state === 'awaiting_credit' || !r.created_at || now.getTime() - new Date(r.created_at).getTime() <= TAG_REST_MS)
        .map((r: any) => Number(r.amount_paise) - base)
        .filter((t: number) => t >= 1 && t <= 99),
    );
    const tag = pickPaiseTag(taken);
    if (tag === null) return { ok: false, code: 'TAGS_EXHAUSTED' };

    const { data, error } = await supabase
      .from('payment_attempts')
      .insert({
        intent_id: intent.id,
        method: 'upi_auto',
        state: 'awaiting_credit',
        amount_paise: base + tag,
        paise_tag: tag,
        provider: 'bank_alert',
        expires_at: expiresAt,
        client_ip_hash: input.clientIpHash || null,
        client_ua: input.clientUa ? String(input.clientUa).slice(0, 300) : null,
        metadata: { payment_note: input.paymentNote },
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        if (String(error.message || '').includes('one_open_order_per_intent')) {
          // Another tab of this student won the race: supersede its order and try again.
          const { data: others } = await supabase.from('payment_attempts').select('id').eq('intent_id', intent.id).eq('method', 'upi_auto').eq('state', 'awaiting_credit');
          for (const o of others || []) await cancelAttempt(supabase, { attemptId: o.id, actor: { type: 'student', id: intent.user_id || null } }).catch(() => undefined);
        }
        continue; // another order took that tag a moment ago
      }
      throw error;
    }
    await supabase.from('payment_events').insert({
      actor_type: 'student',
      actor_id: intent.user_id || null,
      action: 'order_created',
      intent_id: intent.id,
      attempt_id: data.id,
      after: { amount_paise: data.amount_paise, paise_tag: tag, expires_at: expiresAt },
    });
    return { ok: true, attempt: data, upiUri: upiFor(data, input), reused: false };
  }
  return { ok: false, code: 'TAGS_EXHAUSTED' };
}

/** What the paying page polls: the state, the amount it must see in its UPI app, the deadline, and whether it is done. */
export function attemptStatusView(attempt: PaymentAttemptRow, intent: PaymentIntentRow, link?: { status?: string | null } | null) {
  const enrolled = link?.status === 'used' || (intent.status === 'paid' && intent.purpose === 'installment');
  return {
    state: attempt.state,
    amountPaise: Number(attempt.amount_paise),
    paiseTag: attempt.paise_tag ?? null,
    expiresAt: attempt.expires_at,
    intentStatus: intent.status,
    enrolled,
  };
}
