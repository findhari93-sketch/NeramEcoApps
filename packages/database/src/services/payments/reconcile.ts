/**
 * The Bank credits desk: what staff do with what the bank said.
 *  - assign an unmatched credit to a student's open intent (the live order if
 *    there is one, else a staff attempt), through the same claim, transition
 *    and fulfilment path as an automatic match
 *  - ignore a credit that is not a fee
 *  - tick an auto-confirmed payment against the statement, or dispute it, and
 *    resolve a dispute either way; reject a held order and free its credit
 *  - list the buckets the desk shows, with the student named, plus watcher
 *    and outbox health
 * Every move is a staff-attributed transition or an audit row; nothing here
 * writes money without one, and a credit is claimed before anything moves.
 */
import type { BankCreditEventRow, PaymentAttemptRow, PaymentIntentRow } from '../../types/payments-v2';
import { createAdminNotification } from '../../queries/notifications';
import { formatPaise } from '../../utils/paise';
import { createAttempt, transitionAttempt, cancelAttempt, reviewAttempt, type TransitionResult } from './attempts';
import { claimCredit, releaseCredit } from './matcher';
import { watcherHealth, type WatcherHealth } from './health';
import type { UpiAutoSettings } from './settings';

const CREDITS_URL = '/collections?tab=credits';
const DAY_MS = 86_400_000;
/** Methods the system confirms on its own; these are what the daily tick is for. */
const AUTO_METHODS = ['upi_auto', 'razorpay'];
/** Two alerts this close for the same amount are usually one payment. */
const TWIN_MS = 15 * 60 * 1000;

export interface StudentRef {
  name: string | null;
  phone: string | null;
  userId: string | null;
  linkId: string | null;
}

async function loadRow<T>(supabase: any, table: string, id: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as T) || null;
}

async function audit(supabase: any, row: { actorId: string; action: string; attemptId: string; intentId: string | null; after?: Record<string, unknown> }) {
  const { error } = await supabase.from('payment_events').insert({
    actor_type: 'staff',
    actor_id: row.actorId,
    action: row.action,
    attempt_id: row.attemptId,
    intent_id: row.intentId,
    after: row.after || null,
  });
  if (error) throw error;
}

async function bell(supabase: any, title: string, message: string, metadata: Record<string, unknown>) {
  await createAdminNotification({ event_type: 'payment_to_verify', title, message, metadata: { ...metadata, url: CREDITS_URL } } as any, supabase).catch((e: any) =>
    console.error('[reconcile] bell failed:', e?.message),
  );
}

// ── assign / ignore ──────────────────────────────────────────────────────────

export type AssignResult =
  | { ok: true; attemptId: string }
  | { ok: false; code: 'CREDIT_NOT_FOUND' | 'CREDIT_TAKEN' | 'INTENT_NOT_FOUND' | 'INTENT_NOT_OPEN' | 'WRONG_STATE'; state?: string }
  | { ok: false; code: 'AMOUNT_MISMATCH'; creditPaise: number; intentPaise: number }
  | { ok: false; code: 'UTR_IN_USE'; attemptId: string };

/**
 * A credit nobody claimed becomes this intent's payment. The amount must be the
 * intent's (plus at most a paise tag) unless staff force it, which is recorded.
 * The credit is claimed before the attempt moves, so two writers cannot both win.
 */
export async function assignCredit(supabase: any, input: { creditId: string; intentId: string; staffId: string; force?: boolean }): Promise<AssignResult> {
  const credit = await loadRow<BankCreditEventRow & { metadata?: Record<string, unknown> }>(supabase, 'bank_credit_events', input.creditId);
  if (!credit) return { ok: false, code: 'CREDIT_NOT_FOUND' };
  if (credit.matched_attempt_id || credit.ignored_at) return { ok: false, code: 'CREDIT_TAKEN' };
  const intent = await loadRow<PaymentIntentRow>(supabase, 'payment_intents', input.intentId);
  if (!intent) return { ok: false, code: 'INTENT_NOT_FOUND' };
  if (intent.status !== 'open') return { ok: false, code: 'INTENT_NOT_OPEN' };

  const creditPaise = Number(credit.amount_paise);
  const intentPaise = Number(intent.amount_paise);
  const diff = creditPaise - intentPaise;
  const mismatch = diff < 0 || diff > 99;
  if (mismatch && !input.force) return { ok: false, code: 'AMOUNT_MISMATCH', creditPaise, intentPaise };

  // The same UTR already on a screenshot under review: verify that one instead.
  if (credit.utr) {
    const { data: holders, error: hErr } = await supabase.from('payment_attempts').select('id, state').eq('utr', credit.utr).in('state', ['awaiting_review', 'succeeded', 'disputed']).limit(1);
    if (hErr) throw hErr;
    if (holders && holders.length) return { ok: false, code: 'UTR_IN_USE', attemptId: holders[0].id };
  }

  // The live order on this intent if the student started one; else a staff attempt.
  const { data: live, error } = await supabase.from('payment_attempts').select('*').eq('intent_id', input.intentId).eq('method', 'upi_auto').in('state', ['awaiting_credit', 'expired']);
  if (error) throw error;
  const orders: PaymentAttemptRow[] = live || [];
  let attempt = orders.find((a) => Number(a.amount_paise) === creditPaise) || orders[0] || null;
  const marks = { assigned_from_credit: input.creditId, ...(mismatch ? { amount_mismatch: true, intent_paise: intentPaise } : {}) };
  let made = false;
  if (!attempt) {
    attempt = await createAttempt(supabase, {
      intentId: input.intentId,
      method: 'upi_auto',
      amountPaise: creditPaise,
      paiseTag: diff >= 1 && diff <= 99 ? diff : null,
      metadata: marks,
    });
    made = true;
  }
  const undo = async () => {
    if (made && attempt) await cancelAttempt(supabase, { attemptId: attempt.id, actor: { type: 'staff', id: input.staffId } }).catch(() => undefined);
  };

  const claimed = await claimCredit(supabase, input.creditId, attempt.id, 'staff', input.staffId);
  if (!claimed) {
    await undo();
    return { ok: false, code: 'CREDIT_TAKEN' };
  }

  const res = await transitionAttempt(supabase, {
    attemptId: attempt.id,
    from: ['created', 'awaiting_credit', 'expired'],
    to: 'succeeded',
    patch: {
      matched_credit_id: input.creditId,
      utr: credit.utr,
      payer_vpa: credit.payer_vpa,
      payer_name: credit.payer_name,
      metadata: { ...((attempt as any).metadata || {}), ...marks },
    },
    actor: { type: 'staff', id: input.staffId },
    action: 'credit_assigned',
    jobs: [{ job: 'fulfil_intent' }],
  });
  if (!res.ok) {
    await releaseCredit(supabase, input.creditId, attempt.id);
    await undo();
    return { ok: false, code: 'WRONG_STATE', state: res.state };
  }
  return { ok: true, attemptId: attempt.id };
}

export type SimpleResult = { ok: true } | { ok: false; code: 'REASON_REQUIRED' | 'CREDIT_NOT_FOUND' | 'CREDIT_TAKEN' };

/** Not a fee (rent, a refund coming back, a duplicate alert). Kept, never deleted. */
export async function ignoreCredit(supabase: any, input: { creditId: string; reason: string; staffId: string; now?: Date }): Promise<SimpleResult> {
  const text = (input.reason || '').trim();
  if (text.length < 3) return { ok: false, code: 'REASON_REQUIRED' };
  const credit = await loadRow<BankCreditEventRow & { metadata?: Record<string, unknown> }>(supabase, 'bank_credit_events', input.creditId);
  if (!credit) return { ok: false, code: 'CREDIT_NOT_FOUND' };
  if (credit.matched_attempt_id) return { ok: false, code: 'CREDIT_TAKEN' };
  const { error } = await supabase
    .from('bank_credit_events')
    .update({ ignored_at: (input.now || new Date()).toISOString(), ignored_reason: text, metadata: { ...(credit.metadata || {}), ignored_by: input.staffId } })
    .eq('id', input.creditId);
  if (error) throw error;
  return { ok: true };
}

/** A held order was not real: the student's attempt is rejected and the credit returns to Unmatched. */
export async function rejectHeldAttempt(supabase: any, input: { attemptId: string; staffId: string; note: string }): Promise<TransitionResult> {
  const res = await reviewAttempt(supabase, { attemptId: input.attemptId, decision: 'reject', staffId: input.staffId, note: input.note });
  if (!res.ok) return res;
  const { error } = await supabase.from('bank_credit_events').update({ matched_attempt_id: null, match_kind: null, assigned_by: null }).eq('matched_attempt_id', input.attemptId);
  if (error) throw error;
  return res;
}

// ── statement tick / dispute ─────────────────────────────────────────────────

export type ReconcileResult = { ok: true; ledgerStamped: boolean } | { ok: false; code: 'NOT_FOUND' | 'WRONG_STATE'; state?: string };

/** "Seen in the bank statement": on the attempt and on the ledger row it produced. */
export async function reconcileAttempt(supabase: any, input: { attemptId: string; staffId: string; now?: Date }): Promise<ReconcileResult> {
  const attempt = await loadRow<PaymentAttemptRow>(supabase, 'payment_attempts', input.attemptId);
  if (!attempt) return { ok: false, code: 'NOT_FOUND' };
  if (attempt.state !== 'succeeded') return { ok: false, code: 'WRONG_STATE', state: attempt.state };
  const nowIso = (input.now || new Date()).toISOString();
  const { error: aErr } = await supabase.from('payment_attempts').update({ statement_checked: true }).eq('id', input.attemptId);
  if (aErr) throw aErr;
  const { data: stamped, error: pErr } = await supabase.from('payments').update({ reconciled_at: nowIso, reconciled_by: input.staffId }).eq('attempt_id', input.attemptId).select('id');
  if (pErr) throw pErr;
  await audit(supabase, { actorId: input.staffId, action: 'reconciled', attemptId: input.attemptId, intentId: attempt.intent_id, after: { statement_checked: true } });
  return { ok: true, ledgerStamped: (stamped || []).length > 0 };
}

/** "Not in the statement": the attempt moves to disputed, the ledger row is flagged, staff are told. Access removal stays a human step. */
export async function disputeAttempt(supabase: any, input: { attemptId: string; staffId: string; note: string; now?: Date }): Promise<TransitionResult> {
  const text = (input.note || '').trim();
  if (text.length < 5) return { ok: false, code: 'REASON_REQUIRED' };
  const nowIso = (input.now || new Date()).toISOString();
  const res = await transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['succeeded'],
    to: 'disputed',
    patch: { review_by: input.staffId, review_at: nowIso, review_note: text },
    actor: { type: 'staff', id: input.staffId },
    action: 'disputed',
    jobs: [{ job: 'alert_staff:dispute', payload: { note: text } }],
  });
  if (!res.ok) return res;
  const { error } = await supabase.from('payments').update({ disputed_at: nowIso }).eq('attempt_id', input.attemptId);
  if (error) throw error;
  await bell(
    supabase,
    `Payment disputed: ${formatPaise(Number(res.attempt.amount_paise))}`,
    `${text} (payment ${input.attemptId.slice(0, 8)}). Contact the student; remove access only after the founder confirms.`,
    { kind: 'payment_disputed', attempt_id: input.attemptId },
  );
  return res;
}

/** keep: it was in the statement after all (ticked). reverse: it was not; the state says so, access is removed by hand. */
export async function resolveDispute(supabase: any, input: { attemptId: string; staffId: string; outcome: 'keep' | 'reverse'; note?: string | null; now?: Date }): Promise<TransitionResult> {
  const text = (input.note || '').trim() || null;
  const nowIso = (input.now || new Date()).toISOString();
  if (input.outcome === 'keep') {
    const res = await transitionAttempt(supabase, {
      attemptId: input.attemptId,
      from: ['disputed'],
      to: 'succeeded',
      patch: { review_by: input.staffId, review_at: nowIso, review_note: text, statement_checked: true },
      actor: { type: 'staff', id: input.staffId },
      action: 'dispute_resolved',
    });
    if (!res.ok) return res;
    const { error } = await supabase.from('payments').update({ disputed_at: null, reconciled_at: nowIso, reconciled_by: input.staffId }).eq('attempt_id', input.attemptId);
    if (error) throw error;
    return res;
  }
  if (!text || text.length < 5) return { ok: false, code: 'REASON_REQUIRED' };
  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['disputed'],
    to: 'reversed',
    patch: { review_by: input.staffId, review_at: nowIso, review_note: text },
    actor: { type: 'staff', id: input.staffId },
    action: 'reversed',
    jobs: [{ job: 'alert_staff:reversed', payload: { note: text } }],
  });
}

// ── the desk ─────────────────────────────────────────────────────────────────

export interface DeskPayment {
  id: string;
  receipt_number: string | null;
  reconciled_at: string | null;
  disputed_at: string | null;
}

export interface DeskAttempt {
  attempt: PaymentAttemptRow;
  intent: PaymentIntentRow | null;
  credit: BankCreditEventRow | null;
  student: StudentRef;
  payment: DeskPayment | null;
  /** Why policy held it (held bucket only). */
  reason: string | null;
}

export interface DeskIntent {
  id: string;
  purpose: string;
  scheme: string | null;
  amountPaise: number;
  createdAt: string;
  student: StudentRef;
}

/** An unmatched credit that looks like the second alert of a payment already matched. */
export interface CreditTwin {
  creditId: string;
  attemptId: string;
}

export interface DeskHealth extends WatcherHealth {
  outbox: { pending: number; dead: number };
  mode: 'off' | 'shadow' | 'live';
  policy: UpiAutoSettings;
}

export interface CreditsDesk {
  unmatched: (BankCreditEventRow & { twin: CreditTwin | null })[];
  shadow: (BankCreditEventRow & { attempt: PaymentAttemptRow | null; student: StudentRef | null })[];
  held: DeskAttempt[];
  toConfirm: DeskAttempt[];
  disputed: DeskAttempt[];
  openIntents: DeskIntent[];
  health: DeskHealth;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const byNewest = (col: string) => (a: any, b: any) => ms(b[col]) - ms(a[col]);

async function studentRefs(supabase: any, intents: PaymentIntentRow[]): Promise<Map<string, StudentRef>> {
  const userIds = Array.from(new Set(intents.map((i) => i.user_id).filter(Boolean))) as string[];
  const linkIds = Array.from(new Set(intents.map((i) => i.enrollment_link_id).filter(Boolean))) as string[];
  const [users, links] = await Promise.all([
    userIds.length ? supabase.from('users').select('id, name, first_name, last_name, phone').in('id', userIds) : Promise.resolve({ data: [], error: null }),
    linkIds.length ? supabase.from('direct_enrollment_links').select('id, student_name').in('id', linkIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (users.error) throw users.error;
  if (links.error) throw links.error;
  const userById = new Map<string, any>((users.data || []).map((u: any) => [u.id, u]));
  const linkById = new Map<string, any>((links.data || []).map((l: any) => [l.id, l]));
  const out = new Map<string, StudentRef>();
  for (const i of intents) {
    const u = i.user_id ? userById.get(i.user_id) : null;
    const l = i.enrollment_link_id ? linkById.get(i.enrollment_link_id) : null;
    const userName = u ? u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;
    out.set(i.id, { name: l?.student_name || userName, phone: u?.phone || null, userId: i.user_id || null, linkId: i.enrollment_link_id || null });
  }
  return out;
}

const NOBODY: StudentRef = { name: null, phone: null, userId: null, linkId: null };

export async function listCreditsDesk(supabase: any, input: { policy: UpiAutoSettings; now?: Date }): Promise<CreditsDesk> {
  const now = input.now || new Date();
  const t = now.getTime();
  const since = (days: number) => new Date(t - days * DAY_MS).toISOString();

  const [creditsRes, pendingRes, confirmRes, openRes, outboxRes, health] = await Promise.all([
    supabase.from('bank_credit_events').select('*').is('ignored_at', null).gte('received_at', since(60)).order('received_at', { ascending: false }).limit(1000),
    supabase.from('payment_attempts').select('*').in('method', AUTO_METHODS).in('state', ['awaiting_review', 'disputed']).limit(500),
    supabase.from('payment_attempts').select('*').in('method', AUTO_METHODS).eq('state', 'succeeded').neq('statement_checked', true).gte('created_at', since(60)).order('created_at', { ascending: false }).limit(100),
    supabase.from('payment_intents').select('*').eq('status', 'open').limit(500),
    supabase.from('payment_outbox').select('status').in('status', ['pending', 'dead']),
    watcherHealth(supabase, input.policy.silentAfterMinutes, now),
  ]);
  for (const r of [creditsRes, pendingRes, confirmRes, openRes, outboxRes]) if (r.error) throw r.error;
  const credits: BankCreditEventRow[] = creditsRes.data || [];
  const pending: PaymentAttemptRow[] = pendingRes.data || [];
  const openIntentsRaw: PaymentIntentRow[] = openRes.data || [];

  const matchedCredits = credits.filter((c) => c.matched_attempt_id);
  const twinOf = (c: BankCreditEventRow): CreditTwin | null => {
    const at = ms(c.received_at || c.credited_at);
    const twin = matchedCredits.find((m) => m.id !== c.id && Number(m.amount_paise) === Number(c.amount_paise) && Math.abs(ms(m.received_at || m.credited_at) - at) <= TWIN_MS);
    return twin ? { creditId: twin.id, attemptId: twin.matched_attempt_id as string } : null;
  };
  const unmatched = credits
    .filter((c) => !c.matched_attempt_id && !(c as any).shadow_attempt_id && t - ms(c.received_at) <= 30 * DAY_MS)
    .sort(byNewest('received_at'))
    .map((c) => ({ ...c, twin: twinOf(c) }));
  const shadowRaw = credits.filter((c) => !c.matched_attempt_id && (c as any).shadow_attempt_id && t - ms(c.received_at) <= 14 * DAY_MS).sort(byNewest('received_at'));

  const held = pending.filter((a) => a.state === 'awaiting_review').sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const disputed = pending.filter((a) => a.state === 'disputed').sort(byNewest('created_at'));
  const toConfirm: PaymentAttemptRow[] = ((confirmRes.data || []) as PaymentAttemptRow[]).filter((a) => !a.statement_checked).sort(byNewest('created_at')).slice(0, 100);

  // Intents behind the attempts (shadow orders included), then the students behind the intents.
  const shadowAttemptIds = shadowRaw.map((c) => (c as any).shadow_attempt_id as string);
  const shadowAttempts: PaymentAttemptRow[] = shadowAttemptIds.length ? (await supabase.from('payment_attempts').select('*').in('id', shadowAttemptIds)).data || [] : [];
  const deskAttempts = [...held, ...toConfirm, ...disputed];
  const intentIds = Array.from(new Set([...deskAttempts, ...shadowAttempts].map((a) => a.intent_id)));
  const intentsRes = intentIds.length ? await supabase.from('payment_intents').select('*').in('id', intentIds) : { data: [], error: null };
  if (intentsRes.error) throw intentsRes.error;
  const intentById = new Map<string, PaymentIntentRow>((intentsRes.data || []).map((i: PaymentIntentRow) => [i.id, i]));
  const students = await studentRefs(supabase, [...(intentsRes.data || []), ...openIntentsRaw]);

  const attemptIds = deskAttempts.map((a) => a.id);
  const paymentsRes = attemptIds.length ? await supabase.from('payments').select('id, attempt_id, receipt_number, reconciled_at, disputed_at').in('attempt_id', attemptIds) : { data: [], error: null };
  if (paymentsRes.error) throw paymentsRes.error;
  const paymentByAttempt = new Map<string, DeskPayment>(
    (paymentsRes.data || []).map((p: any) => [p.attempt_id, { id: p.id, receipt_number: p.receipt_number ?? null, reconciled_at: p.reconciled_at ?? null, disputed_at: p.disputed_at ?? null }]),
  );
  const creditById = new Map<string, BankCreditEventRow>(credits.map((c) => [c.id, c]));

  const view = (a: PaymentAttemptRow): DeskAttempt => ({
    attempt: a,
    intent: intentById.get(a.intent_id) || null,
    credit: a.matched_credit_id ? creditById.get(a.matched_credit_id) || null : null,
    student: students.get(a.intent_id) || NOBODY,
    payment: paymentByAttempt.get(a.id) || null,
    reason: a.state === 'awaiting_review' ? ((a as any).metadata?.review_reason as string) || null : null,
  });

  const shadowAttemptById = new Map<string, PaymentAttemptRow>(shadowAttempts.map((a) => [a.id, a]));
  const shadow = shadowRaw.map((c) => {
    const attempt = shadowAttemptById.get((c as any).shadow_attempt_id) || null;
    return { ...c, attempt, student: attempt ? students.get(attempt.intent_id) || null : null };
  });

  const openIntents: DeskIntent[] = openIntentsRaw
    .map((i) => ({ id: i.id, purpose: i.purpose, scheme: i.scheme ?? null, amountPaise: Number(i.amount_paise), createdAt: i.created_at, student: students.get(i.id) || NOBODY }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));

  const outboxRows: { status: string }[] = outboxRes.data || [];
  const policy = input.policy;
  return {
    unmatched,
    shadow,
    held: held.map(view),
    toConfirm: toConfirm.map(view),
    disputed: disputed.map(view),
    openIntents,
    health: {
      ...health,
      outbox: { pending: outboxRows.filter((r) => r.status === 'pending').length, dead: outboxRows.filter((r) => r.status === 'dead').length },
      mode: !policy.enabled ? 'off' : policy.shadowMode ? 'shadow' : 'live',
      policy,
    },
  };
}
