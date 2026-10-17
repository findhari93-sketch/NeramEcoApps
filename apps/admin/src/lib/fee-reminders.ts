/**
 * Staff fee reminders: once a day (09:30 IST), tell the office which second
 * installments are coming up, due today, or overdue.
 *
 * The rules for "which reminder, when" live in planFeeReminders
 * (@neram/database fee-plan), shared with the Nexus student cron. This file adds
 * the staff copy and the run itself: reconcile, plan, claim each reminder in
 * fee_reminder_log (so a rerun never repeats one), one bell entry per reminder,
 * then ONE phone push summary per run.
 *
 * The copy builders are pure and unit tested (fee-reminders.test.ts).
 */

import {
  buildFeeView,
  pickFeeLead,
  planFeeReminders,
  reminderCandidatesFromView,
  formatRupees,
  formatDueDate,
  istToday,
  type FeeView,
  type PlannedReminder,
  type FeeLeadRow,
  type FeePaymentRow,
  type InstallmentRow,
} from '@neram/database/fee-plan';

export interface StaffReminderStudent {
  userId: string;
  name: string | null;
  view: FeeView;
  isAlumni?: boolean;
  hasOpenReport?: boolean;
}

export interface StaffReminder extends PlannedReminder {
  name: string;
}

/** Plan today's staff reminders across students. Pure. */
export function planStaffFeeReminders(students: readonly StaffReminderStudent[], now: Date = new Date()): StaffReminder[] {
  const names = new Map(students.map((s) => [s.userId, (s.name || '').trim() || 'A student']));
  const candidates = students.flatMap((s) =>
    reminderCandidatesFromView(s.userId, s.view, { isAlumni: s.isAlumni, hasOpenReport: s.hasOpenReport }),
  );
  return planFeeReminders(candidates, 'staff', now).map((r) => ({ ...r, name: names.get(r.userId) || 'A student' }));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "due in 3 days", "due today", "overdue by 5 days", "overdue by 2 weeks". */
export function dueWords(daysUntil: number): string {
  if (daysUntil > 0) return daysUntil === 1 ? 'due tomorrow' : `due in ${daysUntil} days`;
  if (daysUntil === 0) return 'due today';
  const late = -daysUntil;
  if (late < 14) return `overdue by ${plural(late, 'day', 'days')}`;
  return `overdue by ${plural(Math.floor(late / 7), 'week', 'weeks')}`;
}

/** The bell entry for one reminder. */
export function staffReminderNotification(r: StaffReminder): {
  event_type: 'fee_installment_due' | 'fee_installment_overdue';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
} {
  const overdue = r.kind === 'overdue' || r.kind === 'overdue_weekly';
  const link = `/crm/${r.userId}?section=application`;
  return {
    event_type: overdue ? 'fee_installment_overdue' : 'fee_installment_due',
    title: `${r.name}: ${formatRupees(r.amount)} ${dueWords(r.daysUntil)}`,
    message: overdue
      ? `The second installment was due on ${formatDueDate(r.dueDate)}. Ask the student, or record the payment in Collections if it has come in.`
      : `The second installment is due on ${formatDueDate(r.dueDate)}. Record the payment in Collections when it comes in.`,
    metadata: {
      user_id: r.userId,
      installment_id: r.installmentId,
      due_date: r.dueDate,
      amount: r.amount,
      kind: r.kind,
      link,
    },
  };
}

/** One push for the whole run, or null when nothing was claimed. */
export function staffReminderSummary(
  claimed: readonly Pick<StaffReminder, 'kind' | 'amount'>[],
  now: Date = new Date(),
): { title: string; body: string; url: string; tag: string } | null {
  if (!claimed.length) return null;
  const upcoming = claimed.filter((r) => r.kind === 'upcoming').length;
  const today = claimed.filter((r) => r.kind === 'due_today').length;
  const overdue = claimed.filter((r) => r.kind === 'overdue' || r.kind === 'overdue_weekly').length;
  const total = claimed.reduce((s, r) => s + r.amount, 0);
  const parts: string[] = [];
  if (upcoming) parts.push(`${upcoming} due in the next few days`);
  if (today) parts.push(`${today} due today`);
  if (overdue) parts.push(`${overdue} overdue`);
  return {
    title: `Fees to collect: ${formatRupees(total)}`,
    body: `${parts.join(', ')}. Open Collections to see who.`,
    url: '/collections?filter=due',
    tag: `fees-${istToday(now)}`,
  };
}

// ─── the run ──────────────────────────────────────────────────────────────────

const CHUNK = 150;

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function selectIn(sb: any, table: string, columns: string, column: string, ids: string[], extra?: (q: any) => any) {
  const rows: any[] = [];
  for (const part of chunks(ids)) {
    let q = sb.from(table).select(columns).in(column, part);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

const LEAD_COLUMNS =
  'id, user_id, created_at, source, application_number, reviewed_by, applicant_category, academic_data, assigned_fee, discount_amount, final_fee, full_payment_discount, allowed_payment_modes, payment_scheme, installment_1_amount, installment_2_amount';

/**
 * Every student with an unpaid installment, read in batches, as fee views. Same
 * pickFeeLead + buildFeeView rules as the form and Collections.
 */
export async function loadReminderStudents(sb: any): Promise<StaffReminderStudent[]> {
  const { data: pending, error } = await sb.from('payment_installments').select('lead_profile_id').eq('status', 'pending').limit(5000);
  if (error) throw error;
  const pendingLeadIds = Array.from(new Set((pending || []).map((r: any) => r.lead_profile_id))) as string[];
  if (!pendingLeadIds.length) return [];

  const owners = await selectIn(sb, 'lead_profiles', 'id, user_id', 'id', pendingLeadIds);
  const userIds = Array.from(new Set(owners.map((l: any) => l.user_id).filter(Boolean))) as string[];
  if (!userIds.length) return [];

  const [users, leads, payments, reports] = await Promise.all([
    selectIn(sb, 'users', 'id, name, is_alumni', 'id', userIds),
    selectIn(sb, 'lead_profiles', LEAD_COLUMNS, 'user_id', userIds, (q) => q.is('deleted_at', null)) as Promise<FeeLeadRow[]>,
    selectIn(
      sb,
      'payments',
      'id, user_id, amount, status, paid_at, created_at, installment_number, payment_method',
      'user_id',
      userIds,
      (q) => q.eq('status', 'paid'),
    ) as Promise<FeePaymentRow[]>,
    selectIn(sb, 'fee_correction_reports', 'id, user_id', 'user_id', userIds, (q) => q.eq('status', 'open')),
  ]);

  const leadsByUser = new Map<string, FeeLeadRow[]>();
  for (const l of leads) {
    const list = leadsByUser.get(l.user_id as string) || [];
    list.push(l);
    leadsByUser.set(l.user_id as string, list);
  }
  const feeLeads = userIds
    .map((id) => pickFeeLead(leadsByUser.get(id) || []))
    .filter((l): l is FeeLeadRow => Boolean(l));
  const installments = (await selectIn(
    sb,
    'payment_installments',
    'id, lead_profile_id, installment_number, amount, due_date, status, paid_at, paid_amount, payment_id',
    'lead_profile_id',
    feeLeads.map((l) => l.id),
  )) as InstallmentRow[];

  const reportUsers = new Set(reports.map((r: any) => r.user_id));
  return users.map((u: any) => {
    const lead = pickFeeLead(leadsByUser.get(u.id) || []);
    return {
      userId: u.id,
      name: u.name,
      isAlumni: Boolean(u.is_alumni),
      hasOpenReport: reportUsers.has(u.id),
      view: buildFeeView({
        lead,
        payments: payments.filter((p) => p.user_id === u.id),
        installments: lead ? installments.filter((i) => i.lead_profile_id === lead.id) : [],
      }),
    };
  });
}
