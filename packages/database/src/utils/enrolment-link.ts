/**
 * Enrolment links (direct_enrollment_links): the payment plan a link carries,
 * its public URL and the message staff share. Pure functions, used by the
 * Admin drawer, the Admin routes and Marketing's enrol flow alike.
 *
 * A link's plan is the office fee plan (fee-plan.ts) in link form:
 *   total_fee / discount_amount / final_fee   the agreed fee
 *   amount_paid                               installment 1, already received
 *   installment_2_amount / _due_date          the balance and when it is due
 * When the student completes enrolment the plan is saved through
 * saveStudentApplicationAndFees, so Collections and the reminders pick it up.
 */
import {
  addDaysToKey,
  formatDueDate,
  formatRupees,
  isDateKey,
  money,
  validatePlan,
  type FeePlanInput,
  type FeePlanKind,
  type PaymentLineInput,
} from './fee-plan';

/** Days to the balance when nothing else says so. */
export const DEFAULT_BALANCE_DUE_DAYS = 45;
export const BALANCE_DUE_PRESETS = [15, 30, 45] as const;
export const ENROLMENT_LINK_VALID_DAYS = 7;

const DEFAULT_MARKETING_URL = 'https://neramclasses.com';

export interface EnrolmentPlanInput {
  totalFee: number | string | null;
  discount?: number | string | null;
  scheme: FeePlanKind;
  amountPaid: number | string | null;
  /** YYYY-MM-DD, the day installment 1 arrived. */
  paymentDate?: string | null;
  paymentMethod?: string | null;
  /** YYYY-MM-DD, only for 'installment'. */
  balanceDueDate?: string | null;
}

export interface EnrolmentPlanCheck {
  errors: { field: 'totalFee' | 'discount' | 'amountPaid' | 'balanceDueDate' | 'paymentDate' | 'scheme'; message: string }[];
  warnings: string[];
  finalFee: number | null;
  paid: number | null;
  balance: number | null;
}

/** Paid now, the balance it leaves and whether the plan holds together. */
export function checkEnrolmentPlan(input: EnrolmentPlanInput, today?: string): EnrolmentPlanCheck {
  const total = money(input.totalFee);
  const discount = money(input.discount) ?? 0;
  const paid = money(input.amountPaid);
  const finalFee = total === null ? null : Math.max(0, total - discount);
  const balance = finalFee === null || paid === null ? null : Math.round((finalFee - paid) * 100) / 100;

  const errors: EnrolmentPlanCheck['errors'] = [];
  const warnings: string[] = [];

  if (paid === null || paid <= 0) errors.push({ field: 'amountPaid', message: 'Enter the amount received.' });
  if (finalFee !== null && paid !== null && paid > 0) {
    if (input.scheme === 'full' && balance !== null && balance > 0.01) {
      errors.push({
        field: 'amountPaid',
        message: `${formatRupees(paid)} is less than the fee of ${formatRupees(finalFee)}. Choose Two installments, or correct the amount.`,
      });
    }
    if (input.scheme === 'installment' && balance !== null && balance <= 0.01) {
      errors.push({ field: 'amountPaid', message: 'This covers the whole fee. Choose Paid in full instead.' });
    }
  }
  if (input.paymentDate && !isDateKey(input.paymentDate)) {
    errors.push({ field: 'paymentDate', message: 'That is not a valid date.' });
  }

  const plan: FeePlanInput = {
    assignedFee: total,
    discount,
    scheme: input.scheme,
    installment1Amount: input.scheme === 'installment' ? paid : null,
    installment2Amount: input.scheme === 'installment' ? balance : null,
    installment2DueDate: input.scheme === 'installment' ? input.balanceDueDate || null : null,
  };
  const lines: PaymentLineInput[] =
    paid && paid > 0 && input.paymentDate && isDateKey(input.paymentDate)
      ? [{ key: 'enrolment-link', amount: paid, paidOn: input.paymentDate, method: input.paymentMethod || 'upi_direct' }]
      : [];
  const shared = validatePlan(plan, lines, today ? { today } : {});

  for (const e of shared.errors) {
    if (e.field === 'assignedFee') errors.push({ field: 'totalFee', message: e.message });
    else if (e.field === 'discount') errors.push({ field: 'discount', message: e.message });
    else if (e.field === 'scheme') errors.push({ field: 'scheme', message: e.message });
    else if (e.field === 'installment2DueDate') {
      errors.push({
        field: 'balanceDueDate',
        message: e.message.replace('the first payment', 'the payment date').replace('the second installment', 'the balance'),
      });
    } else if (e.field === 'payments.0.paidOn') errors.push({ field: 'paymentDate', message: e.message });
    // installment1/2 amount errors are covered by the amountPaid checks above.
  }
  warnings.push(...shared.warnings.filter((w) => !w.startsWith('A payment of')));

  // One message per field, first wins.
  const seen = new Set<string>();
  const unique = errors.filter((e) => (seen.has(e.field) ? false : (seen.add(e.field), true)));
  return { errors: unique, warnings, finalFee, paid, balance };
}

/** Default balance due date: the fee structure's days, else 45, after payment. */
export function defaultBalanceDueDate(paymentDate: string, dueDays?: number | null): string {
  const days = dueDays && dueDays > 0 ? dueDays : DEFAULT_BALANCE_DUE_DAYS;
  return addDaysToKey(paymentDate, days);
}

/** The student-facing URL for a link token. */
export function enrolmentLinkUrl(token: string, baseUrl?: string | null): string {
  const base = (baseUrl || DEFAULT_MARKETING_URL).replace(/\/+$/, '');
  return `${base}/en/enroll?token=${encodeURIComponent(token)}`;
}

export interface EnrolmentShareInput {
  studentName: string;
  url: string;
  finalFee: number;
  amountPaid: number;
  scheme: FeePlanKind;
  balanceDueDate?: string | null;
  expiresAt?: string | null;
}

/** One line per fact, for the plan summary in the drawer, email and WhatsApp. */
export function enrolmentPlanLines(input: Pick<EnrolmentShareInput, 'finalFee' | 'amountPaid' | 'scheme' | 'balanceDueDate'>): string[] {
  const balance = Math.max(0, input.finalFee - input.amountPaid);
  const lines = [`Course fee: ${formatRupees(input.finalFee)}`, `Paid: ${formatRupees(input.amountPaid)}`];
  if (input.scheme === 'installment' && balance > 0) {
    lines.push(
      input.balanceDueDate
        ? `Balance: ${formatRupees(balance)}, due by ${formatDueDate(input.balanceDueDate)}`
        : `Balance: ${formatRupees(balance)}`,
    );
  }
  return lines;
}

/** The message staff send on WhatsApp (plain text, WhatsApp bold markers). */
export function enrolmentShareMessage(input: EnrolmentShareInput): string {
  const first = input.studentName.trim().split(/\s+/)[0] || 'there';
  const expiry = input.expiresAt ? formatDueDate(input.expiresAt.slice(0, 10)) : null;
  return [
    `Hi ${first}, welcome to Neram Classes.`,
    '',
    'Please complete your enrolment using this link:',
    input.url,
    '',
    ...enrolmentPlanLines(input).map((l) => `*${l.split(':')[0]}:*${l.slice(l.indexOf(':') + 1)}`),
    '',
    expiry ? `The link works until ${expiry}.` : 'The link works for 7 days.',
    'Reply here if you need any help.',
  ].join('\n');
}
