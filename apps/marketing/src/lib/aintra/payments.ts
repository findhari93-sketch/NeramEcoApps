/**
 * "What do I owe, and where do I pay?", for Aintra (2026-10-20).
 *
 * Aintra never takes a payment in the chat. It reads what the signed-in
 * student owes from the same places the payment pages do and hands them the
 * exact page for it: /pay-balance for the next instalment, /pay?app= for an
 * approved application's fee (Razorpay), /enroll?token= for an enrolment link
 * our team sent. Those pages own the amount, the checkout and the proof.
 *
 * An enrolment link's token is a secret. It goes only to the visitor's own
 * card (through /api/aintra/pay-options), never into the chat text, the log or
 * the model's context.
 */
import { createAdminClient, formatDueDate } from '@neram/database';
import { loadBalanceDue } from '@neram/database/fee-payment-claims';

export interface PaymentOptions {
  /** The next instalment or balance on an enrolled student's fee plan. */
  balance: { amount: number; installmentNumber: number | null; dueDate: string | null; balance: number | null } | null;
  /** A payment they sent that our team has not verified yet. */
  pendingClaim: { amount: number; submittedAt: string | null } | null;
  /** An approved application whose fee can be paid at /pay?app=. */
  approvedApplication: { number: string; fee: number | null } | null;
  /** A pay-yourself enrolment link our team sent them. */
  enrolmentLink: { token: string; amount: number | null; expiresAt: string | null } | null;
}

export const NO_PAYMENT_OPTIONS: PaymentOptions = { balance: null, pendingClaim: null, approvedApplication: null, enrolmentLink: null };

export async function loadPaymentOptions(userId: string, now = new Date()): Promise<PaymentOptions> {
  const supabase = createAdminClient() as any;
  const [due, claims, apps, links] = await Promise.all([
    loadBalanceDue(supabase, userId).catch(() => null),
    supabase
      .from('fee_payment_claims')
      .select('amount, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('lead_profiles')
      .select('application_number, status, final_fee')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('direct_enrollment_links')
      .select('token, status, expires_at, final_fee, offer_full_amount')
      .eq('user_id', userId)
      .eq('payment_mode', 'student_pays')
      .eq('status', 'active')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const claim = claims?.data?.[0];
  const app = apps?.data?.[0];
  const link = links?.data?.[0];
  return {
    balance: due?.amount ? { amount: due.amount, installmentNumber: due.installmentNumber, dueDate: due.dueDate, balance: due.balance } : null,
    pendingClaim: claim ? { amount: Number(claim.amount) || 0, submittedAt: claim.created_at ?? null } : null,
    approvedApplication: app?.application_number ? { number: app.application_number, fee: app.final_fee != null ? Number(app.final_fee) : null } : null,
    enrolmentLink: link?.token
      ? { token: link.token, amount: Number(link.offer_full_amount ?? link.final_fee) || null, expiresAt: link.expires_at ?? null }
      : null,
  };
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export interface PaymentAction {
  id: 'balance' | 'application' | 'link';
  /** "Pay ₹12,500 (instalment 2, due 5 Nov 2026)". */
  label: string;
  /** Where the button goes. Holds the link token only when `withSecrets` was set. */
  href: string | null;
}

/** The buttons for the card, most urgent first. The enrolment link's href only with `withSecrets`. */
export function paymentActions(o: PaymentOptions, withSecrets = false): PaymentAction[] {
  const actions: PaymentAction[] = [];
  if (o.enrolmentLink) {
    actions.push({
      id: 'link',
      label: `Finish your enrolment${o.enrolmentLink.amount ? ` and pay ${rupees(o.enrolmentLink.amount)}` : ''}`,
      href: withSecrets ? `/enroll?token=${encodeURIComponent(o.enrolmentLink.token)}` : null,
    });
  }
  if (o.approvedApplication) {
    actions.push({
      id: 'application',
      label: `Pay the course fee${o.approvedApplication.fee ? ` (${rupees(o.approvedApplication.fee)})` : ''}`,
      href: `/pay?app=${encodeURIComponent(o.approvedApplication.number)}`,
    });
  }
  if (o.balance && !o.pendingClaim) {
    const parts = [o.balance.installmentNumber ? `instalment ${o.balance.installmentNumber}` : null, o.balance.dueDate ? `due ${formatDueDate(o.balance.dueDate)}` : null].filter(Boolean);
    actions.push({ id: 'balance', label: `Pay ${rupees(o.balance.amount)}${parts.length ? ` (${parts.join(', ')})` : ''}`, href: '/pay-balance' });
  }
  return actions;
}

/** What Aintra is told: amounts and next steps in words, no link token. */
export function describePaymentOptions(o: PaymentOptions): Record<string, unknown> {
  const actions = paymentActions(o);
  return {
    owes_now: actions.length ? actions.map((a) => a.label) : 'nothing right now',
    ...(o.pendingClaim
      ? { waiting_for_our_team: `${rupees(o.pendingClaim.amount)} they sent is waiting for our team to verify; nothing more to do until then` }
      : {}),
    ...(o.balance?.balance ? { balance_after_this: rupees(o.balance.balance) } : {}),
    how_they_pay: actions.length
      ? 'Each button on the card opens the page that takes the payment (UPI, bank transfer or card). Nothing is paid in the chat.'
      : 'Nothing to pay. If they expected to, offer a callback.',
  };
}
