import { normalisePlanShape, type PlanShape } from './plan-shape';

/**
 * The teaching plans covering a date range, reduced to what the calendar needs.
 *
 * Served alongside the schedule rather than from a second endpoint, so paging
 * through weeks costs one request, not two. Both the student and staff timetable
 * routes call this, so they cannot disagree about what shape a week is.
 *
 * Untyped client: `class_bands` and `class_days` are newer than the generated
 * Database type, the same as the other recent Nexus columns.
 */
export async function loadPlanShapes(
  supabase: any,
  classroomIds: string[],
  start: string,
  end: string,
): Promise<PlanShape[]> {
  if (classroomIds.length === 0) return [];

  const { data, error } = await supabase
    .from('nexus_teaching_plans')
    .select('id, classroom_id, title, start_date, expected_end_date, class_bands, class_days, status')
    .in('classroom_id', classroomIds)
    .lte('start_date', end)
    // A plan with no end date runs open-ended and always qualifies, so the
    // upper bound has to tolerate NULL rather than filter it out.
    .or(`expected_end_date.gte.${start},expected_end_date.is.null`)
    .order('start_date', { ascending: true });

  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(normalisePlanShape);
}
