/**
 * Why a student has not done the work set before a class.
 *
 * A deliberately different vocabulary from RSVP_REASON_CODES. "Family
 * commitment" and "exam clash" answer why someone is not COMING; they say
 * nothing about why the work is not done. The codes worth collecting here are
 * the ones a teacher can act on: not understanding the task and not being able
 * to open the file are both fixable in about a minute, and neither is visible
 * from a blank submission list.
 *
 * Pure TypeScript so the API route, the reason sheet and the teacher roster all
 * agree. To add a code, widen BOTH this array and the CHECK constraint in
 * supabase/migrations/20260729110000_nexus_prework.sql.
 */

export const PREWORK_REASON_CODES = [
  'not_understood',
  'no_time',
  'materials',
  'unwell',
  'other',
] as const;

export type PreworkReasonCode = (typeof PREWORK_REASON_CODES)[number];

export interface PreworkReason {
  code: PreworkReasonCode;
  /** Shown on the row the student taps. First person, their words. */
  label: string;
  /** Compact form for the teacher's roster tag. */
  shortLabel: string;
  /** Free text is required for this code (nothing else is specific enough). */
  requiresNote: boolean;
}

export const PREWORK_REASONS: PreworkReason[] = [
  { code: 'not_understood', label: 'I did not understand the task', shortLabel: 'Stuck', requiresNote: false },
  { code: 'no_time', label: 'I ran out of time', shortLabel: 'No time', requiresNote: false },
  { code: 'materials', label: 'I could not open or print the file', shortLabel: 'Blocked', requiresNote: false },
  { code: 'unwell', label: 'I was unwell', shortLabel: 'Unwell', requiresNote: false },
  { code: 'other', label: 'Something else', shortLabel: 'Other', requiresNote: true },
];

const BY_CODE = new Map<string, PreworkReason>(PREWORK_REASONS.map((r) => [r.code, r]));

export function isPreworkReasonCode(value: unknown): value is PreworkReasonCode {
  return typeof value === 'string' && BY_CODE.has(value);
}

export function preworkReasonRequiresNote(code: unknown): boolean {
  return isPreworkReasonCode(code) ? BY_CODE.get(code)!.requiresNote : false;
}

/**
 * How a reason reads back to a teacher or to the student themselves.
 *
 * Prefers the note when there is one, because "the printer at home is broken"
 * says more than "Blocked". Falls back to the code's label, then to a neutral
 * string so a row written before a code existed still renders.
 */
export function describePreworkReason(
  code: string | null | undefined,
  note: string | null | undefined,
): string {
  const trimmed = note?.trim();
  if (trimmed) return trimmed;
  if (isPreworkReasonCode(code)) return BY_CODE.get(code)!.label;
  return 'No reason given';
}

/** Just the category, for grouping and tags. Never the free text. */
export function preworkReasonShortLabel(code: string | null | undefined): string {
  return isPreworkReasonCode(code) ? BY_CODE.get(code)!.shortLabel : 'Other';
}

/**
 * Count reasons per code, for the teacher's breakdown.
 * Unknown or missing codes fold into 'other' so the totals always add up.
 */
export function tallyPreworkReasons(
  rows: { reason_code?: string | null }[],
): Record<PreworkReasonCode, number> {
  const out = {
    not_understood: 0,
    no_time: 0,
    materials: 0,
    unwell: 0,
    other: 0,
  } as Record<PreworkReasonCode, number>;
  for (const row of rows) {
    const code = isPreworkReasonCode(row.reason_code) ? row.reason_code : 'other';
    out[code] += 1;
  }
  return out;
}

/**
 * The single most common reason in a set, phrased for the teacher's queue row
 * ("Mostly: ran out of time"). Returns null when there is nothing to report.
 */
export function dominantPreworkReason(rows: { reason_code?: string | null }[]): string | null {
  if (!rows.length) return null;
  const tally = tallyPreworkReasons(rows);
  let best: PreworkReasonCode | null = null;
  for (const code of PREWORK_REASON_CODES) {
    if (tally[code] > 0 && (best === null || tally[code] > tally[best])) best = code;
  }
  if (!best) return null;
  return BY_CODE.get(best)!.label.replace(/^I /, '').toLowerCase();
}
