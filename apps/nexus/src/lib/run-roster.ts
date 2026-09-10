/**
 * Who a run is for, as a set of user ids.
 *
 * Every group action on the results tab (reopen these students, message these
 * students) has to intersect the ids the browser sent with the people the run
 * actually covers. A staff-only route is still not a reason to trust an id: the
 * rule everywhere in this codebase is that an explicit list NARROWS the roster
 * and never widens it, and this is the function that makes that cheap enough to
 * do on every call.
 *
 * The awkward part is nexus_test_placements.context_id, which is polymorphic
 * with NO foreign key. Reading it as the wrong kind of id does not error, it
 * quietly finds nothing, and "nothing" here means "nobody was on the roster, so
 * nobody got their window". resolveRunClassroom is therefore the only place that
 * interprets it, sitting on top of the pure sets in test-run-scope.ts.
 */

import { CLASSROOM_ANCHORED_CONTEXTS, CLASS_ANCHORED_CONTEXTS } from './test-run-scope';

export interface RunPlacementLike {
  context_type: string | null;
  context_id: string | null;
  test_id?: string | null;
}

/**
 * The classroom behind a run, or null when the run has no roster at all.
 *
 * A classroom-anchored context stores a nexus_classrooms id directly. A
 * class-anchored one stores a nexus_scheduled_classes id, and the classroom has
 * to be read off that class. Every other context (a chapter test, a recap
 * checkpoint, a practice pool with no classroom) genuinely has no roster, and
 * saying so is better than returning an empty set that reads as "nobody".
 */
export async function resolveRunClassroom(
  placement: RunPlacementLike,
  supabase: any,
): Promise<string | null> {
  const contextType = String(placement.context_type || '');
  const contextId = placement.context_id;
  if (!contextId) return null;

  if (CLASSROOM_ANCHORED_CONTEXTS.has(contextType)) return contextId;

  if (CLASS_ANCHORED_CONTEXTS.has(contextType)) {
    const { data } = await supabase
      .from('nexus_scheduled_classes')
      .select('classroom_id')
      .eq('id', contextId)
      .maybeSingle();
    return (data as any)?.classroom_id ?? null;
  }

  return null;
}

/**
 * The active student roster of a run, as a set of user ids.
 *
 * Returns null (not an empty set) when the run has no roster, so a caller can
 * refuse the action outright rather than reporting that it reached nobody.
 */
export async function resolveRunRoster(
  placement: RunPlacementLike,
  supabase: any,
): Promise<Set<string> | null> {
  const classroomId = await resolveRunClassroom(placement, supabase);
  if (!classroomId) return null;

  const { data } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);

  return new Set(((data || []) as any[]).map((e) => e.user_id as string));
}

/**
 * Keep only the ids that are on the roster.
 *
 * Pure, so the narrowing rule can be tested without a database. Order follows
 * the caller's list, which is the order the teacher selected them in.
 */
export function narrowToRoster(requested: string[], roster: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of requested) {
    if (!roster.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
