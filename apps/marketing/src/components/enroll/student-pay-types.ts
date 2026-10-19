import type { StudentPayOffer, PaymentPayee } from '@neram/database/student-pay';

export type { StudentPayOffer, PaymentPayee };

/** What /api/enroll/validate adds for a student-pays link. */
export interface StudentPayLinkData {
  paymentMode: 'student_pays';
  offer: StudentPayOffer & { balanceDueDays: number };
  payee: PaymentPayee;
  /** "NRM 4F2A9C": the note the student adds to the payment. */
  paymentNote: string;
  /** Set when staff could not match the last payment. */
  rejectionReason: string | null;
  prefill: {
    email: string | null;
    city: string | null;
    fatherName: string | null;
    parentPhone: string | null;
    currentClass: string | null;
    targetExamYear: string | null;
  } | null;
}

/** A payment the student submitted, waiting for staff. */
export interface PaymentSubmission {
  amount: number;
  scheme: 'full' | 'installment' | null;
  method: 'upi_direct' | 'bank_transfer' | null;
  /** Full UTR right after submitting; the last 4 digits when revisiting. */
  utr?: string | null;
  utrTail?: string | null;
  paidOn: string | null;
  balance: number | null;
  balanceDueDate: string | null;
  emailedTo?: string | null;
}

export const rupees = (n: number | null | undefined) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export function formatDay(dateKey: string | null | undefined): string {
  if (!dateKey) return '';
  return new Date(`${dateKey.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Today in India, YYYY-MM-DD. */
export function istTodayKey(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}
