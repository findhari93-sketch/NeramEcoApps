/**
 * Which brief a drawing was set to, as a `category.sub_type` key.
 *
 * Only the fifth rubric criterion depends on this, so getting it late or
 * changing it later costs at most one score.
 *
 * Read straight off the backing question rather than through the brief-type
 * table, so scoring works in an environment where the evaluation tables were
 * never migrated. `sub_type = 'assignment'` is a marker, not a brief dimension,
 * which is why most assignment drawings correctly resolve to nothing and get
 * the shared four criteria.
 */

export async function briefKeyForSubmission(
  supabase: any,
  submission: { question_id?: string | null; assignment_id?: string | null },
): Promise<string | null> {
  if (!submission.question_id) return null;
  const { data } = await supabase
    .from('drawing_questions')
    .select('category, sub_type')
    .eq('id', submission.question_id)
    .maybeSingle();
  if (!data?.category || !data?.sub_type || data.sub_type === 'assignment') return null;
  return `${data.category}.${data.sub_type}`;
}
