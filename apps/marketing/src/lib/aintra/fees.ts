/**
 * Neram course fees, the one source for Aintra.
 *
 * Used twice: the chat route writes these facts into the system prompt, and
 * FeeCards renders them when the model answers with [[fees]]. One list means
 * the card a student sees and the number the model reasons about can never
 * drift apart, which they did when the prompt carried its own markdown table.
 */

export interface CourseFee {
  /** Used in the directive: [[fees:1-year]]. */
  id: 'crash' | '1-year' | '2-year';
  name: string;
  months: number;
  /** One payment, in rupees. */
  fullPrice: number;
  /** Total when paid in installments, or null when the course is single-payment only. */
  installmentTotal: number | null;
}

export const COURSE_FEES: CourseFee[] = [
  { id: 'crash', name: 'Crash Course', months: 3, fullPrice: 15000, installmentTotal: null },
  { id: '1-year', name: '1-Year Program', months: 12, fullPrice: 25000, installmentTotal: 30000 },
  { id: '2-year', name: '2-Year Program', months: 24, fullPrice: 30000, installmentTotal: 35000 },
];

export const FEE_NOTES = {
  scholarship: 'Scholarships based on academic performance and family income',
  emi: 'EMI and installment options available',
  youtube: '₹50 off when you subscribe to our YouTube channel',
};

/** ₹25,000 style, Indian digit grouping. */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function feeById(id: string): CourseFee | undefined {
  return COURSE_FEES.find((f) => f.id === id);
}

/** What paying in full saves over installments, or null when there is no choice. */
export function fullPaymentSaving(fee: CourseFee): number | null {
  if (fee.installmentTotal == null) return null;
  const saving = fee.installmentTotal - fee.fullPrice;
  return saving > 0 ? saving : null;
}

/**
 * The fee facts as the model reads them. Plain lines rather than a table: the
 * model copied the table verbatim, and the widget could not draw it.
 */
export function feesPromptText(): string {
  const lines = COURSE_FEES.map((f) => {
    const installments =
      f.installmentTotal == null
        ? 'single payment only, no installments'
        : `${formatRupees(f.installmentTotal)} in total if paid in installments`;
    return `- ${f.name} (id ${f.id}): ${f.months} months. ${formatRupees(f.fullPrice)} paid in one payment; ${installments}.`;
  });
  return [
    ...lines,
    `- ${FEE_NOTES.scholarship}.`,
    `- ${FEE_NOTES.emi}.`,
    `- YouTube subscription reward: ${FEE_NOTES.youtube}.`,
  ].join('\n');
}
