/**
 * Which brief a drawing was set to, as a `category.sub_type` key.
 *
 * Only the fifth rubric criterion depends on this, so getting it late or
 * changing it later costs at most one score.
 *
 * Precedence matches resolveBriefType in drawing-eval/brief-context.ts: the
 * practice question's own brief, then the brief the assignment was tagged
 * with. `sub_type = 'assignment'` is a marker, not a brief dimension, so an
 * untagged assignment drawing correctly resolves to nothing and gets the
 * shared four criteria.
 *
 * Every lookup tolerates a missing table or column and answers null, so
 * scoring still works in an environment without the evaluation migrations.
 */

export async function briefKeyForSubmission(
  supabase: any,
  submission: { question_id?: string | null; assignment_id?: string | null },
): Promise<string | null> {
  try {
    if (submission.question_id) {
      const { data } = await supabase
        .from('drawing_questions')
        .select('category, sub_type')
        .eq('id', submission.question_id)
        .maybeSingle();
      if (data?.category && data?.sub_type && data.sub_type !== 'assignment') {
        return `${data.category}.${data.sub_type}`;
      }
    }
    if (submission.assignment_id) {
      const { data: assignment } = await supabase
        .from('nexus_class_assignments')
        .select('brief_type_id')
        .eq('id', submission.assignment_id)
        .maybeSingle();
      if (assignment?.brief_type_id) {
        const { data: brief } = await supabase
          .from('drawing_brief_type')
          .select('key')
          .eq('id', assignment.brief_type_id)
          .maybeSingle();
        if (brief?.key) return brief.key as string;
      }
    }
  } catch {
    // Unknown brief: the shared four.
  }
  return null;
}
