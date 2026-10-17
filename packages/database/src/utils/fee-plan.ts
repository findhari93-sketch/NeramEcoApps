/**
 * Fees as a plan: what a student agreed to pay, what arrived, and what is still
 * due on which date. Pure functions only, so Admin (the form, Collections, the
 * staff reminder cron) and Nexus (the student's "Check your details" page, the
 * student reminder cron) all work out the same rupees from the same rows.
 *
 * WHICH NUMBER IS TRUE (same rule as queries/student-fees.ts):
 *   lead_profiles.final_fee      the agreed total
 *   payments where status=paid   what arrived
 *   payment_installments         the schedule: installment 2's amount and due date
 *   student_profiles.*           a cache, never read here
 *
 * Due dates are IST calendar dates (YYYY-MM-DD). "Today" is the IST date, so a
 * reminder never fires a day early for a student at 11pm.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── small helpers ────────────────────────────────────────────────────────────

/** A number from a numeric column (Supabase returns DECIMAL as a string). */
export function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in India, YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST calendar date of an instant (a payment's paid_at). */
export function istDateOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return istToday(d);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from today (IST) to `dueDate`. 0 is today, negative is past. */
export function daysUntil(dueDate: string, now: Date = new Date()): number {
  const today = new Date(`${istToday(now)}T00:00:00Z`).getTime();
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.round((due - today) / DAY_MS);
}

/** "16 Oct 2026", for copy. */
export function formatDueDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "₹15,000", for copy. */
export function formatRupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// ─── how money arrived ────────────────────────────────────────────────────────

/** The ways an office payment can arrive, in the order the form offers them. */
export const OFFICE_PAYMENT_METHODS = [
  { value: 'upi_direct', label: 'Google Pay or UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'manual', label: 'Other' },
] as const;

export type OfficePaymentMethod = (typeof OFFICE_PAYMENT_METHODS)[number]['value'];

const METHOD_LABEL: Record<string, string> = {
  upi_direct: 'Google Pay or UPI',
  upi: 'Google Pay or UPI',
  upi_screenshot: 'Google Pay or UPI',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  manual: 'Other',
  razorpay: 'Paid online',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  return (method && METHOD_LABEL[method]) || 'Other';
}

export function isOfficePaymentMethod(value: unknown): value is OfficePaymentMethod {
  return OFFICE_PAYMENT_METHODS.some((m) => m.value === value);
}

// ─── row shapes (only the columns these functions read) ──────────────────────

export interface FeeLeadRow {
  id: string;
  user_id?: string | null;
  created_at?: string | null;
  source?: string | null;
  application_number?: string | null;
  reviewed_by?: string | null;
  applicant_category?: string | null;
  academic_data?: { current_class?: string | null } | null;
  assigned_fee?: number | string | null;
  discount_amount?: number | string | null;
  final_fee?: number | string | null;
  full_payment_discount?: number | string | null;
  allowed_payment_modes?: string | null;
  payment_scheme?: string | null;
  installment_1_amount?: number | string | null;
  installment_2_amount?: number | string | null;
}

export interface FeePaymentRow {
  id: string;
  user_id?: string | null;
  amount: number | string;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  installment_number?: number | null;
  payment_method?: string | null;
  description?: string | null;
  receipt_number?: string | null;
}

export interface InstallmentRow {
  id: string;
  lead_profile_id: string;
  installment_number: number;
  amount: number | string;
  due_date: string;
  status?: string | null;
  paid_at?: string | null;
  paid_amount?: number | string | null;
  payment_id?: string | null;
}

// ─── which row holds the money ───────────────────────────────────────────────

/**
 * A row the student's own Nexus "complete your profile" page wrote: source
 * 'manual', no application number, no member of staff behind it.
 *
 * Mirrors isProfileDetailsOnly in apps/nexus/src/lib/application-form.ts. Keep
 * the two in step: the fee writer stamps reviewed_by on such a row so that, once
 * staff have filled in the form, Nexus stops saying "No application form".
 */
export function isStaffUnreviewedManualRow(row: FeeLeadRow | null | undefined): boolean {
  if (!row) return false;
  return row.source === 'manual' && !String(row.application_number ?? '').trim() && !row.reviewed_by;
}

function looksLikeApplication(row: FeeLeadRow): boolean {
  return Boolean(
    String(row.application_number ?? '').trim() || row.academic_data?.current_class || row.applicant_category,
  );
}

function newestFirst<T extends { created_at?: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

/**
 * The one lead_profiles row a student's money hangs off. Every reader and the
 * writer use this, because "the newest row" splits fees across records for a
 * student who has two (a website form and a profile-page row, say).
 *
 * Newest row with a fee, else the newest real application, else the newest row.
 */
export function pickFeeLead<T extends FeeLeadRow>(rows: readonly T[] | null | undefined): T | null {
  const sorted = newestFirst(rows || []);
  return (
    sorted.find((r) => money(r.final_fee) !== null) ||
    sorted.find((r) => looksLikeApplication(r) && !isStaffUnreviewedManualRow(r)) ||
    sorted[0] ||
    null
  );
}

/**
 * What the student actually owes in total.
 *
 * Online checkout charges final_fee minus full_payment_discount when the student
 * pays in full, so a full payer would otherwise look like they still owe their
 * discount. The office form folds any discount into discount_amount instead and
 * leaves full_payment_discount at 0, so this only matters for older rows.
 */
export function effectiveAgreedFee(lead: FeeLeadRow | null | undefined): number | null {
  if (!lead) return null;
  const final = money(lead.final_fee);
  if (final === null) return null;
  const fullDiscount = money(lead.full_payment_discount) ?? 0;
  if (lead.payment_scheme === 'full' && lead.allowed_payment_modes !== 'full_only' && fullDiscount > 0) {
    return Math.max(0, final - fullDiscount);
  }
  return final;
}

// ─── payments against the schedule ───────────────────────────────────────────

export interface InstallmentAllocation {
  paidAmount: number;
  settled: boolean;
  /** The payment that finished it off, or the last one that touched it. */
  paymentId: string | null;
  /** IST date it became settled. */
  paidOn: string | null;
}

function paidOrder(p: FeePaymentRow): number {
  return new Date(p.paid_at || p.created_at || 0).getTime();
}

/**
 * Apply paid payments to installments. A payment tagged with an installment
 * number settles that one first; everything else is applied oldest first, to the
 * lowest unsettled installment. Waived installments take nothing.
 */
export function allocatePayments(
  installments: readonly InstallmentRow[],
  payments: readonly FeePaymentRow[],
  options: {
    /**
     * Part of the fee not on the schedule (the agreed total minus the scheduled
     * installments). Untagged money pays it first: with only installment 2 on
     * the schedule, the first payment is the first installment, not the second.
     */
    unscheduledFirst?: number;
  } = {},
): Map<string, InstallmentAllocation> {
  const live = [...installments]
    .filter((i) => i.status !== 'waived')
    .sort((a, b) => a.installment_number - b.installment_number);
  const result = new Map<string, InstallmentAllocation>();
  for (const i of installments) {
    result.set(i.id, { paidAmount: 0, settled: i.status === 'waived', paymentId: null, paidOn: null });
  }
  const paid = [...payments].filter((p) => (p.status ?? 'paid') === 'paid').sort((a, b) => paidOrder(a) - paidOrder(b));

  const credit = (inst: InstallmentRow, amount: number, p: FeePaymentRow): number => {
    const slot = result.get(inst.id)!;
    const due = money(inst.amount) ?? 0;
    const room = Math.max(0, due - slot.paidAmount);
    const used = Math.min(room, amount);
    if (used <= 0) return amount;
    slot.paidAmount += used;
    slot.paymentId = p.id;
    if (!slot.settled && slot.paidAmount >= due - 0.01) {
      slot.settled = true;
      slot.paidOn = istDateOf(p.paid_at || p.created_at);
    }
    return amount - used;
  };

  const pool: { p: FeePaymentRow; left: number }[] = [];
  for (const p of paid) {
    let left = money(p.amount) ?? 0;
    const target = p.installment_number ? live.find((i) => i.installment_number === p.installment_number) : undefined;
    if (target) left = credit(target, left, p);
    if (left > 0.01) pool.push({ p, left });
  }
  let unscheduled = Math.max(0, options.unscheduledFirst ?? 0);
  for (const entry of pool) {
    if (unscheduled > 0.01) {
      const used = Math.min(unscheduled, entry.left);
      unscheduled -= used;
      entry.left -= used;
    }
    for (const inst of live) {
      if (entry.left <= 0.01) break;
      entry.left = credit(inst, entry.left, entry.p);
    }
  }
  return result;
}

// ─── the student's fee, as one view ──────────────────────────────────────────

export type FeePlanKind = 'full' | 'installment';

export interface FeeView {
  agreed: number | null;
  assignedFee: number | null;
  discount: number;
  plan: FeePlanKind | null;
  payments: { id: string; paidOn: string | null; amount: number; method: string; methodLabel: string }[];
  paidTotal: number;
  balance: number | null;
  installments: {
    id: string;
    number: number;
    amount: number;
    dueDate: string;
    waived: boolean;
    paidAmount: number;
    settled: boolean;
  }[];
  /** The earliest unsettled installment, or the plain balance with no date. */
  nextDue: { installmentId: string | null; number: number | null; amount: number; dueDate: string | null } | null;
}

/**
 * Everything a person needs to read a student's fee: the agreed total, every
 * payment, the schedule, and what is next. Used by the student page, the Admin
 * form summary and Collections.
 */
export function buildFeeView(input: {
  lead: FeeLeadRow | null;
  payments: readonly FeePaymentRow[];
  installments: readonly InstallmentRow[];
}): FeeView {
  const { lead } = input;
  const installments = (input.installments || []).filter((i) => !lead || i.lead_profile_id === lead.id);
  const paidPayments = (input.payments || []).filter((p) => (p.status ?? 'paid') === 'paid');
  const agreed = effectiveAgreedFee(lead);
  const paidTotal = paidPayments.reduce((sum, p) => sum + (money(p.amount) ?? 0), 0);
  const balance = agreed === null ? null : Math.max(0, agreed - paidTotal);
  const scheduled = installments
    .filter((i) => i.status !== 'waived')
    .reduce((sum, i) => sum + (money(i.amount) ?? 0), 0);
  const alloc = allocatePayments(installments, paidPayments, {
    unscheduledFirst: agreed === null ? 0 : Math.max(0, agreed - scheduled),
  });

  const schedule = [...installments]
    .sort((a, b) => a.installment_number - b.installment_number)
    .map((i) => {
      const a = alloc.get(i.id)!;
      return {
        id: i.id,
        number: i.installment_number,
        amount: money(i.amount) ?? 0,
        dueDate: i.due_date,
        waived: i.status === 'waived',
        paidAmount: a.paidAmount,
        settled: a.settled,
      };
    });

  let nextDue: FeeView['nextDue'] = null;
  if (balance !== null && balance > 0.01) {
    const open = schedule.find((i) => !i.waived && !i.settled);
    nextDue = open
      ? {
          installmentId: open.id,
          number: open.number,
          amount: Math.min(balance, Math.max(0, open.amount - open.paidAmount)),
          dueDate: open.dueDate,
        }
      : { installmentId: null, number: null, amount: balance, dueDate: null };
  }

  const hasSecond = schedule.some((i) => i.number >= 2 && !i.waived);
  const plan: FeePlanKind | null = !lead || agreed === null ? null : hasSecond || lead.payment_scheme === 'installment' ? 'installment' : 'full';

  return {
    agreed,
    assignedFee: lead ? money(lead.assigned_fee) : null,
    discount: lead ? money(lead.discount_amount) ?? 0 : 0,
    plan,
    payments: [...paidPayments]
      .sort((a, b) => paidOrder(a) - paidOrder(b))
      .map((p) => ({
        id: p.id,
        paidOn: istDateOf(p.paid_at || p.created_at),
        amount: money(p.amount) ?? 0,
        method: p.payment_method || 'manual',
        methodLabel: paymentMethodLabel(p.payment_method),
      })),
    paidTotal,
    balance,
    installments: schedule,
    nextDue,
  };
}

/**
 * A short fingerprint of what the student is shown. Stored when a check is sent
 * and when they confirm, so a staff edit afterwards reads "changed after they
 * confirmed" instead of passing silently.
 */
export function feeSignature(view: FeeView): string {
  const parts = [
    view.agreed ?? 'none',
    view.plan ?? 'none',
    view.paidTotal.toFixed(2),
    ...view.installments.filter((i) => !i.waived).map((i) => `${i.number}:${i.amount.toFixed(2)}@${i.dueDate}`),
  ];
  return parts.join('|');
}

// ─── Collections ──────────────────────────────────────────────────────────────

export type CollectionStatus =
  | 'missing_fee'
  | 'paid'
  | 'no_date'
  | 'due_later'
  | 'due_soon'
  | 'due_today'
  | 'overdue';

/** Within this many days, a due date counts as "soon". */
export const DUE_SOON_DAYS = 7;

export interface CollectionsStudentInput {
  userId: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  academicYear: string | null;
  isAlumni?: boolean;
}

export interface CollectionsRow {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  academicYear: string | null;
  leadProfileId: string | null;
  plan: FeePlanKind | null;
  agreed: number | null;
  collected: number;
  balance: number | null;
  nextDue: FeeView['nextDue'];
  daysUntilDue: number | null;
  status: CollectionStatus;
  openReportId: string | null;
  checkStatus: string | null;
  isAlumni: boolean;
}

export interface CollectionsTotals {
  students: number;
  agreed: number;
  collected: number;
  toCollect: number;
  overdueAmount: number;
  overdueCount: number;
  dueSoonCount: number;
  noDateCount: number;
  missingFeeCount: number;
  openReports: number;
}

export interface CollectionsResult {
  rows: CollectionsRow[];
  totals: CollectionsTotals;
}

export function collectionStatus(view: FeeView, now: Date = new Date()): { status: CollectionStatus; days: number | null } {
  if (view.agreed === null) return { status: 'missing_fee', days: null };
  if (view.balance === null || view.balance <= 0.01 || !view.nextDue) return { status: 'paid', days: null };
  if (!view.nextDue.dueDate) return { status: 'no_date', days: null };
  const days = daysUntil(view.nextDue.dueDate, now);
  if (days < 0) return { status: 'overdue', days };
  if (days === 0) return { status: 'due_today', days };
  if (days <= DUE_SOON_DAYS) return { status: 'due_soon', days };
  return { status: 'due_later', days };
}

/**
 * Who owes what, for one group of students (Admin passes one academic year).
 * Overdue is worked out here from the due date, never stored, so it cannot
 * drift the way the student_profiles cache did.
 */
export function buildCollections(
  input: {
    students: readonly CollectionsStudentInput[];
    leads: readonly FeeLeadRow[];
    payments: readonly FeePaymentRow[];
    installments: readonly InstallmentRow[];
    openReports?: readonly { id: string; user_id: string }[];
    checks?: readonly { user_id: string; status: string; created_at?: string | null }[];
  },
  now: Date = new Date(),
): CollectionsResult {
  const leadsByUser = groupBy(input.leads, (l) => l.user_id || '');
  const paymentsByUser = groupBy(input.payments, (p) => p.user_id || '');
  const installmentsByLead = groupBy(input.installments, (i) => i.lead_profile_id);
  const reportByUser = new Map<string, string>();
  for (const r of input.openReports || []) if (!reportByUser.has(r.user_id)) reportByUser.set(r.user_id, r.id);
  const checkByUser = new Map<string, string>();
  for (const c of newestFirst(input.checks || [])) if (!checkByUser.has(c.user_id)) checkByUser.set(c.user_id, c.status);

  const totals: CollectionsTotals = {
    students: 0,
    agreed: 0,
    collected: 0,
    toCollect: 0,
    overdueAmount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    noDateCount: 0,
    missingFeeCount: 0,
    openReports: 0,
  };

  const rows: CollectionsRow[] = input.students.map((s) => {
    const lead = pickFeeLead(leadsByUser.get(s.userId) || []);
    const view = buildFeeView({
      lead,
      payments: paymentsByUser.get(s.userId) || [],
      installments: lead ? installmentsByLead.get(lead.id) || [] : [],
    });
    const { status, days } = collectionStatus(view, now);

    totals.students += 1;
    totals.collected += view.paidTotal;
    if (view.agreed !== null) totals.agreed += view.agreed;
    if (view.balance) totals.toCollect += view.balance;
    if (status === 'overdue') {
      totals.overdueCount += 1;
      totals.overdueAmount += view.nextDue?.amount ?? 0;
    }
    if (status === 'due_soon' || status === 'due_today') totals.dueSoonCount += 1;
    if (status === 'no_date') totals.noDateCount += 1;
    if (status === 'missing_fee') totals.missingFeeCount += 1;
    if (reportByUser.has(s.userId)) totals.openReports += 1;

    return {
      userId: s.userId,
      name: s.name,
      email: s.email ?? null,
      phone: s.phone ?? null,
      academicYear: s.academicYear,
      leadProfileId: lead?.id ?? null,
      plan: view.plan,
      agreed: view.agreed,
      collected: view.paidTotal,
      balance: view.balance,
      nextDue: view.nextDue,
      daysUntilDue: days,
      status,
      openReportId: reportByUser.get(s.userId) ?? null,
      checkStatus: checkByUser.get(s.userId) ?? null,
      isAlumni: Boolean(s.isAlumni),
    };
  });

  return { rows, totals };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows || []) {
    const k = key(row);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

// ─── reminders ────────────────────────────────────────────────────────────────

export type ReminderAudience = 'staff' | 'student';
export type ReminderKind = 'upcoming' | 'due_today' | 'overdue' | 'overdue_weekly';

/** Reminders start this many days before the due date. */
export const REMINDER_LEAD_DAYS = 3;

export interface ReminderCandidate {
  installmentId: string;
  userId: string;
  number: number;
  /** What is still owed on this installment. */
  amount: number;
  dueDate: string;
  settled: boolean;
  waived?: boolean;
  isAlumni?: boolean;
  /** The student has told the office "I already paid" and it is not resolved. */
  hasOpenReport?: boolean;
}

export interface PlannedReminder {
  installmentId: string;
  userId: string;
  kind: ReminderKind;
  dueDate: string;
  amount: number;
  daysUntil: number;
  dedupeKey: string;
}

/**
 * Which reminders are due today. The caller claims each dedupeKey in
 * fee_reminder_log before sending, so a rerun or a retry never sends twice.
 *
 * - Upcoming fires once anywhere in the 3 days before, so a missed cron run
 *   still catches up.
 * - Due today fires on the day.
 * - Staff hear about an overdue one once, then weekly. Students are not chased
 *   by the robot after the date; staff decide how to ask.
 * - The due date is part of the key, so moving the date re-arms everything.
 */
export function planFeeReminders(
  candidates: readonly ReminderCandidate[],
  audience: ReminderAudience,
  now: Date = new Date(),
): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const c of candidates) {
    if (c.settled || c.waived || c.isAlumni || c.amount <= 0.01) continue;
    if (!isDateKey(c.dueDate)) continue;
    if (audience === 'student' && c.hasOpenReport) continue;
    const d = daysUntil(c.dueDate, now);
    let kind: ReminderKind | null = null;
    let suffix = '';
    if (d >= 1 && d <= REMINDER_LEAD_DAYS) kind = 'upcoming';
    else if (d === 0) kind = 'due_today';
    else if (d < 0 && audience === 'staff') {
      if (-d < 7) kind = 'overdue';
      else {
        kind = 'overdue_weekly';
        suffix = `:w${Math.floor(-d / 7)}`;
      }
    }
    if (!kind) continue;
    out.push({
      installmentId: c.installmentId,
      userId: c.userId,
      kind,
      dueDate: c.dueDate,
      amount: c.amount,
      daysUntil: d,
      dedupeKey: `${audience}:${kind}:${c.installmentId}:${c.dueDate}${suffix}`,
    });
  }
  return out;
}

/** Reminder candidates from one student's fee view (open installments only). */
export function reminderCandidatesFromView(
  userId: string,
  view: FeeView,
  extra: { isAlumni?: boolean; hasOpenReport?: boolean } = {},
): ReminderCandidate[] {
  const balance = view.balance ?? 0;
  if (balance <= 0.01) return [];
  return view.installments
    .filter((i) => !i.waived && !i.settled)
    .map((i) => ({
      installmentId: i.id,
      userId,
      number: i.number,
      amount: Math.min(balance, Math.max(0, i.amount - i.paidAmount)),
      dueDate: i.dueDate,
      settled: false,
      isAlumni: extra.isAlumni,
      hasOpenReport: extra.hasOpenReport,
    }));
}

// ─── validating what staff typed ─────────────────────────────────────────────

export interface PaymentLineInput {
  /** A UUID made by the form, one per line. Becomes payments.idempotency_key. */
  key: string;
  amount: number;
  /** YYYY-MM-DD, the day the money arrived. */
  paidOn: string;
  method: string;
  reference?: string | null;
  installmentNumber?: number | null;
}

export interface FeePlanInput {
  assignedFee: number | null;
  discount?: number | null;
  scheme: FeePlanKind;
  installment1Amount?: number | null;
  installment2Amount?: number | null;
  /** YYYY-MM-DD */
  installment2DueDate?: string | null;
}

export interface FeePlanCheck {
  errors: { field: string; message: string }[];
  warnings: string[];
  finalFee: number | null;
}

/**
 * Refuse what cannot be true, warn about what is merely odd. Error messages are
 * shown next to the field, so they speak to staff, not to a developer.
 */
export function validatePlan(
  plan: FeePlanInput,
  lines: readonly PaymentLineInput[] = [],
  context: { alreadyPaid?: number; existing?: readonly { amount: number; paidOn: string | null }[]; today?: string } = {},
): FeePlanCheck {
  const errors: FeePlanCheck['errors'] = [];
  const warnings: string[] = [];
  const today = context.today ?? istToday();

  const assigned = money(plan.assignedFee);
  const discount = money(plan.discount) ?? 0;
  if (assigned === null) errors.push({ field: 'assignedFee', message: 'Enter the total coaching fee.' });
  else if (assigned <= 0) errors.push({ field: 'assignedFee', message: 'The total fee must be more than 0.' });
  if (discount < 0) errors.push({ field: 'discount', message: 'The discount cannot be negative.' });
  if (assigned !== null && discount > assigned) {
    errors.push({ field: 'discount', message: 'The discount cannot be more than the total fee.' });
  }
  const finalFee = assigned === null ? null : Math.max(0, assigned - discount);

  if (plan.scheme !== 'full' && plan.scheme !== 'installment') {
    errors.push({ field: 'scheme', message: 'Choose paid in full or two installments.' });
  }

  const firstPaid = [...lines.map((l) => l.paidOn), ...(context.existing || []).map((e) => e.paidOn)]
    .filter((d): d is string => isDateKey(d))
    .sort()[0];

  if (plan.scheme === 'installment') {
    const i1 = money(plan.installment1Amount);
    const i2 = money(plan.installment2Amount);
    if (i1 === null || i1 <= 0) errors.push({ field: 'installment1Amount', message: 'Enter the first installment.' });
    if (i2 === null || i2 <= 0) errors.push({ field: 'installment2Amount', message: 'Enter the second installment.' });
    if (i1 !== null && i2 !== null && finalFee !== null && !sameMoney(i1 + i2, finalFee)) {
      errors.push({
        field: 'installment2Amount',
        message: `The two installments add up to ${formatRupees(i1 + i2)}, but the fee after discount is ${formatRupees(finalFee)}.`,
      });
    }
    if (!plan.installment2DueDate) {
      errors.push({ field: 'installment2DueDate', message: 'Choose when the second installment is due.' });
    } else if (!isDateKey(plan.installment2DueDate)) {
      errors.push({ field: 'installment2DueDate', message: 'That is not a valid date.' });
    } else {
      if (firstPaid && plan.installment2DueDate < firstPaid) {
        errors.push({
          field: 'installment2DueDate',
          message: 'The second installment cannot be due before the first payment.',
        });
      }
      if (plan.installment2DueDate < today) {
        warnings.push('The second installment due date has already passed, so it will show as overdue.');
      }
    }
  }

  lines.forEach((line, index) => {
    const at = `payments.${index}`;
    const amount = money(line.amount);
    if (amount === null || amount <= 0) errors.push({ field: `${at}.amount`, message: 'Enter the amount received.' });
    if (!isDateKey(line.paidOn)) errors.push({ field: `${at}.paidOn`, message: 'Choose the day it was received.' });
    else if (line.paidOn > today) errors.push({ field: `${at}.paidOn`, message: 'This date is in the future.' });
    if (!isOfficePaymentMethod(line.method)) errors.push({ field: `${at}.method`, message: 'Choose how it was paid.' });
    if (!line.key) errors.push({ field: `${at}.amount`, message: 'Reload the form and try again.' });
    const same = (context.existing || []).find(
      (e) => amount !== null && sameMoney(e.amount, amount) && e.paidOn === line.paidOn,
    );
    if (same) warnings.push(`A payment of ${formatRupees(same.amount)} on ${formatDueDate(line.paidOn)} is already recorded. Check this is not the same money.`);
  });

  const received = (context.alreadyPaid ?? 0) + lines.reduce((s, l) => s + (money(l.amount) ?? 0), 0);
  if (finalFee !== null && received - finalFee > 0.01) {
    warnings.push(`Received ${formatRupees(received)} is more than the fee of ${formatRupees(finalFee)}.`);
  }

  return { errors, warnings, finalFee };
}

// ─── what a student reports ───────────────────────────────────────────────────

export interface CorrectionItemInput {
  amount: number;
  paidOn: string;
  method: string;
  reference?: string | null;
}

export const CORRECTION_NOTE_MAX = 1000;
export const CORRECTION_ITEMS_MAX = 10;

/**
 * A student's "Something is wrong". Payment rows are optional (the problem may
 * be the discount, not a payment), the note is not: staff need words to act on.
 */
export function validateCorrection(
  input: { items?: unknown; note?: unknown },
  today: string = istToday(),
): { ok: true; items: CorrectionItemInput[]; note: string } | { ok: false; error: string } {
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note) return { ok: false, error: 'Tell us what is wrong.' };
  if (note.length > CORRECTION_NOTE_MAX) return { ok: false, error: `Keep the note under ${CORRECTION_NOTE_MAX} characters.` };
  const raw = Array.isArray(input.items) ? input.items : [];
  if (raw.length > CORRECTION_ITEMS_MAX) return { ok: false, error: `Add at most ${CORRECTION_ITEMS_MAX} payments.` };
  const items: CorrectionItemInput[] = [];
  for (const r of raw as any[]) {
    const amount = money(r?.amount);
    if (amount === null || amount <= 0) return { ok: false, error: 'Each payment needs an amount.' };
    if (!isDateKey(r?.paidOn)) return { ok: false, error: 'Each payment needs the date you paid.' };
    if (r.paidOn > today) return { ok: false, error: 'A payment date is in the future.' };
    if (!isOfficePaymentMethod(r?.method)) return { ok: false, error: 'Choose how you paid.' };
    const reference = typeof r?.reference === 'string' ? r.reference.trim().slice(0, 100) : '';
    items.push({ amount, paidOn: r.paidOn, method: r.method, reference: reference || null });
  }
  return { ok: true, items, note };
}
