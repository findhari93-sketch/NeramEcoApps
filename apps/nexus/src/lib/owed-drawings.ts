/**
 * Drawing work a teacher owes, for the nav badges.
 *
 * Assignment drawings count on Assignments, test drawings on Exams. Practice
 * (sketches, question bank, free practice) is optional to mark and never
 * counts: a badge a teacher is not obliged to clear is noise. A held review
 * keeps status 'submitted' so the student sees nothing, and it is finished
 * work, so it comes off too.
 */
import { heldSubmissionIds } from '@/lib/drawing-hold';

export async function countOwedDrawings(
  supabase: any,
  studentIds: string[],
): Promise<{ assignment: number; test: number }> {
  if (studentIds.length === 0) return { assignment: 0, test: 0 };
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, source_type, assignment_id')
    .eq('status', 'submitted')
    .in('student_id', studentIds);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; source_type: string | null; assignment_id: string | null }>;
  const owed = rows.filter((r) => r.source_type === 'exam' || !!r.assignment_id);
  const held = owed.length ? await heldSubmissionIds(supabase, owed.map((r) => r.id)) : new Set<string>();
  let assignment = 0;
  let test = 0;
  for (const r of owed) {
    if (held.has(r.id)) continue;
    if (r.source_type === 'exam') test += 1;
    else assignment += 1;
  }
  return { assignment, test };
}
