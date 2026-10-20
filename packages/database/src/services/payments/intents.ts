/**
 * Intents: what a person owes for one purpose. The amount is always the
 * server's (the link's offer snapshot, or the fee plan's next due); callers
 * pass ids and a plan choice, never rupees. One open intent per link and per
 * installment; the plan can change until a payment attempt is live.
 */
import type { PaymentIntentRow, PaymentScheme } from '../../types/payments-v2';
import { LIVE_ATTEMPT_STATES } from '../../types/payments-v2';
import { offerFromLink, amountDueToday } from '../../utils/student-pay';
import { toPaise } from '../../utils/paise';
import { loadBalanceDue, type BalanceDue } from '../fee-payment-claims';

export type EnrolmentIntentResult =
  | { ok: true; intent: PaymentIntentRow; amountPaise: number }
  | { ok: false; code: 'LINK_NOT_ACTIVE' | 'PLAN_NOT_OFFERED' | 'SCHEME_LOCKED' };

async function hasLiveAttempt(supabase: any, intentId: string): Promise<boolean> {
  const { data, error } = await supabase.from('payment_attempts').select('id').eq('intent_id', intentId).in('state', LIVE_ATTEMPT_STATES).limit(1);
  if (error) throw error;
  return Boolean(data && data.length);
}

async function openIntentForLink(supabase: any, linkId: string): Promise<PaymentIntentRow | null> {
  const { data, error } = await supabase.from('payment_intents').select('*').eq('enrollment_link_id', linkId).eq('status', 'open').maybeSingle();
  if (error) throw error;
  return data;
}

/** The open intent for a student-pays link and the plan they chose, priced from the link. */
export async function getOrCreateEnrolmentIntent(
  supabase: any,
  input: { link: any; scheme: PaymentScheme; userId: string | null },
): Promise<EnrolmentIntentResult> {
  const { link, scheme } = input;
  if (link.status !== 'active') return { ok: false, code: 'LINK_NOT_ACTIVE' };
  const amount = amountDueToday(offerFromLink(link), scheme);
  if (amount === null) return { ok: false, code: 'PLAN_NOT_OFFERED' };
  const amountPaise = toPaise(amount);
  if (!amountPaise) return { ok: false, code: 'PLAN_NOT_OFFERED' };

  const existing = await openIntentForLink(supabase, link.id);
  if (existing) {
    const samePlan = existing.scheme === scheme && Number(existing.amount_paise) === amountPaise;
    if (samePlan && (existing.user_id || !input.userId)) return { ok: true, intent: existing, amountPaise };
    if (!samePlan && (await hasLiveAttempt(supabase, existing.id))) return { ok: false, code: 'SCHEME_LOCKED' };
    const { data, error } = await supabase
      .from('payment_intents')
      .update({ scheme, amount_paise: amountPaise, user_id: input.userId || existing.user_id || null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('status', 'open')
      .select('*')
      .single();
    if (error) throw error;
    return { ok: true, intent: data, amountPaise };
  }

  const { data, error } = await supabase
    .from('payment_intents')
    .insert({
      purpose: 'enrolment',
      enrollment_link_id: link.id,
      lead_profile_id: link.lead_profile_id || null,
      user_id: input.userId || null,
      scheme,
      amount_paise: amountPaise,
      status: 'open',
      expires_at: link.expires_at || null,
    })
    .select('*')
    .single();
  if (error) {
    // Two tabs raced: the unique index kept one; use it.
    if (error.code === '23505') {
      const raced = await openIntentForLink(supabase, link.id);
      if (raced) return getOrCreateEnrolmentIntent(supabase, input);
    }
    throw error;
  }
  return { ok: true, intent: data, amountPaise };
}

export type InstallmentIntentResult =
  | { ok: true; intent: PaymentIntentRow; amountPaise: number; due: BalanceDue }
  | { ok: false; code: 'NOTHING_DUE' };

/** The open intent for the signed-in student's next due installment (or plain balance). */
export async function getOrCreateInstallmentIntent(supabase: any, input: { userId: string }): Promise<InstallmentIntentResult> {
  const due = await loadBalanceDue(supabase, input.userId);
  if (!due.isStudent || due.amount === null) return { ok: false, code: 'NOTHING_DUE' };
  const amountPaise = toPaise(due.amount);
  if (!amountPaise) return { ok: false, code: 'NOTHING_DUE' };

  let query = supabase.from('payment_intents').select('*').eq('status', 'open').eq('purpose', 'installment');
  query = due.installmentId ? query.eq('installment_id', due.installmentId) : query.eq('user_id', input.userId).is('installment_id', null);
  const { data: existing, error } = await query.maybeSingle();
  if (error) throw error;

  const metadata = { installment_number: due.installmentNumber, due_date: due.dueDate };
  if (existing) {
    if (Number(existing.amount_paise) === amountPaise) return { ok: true, intent: existing, amountPaise, due };
    if (await hasLiveAttempt(supabase, existing.id)) return { ok: true, intent: existing, amountPaise: Number(existing.amount_paise), due };
    const { data, error: updErr } = await supabase
      .from('payment_intents')
      .update({ amount_paise: amountPaise, metadata, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('status', 'open')
      .select('*')
      .single();
    if (updErr) throw updErr;
    return { ok: true, intent: data, amountPaise, due };
  }

  const { data, error: insErr } = await supabase
    .from('payment_intents')
    .insert({
      purpose: 'installment',
      installment_id: due.installmentId,
      lead_profile_id: due.leadProfileId,
      user_id: input.userId,
      scheme: 'installment',
      amount_paise: amountPaise,
      status: 'open',
      metadata,
    })
    .select('*')
    .single();
  if (insErr) {
    if (insErr.code === '23505') return getOrCreateInstallmentIntent(supabase, input);
    throw insErr;
  }
  return { ok: true, intent: data, amountPaise, due };
}

export async function getIntentById(supabase: any, intentId: string): Promise<PaymentIntentRow | null> {
  const { data, error } = await supabase.from('payment_intents').select('*').eq('id', intentId).maybeSingle();
  if (error) throw error;
  return data;
}
