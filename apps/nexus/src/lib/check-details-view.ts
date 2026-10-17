/**
 * The words and small decisions on the student's "Check your details" page.
 * PURE and client safe, so the copy and the report form's checks are unit
 * tested. The server validates the report again with validateCorrection.
 */
import {
  daysUntil,
  validateCorrection,
  CORRECTION_NOTE_MAX,
  type FeeView,
} from '@neram/database/fee-plan';

export { CORRECTION_NOTE_MAX };

/** What GET /api/student/record-check returns. */
export interface RecordCheckPage {
  check: {
    id: string;
    status: string;
    sentAt: string | null;
    openedAt: string | null;
    confirmedAt: string | null;
  } | null;
  fees:
    | (FeeView & {
        openReport: { note: string; items: ReportedItem[]; createdAt: string } | null;
        lastAnswer: { status: string; note: string | null; at: string | null } | null;
      })
    | null;
}

export interface ReportedItem {
  amount: number;
  paidOn: string;
  method: string;
  reference?: string | null;
}

/** Statuses where the page asks for an answer (All correct or Something is wrong). */
export const ASKING = new Set(['queued', 'sent', 'opened', 'changed']);

/** "16 Oct", in India, for "you confirmed on". */
export function shortIstDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function planLabel(plan: FeeView['plan']): string {
  if (plan === 'full') return 'Paid in full';
  if (plan === 'installment') return 'Two installments';
  return 'Not set yet';
}

export type ChipTone = 'success' | 'warning' | 'error' | 'default' | 'info';

/** The chip next to an installment. Words, never colour alone. */
export function installmentChip(
  inst: { settled: boolean; waived: boolean; dueDate: string },
  now: Date = new Date(),
): { label: string; tone: ChipTone } {
  if (inst.waived) return { label: 'Not needed', tone: 'default' };
  if (inst.settled) return { label: 'Paid', tone: 'success' };
  const d = daysUntil(inst.dueDate, now);
  // The due date itself is printed beside the chip, so the chip says the state.
  if (d < 0) return { label: 'Overdue', tone: 'error' };
  if (d === 0) return { label: 'Due today', tone: 'warning' };
  if (d <= 3) return { label: `Due in ${d} day${d === 1 ? '' : 's'}`, tone: 'warning' };
  return { label: 'Not paid yet', tone: 'info' };
}

/** The banner at the top of the page, by state. null shows none. */
export function statusBanner(page: RecordCheckPage): { tone: 'success' | 'info' | 'warning'; text: string } | null {
  const check = page.check;
  if (!check) return null;
  if (check.status === 'confirmed') {
    const on = shortIstDate(check.confirmedAt);
    return { tone: 'success', text: on ? `Thanks, you confirmed on ${on}.` : 'Thanks, you confirmed your fees.' };
  }
  if (check.status === 'correction_reported') {
    return { tone: 'info', text: 'Sent to the office. We will tell you when it is checked.' };
  }
  if (check.status === 'changed') {
    return { tone: 'warning', text: 'The office updated your fees. Please check them again.' };
  }
  const answer = page.fees?.lastAnswer;
  if (answer && answer.status === 'rejected') {
    const note = (answer.note || '').trim();
    return {
      tone: 'info',
      text: `The office checked what you reported and kept your fees as they are.${note ? ` Their note: "${note}"` : ''}`,
    };
  }
  return null;
}

// ─── the "Something is wrong" form ───────────────────────────────────────────

export interface CorrectionRowInput {
  key: string;
  amount: string;
  paidOn: string;
  method: string;
}

export function newCorrectionRow(key: string): CorrectionRowInput {
  return { key, amount: '', paidOn: '', method: 'upi_direct' };
}

function isBlank(row: CorrectionRowInput): boolean {
  return !row.amount.trim() && !row.paidOn;
}

/** Errors to show next to one payment row, on blur. A blank row has none: it is skipped. */
export function correctionRowErrors(
  row: CorrectionRowInput,
  today: string,
): { amount?: string; paidOn?: string } {
  if (isBlank(row)) return {};
  const out: { amount?: string; paidOn?: string } = {};
  const amount = Number(row.amount.replace(/[,\s₹]/g, ''));
  if (!row.amount.trim() || !Number.isFinite(amount) || amount <= 0) out.amount = 'Enter the amount you paid.';
  if (!row.paidOn) out.paidOn = 'Choose the day you paid.';
  else if (row.paidOn > today) out.paidOn = 'This date is in the future.';
  return out;
}

/**
 * The body to POST, checked with the same rule the server uses. Blank rows are
 * dropped; a reference typed once applies to the whole report and rides on the
 * first payment row, which is where the office reads it.
 */
export function buildCorrectionReport(
  input: { rows: CorrectionRowInput[]; reference: string; note: string },
  today: string,
): { ok: true; body: { items: ReportedItem[]; note: string } } | { ok: false; error: string } {
  const filled = input.rows.filter((r) => !isBlank(r));
  const reference = input.reference.trim();
  const items = filled.map((r, i) => ({
    amount: Number(r.amount.replace(/[,\s₹]/g, '')),
    paidOn: r.paidOn,
    method: r.method,
    reference: i === 0 && reference ? reference : null,
  }));
  const note = reference && !filled.length ? `${input.note.trim()} (Reference: ${reference})` : input.note;
  const checked = validateCorrection({ items, note }, today);
  if (!checked.ok) return checked;
  return { ok: true, body: { items: checked.items, note: checked.note } };
}
