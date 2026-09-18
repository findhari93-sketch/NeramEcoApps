/**
 * Who an exam was set for, shaped for the test Students tab.
 *
 * THE SAME ENGINE AS THE INVIGILATION ROSTER. api/exams/[examId]/roster reads
 * the exam's own covered classes, its per-exam overrides and its make-ups, and
 * hands them to buildExamEligibilityRoster. The Students tab used to build an
 * exam run's roster from nexus_test_run_covered_classes instead, which only
 * class tests write, so for every exam the covered list was empty and
 * decideAutoBucket made the whole class mandatory. On the 18 Aug exam that put
 * students who enrolled on 31 Aug under "Missed the date" and counted them in
 * Not done, and it ignored both live make-ups.
 *
 * PURE. The results route does the batched reads (loadExamEligibilityFacts,
 * listExamMakeups, loadAccessRequestsForRun) and composes the answer here, so
 * the rule can be tested without a database and cannot grow a second copy.
 *
 * WINDOWS follow resolveExamWindowForStudent, the one function that decides an
 * exam window for one student: a granted reopen first, then a make-up that has
 * not been revoked. A make-up is shown only while it is live or still to come;
 * one that has closed says nothing a teacher can act on, and printing "open
 * until 27 Aug" under "Missed the date" reads as a contradiction.
 */

import { resolveExamWindowForStudent, type ExamMakeup } from '@neram/database';
import {
  buildExamEligibilityRoster,
  type BuildEligibilityRosterInput,
  type EligibilityBucket,
  type EligibilityOverride,
  type EligibilityStudent,
} from './exam-eligibility-roster';

export interface ExamRunRosterInput {
  exam: { opens_at: string; closes_at: string };
  facts: Omit<BuildEligibilityRosterInput, 'students'> & {
    students: Array<EligibilityStudent & { dormant?: boolean }>;
  };
  /**
   * Overrides stored on the RUN (nexus_test_run_eligibility_overrides). The
   * exam's own overrides win where both exist, because the exam screen is where
   * a teacher sets them.
   */
  runOverrides?: Map<string, EligibilityOverride>;
  makeups: Array<Pick<ExamMakeup, 'student_id' | 'opens_at' | 'closes_at' | 'revoked_at'>>;
  /** Live access requests on the exam's placement (pending and granted). */
  access: Array<{ student_id: string; status: string; opens_at: string | null; closes_at: string | null }>;
  now: number;
}

export interface ExamRunRosterMember {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  bucket: EligibilityBucket;
  is_mandatory: boolean;
}

export interface ExamRunRoster {
  roster: ExamRunRosterMember[];
  /** Paused students, kept on the roster only so an attempt they made is found. */
  pausedStudentIds: string[];
  /** student_id -> when their own window shuts. Absent means the shared window. */
  windowsByStudent: Record<string, string | null>;
  /** Which kind of window that is, so the row offers the right control. */
  windowSources: Record<string, 'reopen' | 'makeup'>;
  pendingRequestStudentIds: string[];
  /** The teacher's own words on an override, keyed by student. */
  overrideNotes: Record<string, string>;
}

export function buildExamRunRoster(input: ExamRunRosterInput): ExamRunRoster {
  const overrides = new Map<string, EligibilityOverride>([
    ...(input.runOverrides ?? new Map()),
    ...input.facts.overrides,
  ]);

  const rows = buildExamEligibilityRoster({
    students: input.facts.students,
    coveredClasses: input.facts.coveredClasses,
    attendance: input.facts.attendance,
    absences: input.facts.absences,
    overrides,
  });

  const makeupBy = new Map(input.makeups.map((m) => [m.student_id, m]));
  const grantBy = new Map<string, ExamRunRosterInput['access'][number]>();
  const pendingRequestStudentIds: string[] = [];
  for (const a of input.access) {
    if (a.status === 'granted') grantBy.set(a.student_id, a);
    else if (a.status === 'pending') pendingRequestStudentIds.push(a.student_id);
  }

  const windowsByStudent: Record<string, string | null> = {};
  const windowSources: Record<string, 'reopen' | 'makeup'> = {};
  const studentIds = new Set([...rows.map((r) => r.student_id), ...grantBy.keys(), ...makeupBy.keys()]);

  for (const id of studentIds) {
    const grant = grantBy.get(id) ?? null;
    const makeup = makeupBy.get(id) ?? null;
    const resolved = resolveExamWindowForStudent(input.exam, makeup as ExamMakeup | null, grant);
    if (resolved.is_reopen && grant) {
      // The grant's own end, unaltered: the tab has always shown it, expired or
      // not, so the teacher can see it and close it.
      windowsByStudent[id] = grant.closes_at;
      windowSources[id] = 'reopen';
    } else if (resolved.is_makeup) {
      const shuts = Date.parse(resolved.closes_at);
      if (!Number.isNaN(shuts) && shuts > input.now) {
        windowsByStudent[id] = resolved.closes_at;
        windowSources[id] = 'makeup';
      }
    }
  }

  const overrideNotes: Record<string, string> = {};
  for (const r of rows) {
    const note = r.override?.note?.trim();
    if (note) overrideNotes[r.student_id] = note;
  }

  return {
    roster: rows.map((r) => ({
      student_id: r.student_id,
      name: r.name,
      avatar_url: r.avatar_url,
      bucket: r.bucket,
      is_mandatory: r.is_mandatory,
    })),
    pausedStudentIds: input.facts.students.filter((s) => s.dormant).map((s) => s.student_id),
    windowsByStudent,
    windowSources,
    pendingRequestStudentIds,
    overrideNotes,
  };
}
