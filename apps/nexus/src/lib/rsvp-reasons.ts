/**
 * Why a student is not attending a class.
 *
 * Everyone is attending by default, so this list is only ever shown on the way
 * out. Keeping it a small closed set (rather than the free-text box it replaces)
 * is what lets the teacher dashboard answer "why do students miss classes"
 * instead of showing a column of untyped sentences.
 *
 * Pure TypeScript so the API route, the dialog and the dashboard all agree.
 * To add a code, widen BOTH this array and the CHECK constraint in
 * supabase/migrations/20260723090000_timetable_rsvp_defaults.sql.
 */

export const RSVP_REASON_CODES = ['unwell', 'family', 'clash', 'other'] as const;

export type RsvpReasonCode = (typeof RSVP_REASON_CODES)[number];

export interface RsvpReason {
  code: RsvpReasonCode;
  /** Shown on the radio row the student picks. */
  label: string;
  /** Compact form for the teacher's roster tag. */
  shortLabel: string;
  /** Free text is required for this code (nothing else is specific enough). */
  requiresNote: boolean;
}

export const RSVP_REASONS: RsvpReason[] = [
  { code: 'unwell', label: 'Feeling unwell', shortLabel: 'Unwell', requiresNote: false },
  { code: 'family', label: 'Family commitment', shortLabel: 'Family', requiresNote: false },
  { code: 'clash', label: 'School or exam clash', shortLabel: 'Exam clash', requiresNote: false },
  { code: 'other', label: 'Other reason', shortLabel: 'Other', requiresNote: true },
];

const BY_CODE = new Map<string, RsvpReason>(RSVP_REASONS.map((r) => [r.code, r]));

export function isRsvpReasonCode(value: unknown): value is RsvpReasonCode {
  return typeof value === 'string' && BY_CODE.has(value);
}

export function reasonRequiresNote(code: unknown): boolean {
  return isRsvpReasonCode(code) ? BY_CODE.get(code)!.requiresNote : false;
}

/**
 * How a reason reads back to a teacher or to the student themselves.
 *
 * Prefers the note when there is one, because "Hospital visit" says more than
 * "Family". Falls back to the code's label, then to a neutral string so a row
 * written before reason codes existed still renders.
 */
export function describeReason(
  code: string | null | undefined,
  note: string | null | undefined,
): string {
  const trimmed = note?.trim();
  if (trimmed) return trimmed;
  if (isRsvpReasonCode(code)) return BY_CODE.get(code)!.label;
  return 'No reason given';
}

/** Just the category, for grouping and tags. Never the free text. */
export function reasonShortLabel(code: string | null | undefined): string {
  return isRsvpReasonCode(code) ? BY_CODE.get(code)!.shortLabel : 'Other';
}

/**
 * Count opt-outs per reason code, for the teacher's breakdown.
 * Unknown or missing codes are folded into 'other' so the totals always add up.
 */
export function tallyReasons(
  rows: { reason_code?: string | null }[],
): Record<RsvpReasonCode, number> {
  const out = { unwell: 0, family: 0, clash: 0, other: 0 } as Record<RsvpReasonCode, number>;
  for (const row of rows) {
    const code = isRsvpReasonCode(row.reason_code) ? row.reason_code : 'other';
    out[code] += 1;
  }
  return out;
}
