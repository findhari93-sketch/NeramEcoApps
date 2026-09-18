/**
 * What each student said about a run they did not sit, for the teacher's row.
 *
 * PURE. The results route reads nexus_test_skip_reasons for the paper and the
 * run's live access requests; this decides what each row shows.
 *
 * Why it exists. On the 18 Aug exam a teacher looking at twenty students under
 * Not done had no way to learn why from the product: the student's "Tell your
 * teacher why" answer was stored and never shown there, and the note a student
 * typed when asking to reopen surfaced only as "asked to reopen".
 */

import { isTestReasonCode, testReasonLabel, testReasonShortLabel } from './test-reasons';

export interface SkipReasonRow {
  student_id: string;
  placement_id: string | null;
  reason_code: string | null;
  reason_note: string | null;
  updated_at: string | null;
}

export interface RowReason {
  code: string;
  /** The compact tag on the row: "Didn't know". */
  short_label: string;
  /** The student's own sentence, in missed-test wording. */
  label: string;
  note: string | null;
  at: string | null;
  /** False when it was given against the paper rather than this run. */
  for_this_run: boolean;
}

/**
 * One reason per student. This run's own reason wins; a reason with no
 * placement (given against the paper) is the fallback; a reason about another
 * run of the same paper is ignored, because it answers a different question.
 */
export function pickRunReasons(rows: readonly SkipReasonRow[], placementId: string): Map<string, RowReason> {
  const out = new Map<string, RowReason>();
  for (const r of rows) {
    if (!isTestReasonCode(r.reason_code)) continue;
    const forThisRun = r.placement_id === placementId;
    if (!forThisRun && r.placement_id != null) continue;

    const current = out.get(r.student_id);
    if (current) {
      if (current.for_this_run && !forThisRun) continue;
      if (current.for_this_run === forThisRun && (current.at ?? '') >= (r.updated_at ?? '')) continue;
    }

    out.set(r.student_id, {
      code: r.reason_code,
      short_label: testReasonShortLabel(r.reason_code),
      label: testReasonLabel(r.reason_code, 'missed'),
      note: r.reason_note?.trim() || null,
      at: r.updated_at ?? null,
      for_this_run: forThisRun,
    });
  }
  return out;
}

/** student_id -> what they wrote when asking to reopen, when they wrote anything. */
export function requestNotesByStudent(
  access: ReadonlyArray<{ student_id: string; status: string; student_note?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of access) {
    const note = a.student_note?.trim();
    if (note) out[a.student_id] = note;
  }
  return out;
}
