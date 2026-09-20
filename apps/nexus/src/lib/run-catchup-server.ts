/**
 * The I/O half of run-catchup.ts: load just enough to say who is behind.
 *
 * The results route gets this for free, because it already loads the whole
 * eligibility fact set to build the buckets. Everything else that needs the
 * same answer (the message route filling {classes}, the nightly chase) wants it
 * for a handful of named students, and reading the entire classroom's
 * attendance to answer that would be wasteful. So this reads two scoped
 * queries: the classes the run covers, and those students' rows on them.
 *
 * The covered-class lookup is the awkward part, and it is the same trap
 * exam-run-roster.ts was written to fix: an EXAM stores its covered classes in
 * nexus_exam_covered_classes, while a class test stores them in
 * nexus_test_run_covered_classes. Reading the wrong table does not error, it
 * finds nothing, and nothing here means "nobody is behind", which would quietly
 * turn the chase off.
 */

import {
  getExamByClass,
  listCoveredClasses,
  listRunCoveredClasses,
  loadAttendanceAndAbsences,
} from '@neram/database';
import { CLASSROOM_ANCHORED_CONTEXTS, CLASS_ANCHORED_CONTEXTS } from './test-run-scope';
import { buildRunCatchup, type RunCatchup } from './run-catchup';
import type { EligibilityCoveredClass } from './exam-eligibility-roster';

export interface CatchupPlacementLike {
  id: string;
  context_type: string | null;
  context_id: string | null;
}

/**
 * The classes a run depends on, with their titles, or [] when it depends on none.
 *
 * A classroom-anchored run (a practice pool, a paper assigned to the whole
 * class) is tied to no lecture, so there is nothing to be behind on and the
 * caller should say nothing rather than guess.
 */
export async function loadRunCoveredClasses(
  placement: CatchupPlacementLike,
  supabase: any,
): Promise<EligibilityCoveredClass[]> {
  const contextType = String(placement.context_type || '');
  const contextId = placement.context_id;
  if (!contextId) return [];
  if (CLASSROOM_ANCHORED_CONTEXTS.has(contextType)) return [];

  if (contextType === 'exam') {
    const exam = await getExamByClass(contextId, supabase);
    if (exam) {
      const covered = await listCoveredClasses((exam as any).id, supabase);
      if (covered.length > 0) return covered as EligibilityCoveredClass[];
    }
  }

  if (CLASS_ANCHORED_CONTEXTS.has(contextType)) {
    let ids: string[] = [];
    try {
      ids = await listRunCoveredClasses(placement.id, supabase);
    } catch {
      // The table has not reached this environment. The host class is still a
      // correct answer, so fall through to it rather than returning nothing.
    }
    if (ids.length === 0) ids = [contextId];
    return readClasses(ids, supabase);
  }

  return [];
}

async function readClasses(ids: string[], supabase: any): Promise<EligibilityCoveredClass[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, scheduled_date')
    .in('id', ids);
  if (error) throw error;
  return ((data || []) as any[]).map((c) => ({
    id: c.id,
    title: c.title ?? null,
    scheduled_date: c.scheduled_date,
  }));
}

/** Per student, whether the catch-up this run depends on is done. */
export async function loadRunCatchup(
  placement: CatchupPlacementLike,
  studentIds: string[],
  supabase: any,
  covered?: EligibilityCoveredClass[],
): Promise<Record<string, RunCatchup>> {
  if (studentIds.length === 0) return {};
  const coveredClasses = covered ?? (await loadRunCoveredClasses(placement, supabase));
  if (coveredClasses.length === 0) return {};

  const { attendance, absences } = await loadAttendanceAndAbsences(
    studentIds,
    coveredClasses.map((c) => c.id),
    supabase,
  );
  return buildRunCatchup({ studentIds, coveredClasses, attendance, absences });
}
