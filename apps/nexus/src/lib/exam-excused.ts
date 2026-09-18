/**
 * The students an exam was never set for, set aside before results are published.
 *
 * WHY. On the 18 Aug exam, publishing would have bucketed every student who
 * enrolled after the covered classes as `absent` (no paper, no open window),
 * written each of them an absent row in nexus_exam_results, and privately told
 * them "You were marked absent because no attempt was recorded". The eligibility
 * engine (exam-eligibility-roster.ts) already said they were excused; publishing
 * simply never asked it.
 *
 * THE INVARIANT HOLDS BY EXCLUSION. The two-sittings spec says every roster
 * student lands in exactly one of exam_day, second_sitting, still_to_sit and
 * absent. An excused student with no paper and no open window is not in the
 * publish roster at all, so they are in none of the four, get no snapshot row,
 * are never ranked and are never messaged. Anyone excused who DID sit it, or who
 * holds an open window, stays exactly where getExamResults put them: sitting a
 * paper is its own answer, whatever the bucket said beforehand.
 *
 * PURE. The publish route loads the facts, the same way the dormant filter
 * beside it works.
 */

import type { ExamBucket } from '@neram/database';
import type { EligibilityBucket } from './exam-eligibility-roster';

export type ExcusedReason = 'new_joiner' | 'catching_up' | 'by_teacher';

export interface ExcusedSummary {
  total: number;
  new_joiner: number;
  catching_up: number;
  by_teacher: number;
}

/** student_id -> why they are excused, for every student the engine does not require. */
export function excusedReasons(
  rows: ReadonlyArray<{ student_id: string; bucket: EligibilityBucket; is_mandatory: boolean }>,
): Map<string, ExcusedReason> {
  const out = new Map<string, ExcusedReason>();
  for (const r of rows) {
    if (r.is_mandatory) continue;
    out.set(
      r.student_id,
      r.bucket === 'excused_new_joiner'
        ? 'new_joiner'
        : r.bucket === 'teacher_override_excused'
          ? 'by_teacher'
          : 'catching_up',
    );
  }
  return out;
}

/**
 * Split the results rows. Only a row getExamResults bucketed `absent` can be set
 * aside: `absent` is exactly "no submitted paper and no open window".
 */
export function setAsideExcused<T extends { student_id: string; bucket: ExamBucket }>(
  rows: readonly T[],
  reasons: ReadonlyMap<string, ExcusedReason>,
): { kept: T[]; excused: Array<{ student_id: string; reason: ExcusedReason }> } {
  const kept: T[] = [];
  const excused: Array<{ student_id: string; reason: ExcusedReason }> = [];
  for (const r of rows) {
    const reason = reasons.get(r.student_id);
    if (reason && r.bucket === 'absent') excused.push({ student_id: r.student_id, reason });
    else kept.push(r);
  }
  return { kept, excused };
}

export function summariseExcused(
  excused: ReadonlyArray<{ student_id: string; reason: ExcusedReason }>,
): ExcusedSummary {
  const out: ExcusedSummary = { total: excused.length, new_joiner: 0, catching_up: 0, by_teacher: 0 };
  for (const e of excused) out[e.reason] += 1;
  return out;
}

/**
 * One line for the results sheet, so the teacher knows who is missing from the
 * counts and why. Null when nobody is set aside.
 */
export function describeExcused(s: ExcusedSummary): string | null {
  if (s.total === 0) return null;
  const is = (n: number) => (n === 1 ? 'is' : 'are');

  const kinds = [s.new_joiner, s.catching_up, s.by_teacher].filter((n) => n > 0).length;
  if (kinds === 1) {
    if (s.new_joiner > 0) {
      return `${s.new_joiner} joined after the covered classes and ${is(s.new_joiner)} not part of this exam.`;
    }
    if (s.catching_up > 0) {
      return `${s.catching_up} ${is(s.catching_up)} still catching up on the covered classes and not part of this exam yet.`;
    }
    return `${s.by_teacher} excused by you ${is(s.by_teacher)} not part of this exam.`;
  }

  const parts = [
    s.new_joiner > 0 ? `${s.new_joiner} joined after the covered classes` : null,
    s.catching_up > 0 ? `${s.catching_up} ${is(s.catching_up)} still catching up` : null,
    s.by_teacher > 0 ? `${s.by_teacher} excused by you` : null,
  ].filter(Boolean);
  return `${s.total} ${is(s.total)} not part of this exam: ${parts.join(', ')}.`;
}
