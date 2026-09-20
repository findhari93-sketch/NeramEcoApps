/**
 * Has this student done the catch-up the test in front of them depends on?
 *
 * The Students tab could say who had not sat a paper but never why. On the
 * 18 Aug exam that left ten students under "Joined after this class" with no
 * way to tell the five who still owed two classes of catch-up from the four
 * nobody has any record for, and a teacher chasing them had to open each
 * student's catch-up page one at a time.
 *
 * THE DECISION IS NOT MADE HERE. It is delegated to decideCatchupGate, the same
 * function api/tests/attempt enforces at the door, so the chip on the row and
 * the 403 a student meets can never drift apart. This module only turns the
 * batched roster facts into that function's evidence shape and names the result.
 *
 * PURE, and deliberately free: every input is already loaded by the results
 * route for the eligibility roster, so the whole feature costs no extra query.
 */

import { decideCatchupGate, type GateClassEvidence } from './catchup-test-gate';
import type { EligibilityAbsenceFacts, EligibilityCoveredClass } from './exam-eligibility-roster';

/**
 * attended    present for every class this run covers. Nothing to say.
 * caught_up   missed something and has since cleared or been excused from it.
 * behind      an absence that is neither caught up nor excused. The door is shut.
 * unknown     no attendance row and no absence row. A data gap, not a clean sheet.
 */
export type RunCatchupState = 'attended' | 'caught_up' | 'behind' | 'unknown';

export interface RunCatchup {
  state: RunCatchupState;
  /** The classes standing in the way, oldest first. Empty unless behind. */
  outstanding: Array<{ id: string; title: string | null; date: string }>;
}

export interface BuildRunCatchupInput {
  studentIds: string[];
  coveredClasses: EligibilityCoveredClass[];
  /** student_id -> class_id -> attended. A missing entry is a gap, not an absence. */
  attendance: Map<string, Map<string, boolean>>;
  /** student_id -> class_id -> the nexus_class_absences facts. */
  absences: Map<string, Map<string, EligibilityAbsenceFacts>>;
}

/**
 * PURE. One catch-up state per student, for the classes this run covers.
 *
 * Returns {} when the run covers no class. A practice pool or a paper assigned
 * to the whole classroom depends on no particular lecture, so there is nothing
 * true to say and the row should stay quiet rather than invent a verdict.
 */
export function buildRunCatchup(input: BuildRunCatchupInput): Record<string, RunCatchup> {
  const covered = input.coveredClasses || [];
  if (covered.length === 0) return {};

  const out: Record<string, RunCatchup> = {};
  for (const studentId of input.studentIds || []) {
    const attendance = input.attendance?.get(studentId) ?? null;
    const absences = input.absences?.get(studentId) ?? null;

    const evidence: GateClassEvidence[] = covered.map((c) => ({
      scheduled_class_id: c.id,
      title: c.title,
      scheduled_date: c.scheduled_date,
      attended: attendance?.has(c.id) ? Boolean(attendance.get(c.id)) : null,
      absence: absences?.get(c.id) ?? null,
    }));

    const gate = decideCatchupGate(evidence);
    if (gate.blocked) {
      out[studentId] = { state: 'behind', outstanding: gate.outstanding };
      continue;
    }

    // Order matters. A student who missed a class and cleared it has done
    // something worth saying, so that wins over the classes they simply
    // attended. Only when there is no evidence either way is it a gap.
    const resolved = evidence.some((e) => e.absence && (e.absence.caught_up_at || e.absence.excused_at));
    if (resolved) {
      out[studentId] = { state: 'caught_up', outstanding: [] };
      continue;
    }

    const allPresent = evidence.every((e) => e.attended === true);
    out[studentId] = { state: allPresent ? 'attended' : 'unknown', outstanding: [] };
  }
  return out;
}

/** One line for a row, or null when there is nothing worth saying. */
export function describeRunCatchup(catchup: RunCatchup | null | undefined): string | null {
  if (!catchup) return null;
  switch (catchup.state) {
    case 'behind': {
      const n = catchup.outstanding.length;
      return `${n} ${n === 1 ? 'class' : 'classes'} still to catch up`;
    }
    case 'caught_up':
      return 'Caught up on this test\u2019s classes';
    case 'unknown':
      return 'No record of these classes';
    default:
      return null;
  }
}

/** "Indian Architectural Heritage (12 Aug), Indo-Aryan Temple Architecture (14 Aug)" */
export function outstandingClassNames(
  outstanding: Array<{ title: string | null; date: string }>,
): string {
  return (outstanding || [])
    .map((o) => {
      const title = o.title?.trim() || 'Untitled class';
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) return title;
      const when = d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      });
      return `${title} (${when})`;
    })
    .join(', ');
}
