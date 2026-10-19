/**
 * Words for Collections' "Payments to verify" (balance payments a student sent
 * from the pay balance page). Pure, so the copy staff read after a decision is
 * unit tested. No em dashes: this is user-visible copy.
 */
import { formatRupees } from '@neram/database/fee-plan';

export interface FeeClaimSummary {
  id: string;
  userId: string;
  studentName: string | null;
  studentPhone: string | null;
  studentEmail: string | null;
  amount: number;
  method: 'upi_direct' | 'bank_transfer' | string | null;
  utr: string | null;
  paidOn: string | null;
  status: 'pending' | 'verified' | 'rejected' | string;
  installmentNumber: number | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
}

export interface FeeClaimDetail extends FeeClaimSummary {
  proofUrl: string | null;
  fee: {
    agreed: number | null;
    paidTotal: number;
    balance: number | null;
    nextDue: number | null;
    dueDate: string | null;
  } | null;
}

function first(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || 'The student';
}

/** "Installment 2", or "Balance payment" when the claim is not tied to one. */
export function claimInstallmentLabel(n: number | null | undefined): string {
  return n && n > 0 ? `Installment ${n}` : 'Balance payment';
}

/** "5 min ago", "3 h ago", "2 days ago": how long the student has been waiting. */
export function submittedAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** What is left after this payment, never below zero. Null when no fee is set. */
export function balanceAfterClaim(balance: number | null | undefined, amount: number): number | null {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return null;
  return Math.max(0, Math.round((balance - amount) * 100) / 100);
}

/** The line staff see after Verify. */
export function verifiedMessage(result: {
  receiptNumber?: string | null;
  emailedTo?: string | null;
  balanceAfter?: number | null;
}): string {
  const receipt = result.receiptNumber ? `Receipt ${result.receiptNumber}` : 'The receipt';
  const sent = result.emailedTo
    ? `${receipt} emailed to ${result.emailedTo}.`
    : `${receipt} was not emailed because there is no email on file.`;
  const left =
    result.balanceAfter === null || result.balanceAfter === undefined
      ? ''
      : result.balanceAfter <= 0.01
        ? ' Fully paid now.'
        : ` Balance left ${formatRupees(result.balanceAfter)}.`;
  return `Recorded. ${sent}${left}`;
}

/** The line staff see after Reject. */
export function rejectedMessage(studentName: string | null | undefined, emailedTo: string | null | undefined): string {
  const name = first(studentName);
  return emailedTo
    ? `Payment rejected. ${name} was emailed the reason and can submit the payment again.`
    : `Payment rejected. There is no email on file, so tell ${name} the reason yourself. They can submit the payment again.`;
}
