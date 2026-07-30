/**
 * The child's work, and how the class as a whole is doing on it.
 *
 * Shared by /api/parent/classes/[classId] (the work set on one class) and
 * /api/parent/assignments (everything, bucketed). One implementation, because
 * two would eventually disagree about whether a redo counts as outstanding, and
 * a parent comparing the class sheet against the Work tab would find the same
 * assignment in two different states.
 *
 * Everything about "did my child do it" comes from listAssignmentsForStudent and
 * buildParentAssignmentViews. Everything about "how is the class doing" comes
 * from loadClassroomRoster and parent-aggregate. Neither is reimplemented here;
 * this module is the join between them.
 */

import {
  getSupabaseAdminClient,
  listAssignmentsForStudent,
  loadClassroomRoster,
} from '@neram/database';
import { buildParentAssignmentViews, summariseAssignments } from '@/lib/parent-assignments';
import {
  eligibleAtDate,
  buildAnonymousAggregate,
  type AnonymousAggregate,
} from '@/lib/parent-aggregate';
import type { ParentAssignmentDetail } from '@/lib/parent-view-types';

/** One assignment plus where it sits in the term. */
export interface ParentAssignmentListItem extends ParentAssignmentDetail {
  classId: string | null;
  classTitle: string | null;
  classDate: string;
}

export interface ParentWorkResult {
  items: ParentAssignmentListItem[];
  summary: ReturnType<typeof summariseAssignments>;
}

/**
 * Every published assignment for this child, with the class-wide totals.
 *
 * `only` narrows to a specific set, which is how the class sheet asks for just
 * the work set on one class without a second query path.
 */
export async function loadParentWork(
  studentId: string,
  classroomId: string,
  only?: string[]
): Promise<ParentWorkResult> {
  const all = (await listAssignmentsForStudent(studentId, classroomId).catch(
    () => []
  )) as any[];

  const wanted = only ? new Set(only) : null;
  const mine = wanted ? all.filter((a) => wanted.has(a.id)) : all;

  if (!mine.length) {
    return { items: [], summary: summariseAssignments([]) };
  }

  const views = buildParentAssignmentViews(mine as never[]);
  const aggregates = await loadAssignmentAggregates(classroomId, mine);

  const items: ParentAssignmentListItem[] = views.map((v, i) => {
    // buildParentAssignmentViews preserves input order, so index alignment holds.
    // Guard anyway rather than trusting it: a mismatched pairing would show one
    // assignment's marks under another's title.
    const src = mine[i]?.id === v.id ? mine[i] : mine.find((m) => m.id === v.id);
    return {
      id: v.id,
      title: v.title,
      timing: src?.timing ?? null,
      assignmentType: src?.assignment_type ?? null,
      instructions: src?.instructions ?? null,
      dueOn: v.dueOn,
      bucket: v.bucket,
      isOverdue: v.isOverdue,
      attempt: v.attempt,
      evaluationType: v.evaluationType,
      score: v.score,
      maxScore: v.maxScore,
      feedback: v.feedback,
      reviewedAt: v.reviewedAt,
      submittedAt: v.submittedAt,
      aggregate: aggregates.get(v.id) ?? null,
      classId: src?.scheduled_class_id ?? null,
      classTitle: src?.class_title ?? null,
      classDate: v.classDate,
    };
  });

  return { items, summary: summariseAssignments(views) };
}

/**
 * "18 of 24 have submitted", per assignment, with no names ever.
 *
 * One roster read plus two set-based submission reads for the whole page,
 * regardless of how many assignments there are. A query per assignment is
 * exactly the cost pattern the Vercel rules exist to prevent.
 *
 * The denominator is loadClassroomRoster, the same helper the teacher's own
 * submission counts use, so the two screens can never report different totals
 * for the same assignment. See lib/parent-aggregate.ts for why dormant students
 * are excluded on both sides and why nothing is published below five.
 */
export async function loadAssignmentAggregates(
  classroomId: string,
  assignments: { id: string; class_date: string }[]
): Promise<Map<string, AnonymousAggregate | null>> {
  const out = new Map<string, AnonymousAggregate | null>();
  if (!assignments.length) return out;

  const supabase = getSupabaseAdminClient();
  const ids = assignments.map((a) => a.id);

  // Both submission tables are absent from database.generated.ts, so the chained
  // filters blow the type instantiation depth. Documented `as any` pattern, same
  // as nexus_class_absences in lib/parent-data.ts.
  const [roster, docs, draws] = await Promise.all([
    loadClassroomRoster(classroomId).catch(() => null),
    (async (): Promise<{ assignment_id: string; student_id: string }[]> => {
      const { data } = await (supabase.from('nexus_assignment_submissions' as any) as any)
        .select('assignment_id, student_id')
        .in('assignment_id', ids);
      return (data || []) as { assignment_id: string; student_id: string }[];
    })(),
    (async (): Promise<{ assignment_id: string; student_id: string }[]> => {
      const { data } = await (supabase.from('drawing_submissions' as any) as any)
        .select('assignment_id, student_id')
        .in('assignment_id', ids);
      return (data || []) as { assignment_id: string; student_id: string }[];
    })(),
  ]);

  // No roster means no honest denominator. Emitting nothing is correct: the UI
  // renders the "not shown for small groups" line, which is vague but true,
  // rather than a total we cannot stand behind.
  if (!roster) {
    for (const a of assignments) out.set(a.id, null);
    return out;
  }

  const submittersByAssignment = new Map<string, Set<string>>();
  for (const row of [...docs, ...draws]) {
    if (!row.assignment_id || !row.student_id) continue;
    const set = submittersByAssignment.get(row.assignment_id) || new Set<string>();
    set.add(row.student_id);
    submittersByAssignment.set(row.assignment_id, set);
  }

  for (const a of assignments) {
    out.set(
      a.id,
      buildAnonymousAggregate({
        // Narrowed per assignment in JS: the eligibility date differs per
        // assignment, so passing asOf to the roster query would mean one query
        // each. Same IST boundary literal either way, so the two agree exactly.
        eligibleIds: eligibleAtDate(roster.members, a.class_date),
        submitterIds: submittersByAssignment.get(a.id) || new Set<string>(),
      })
    );
  }

  return out;
}
