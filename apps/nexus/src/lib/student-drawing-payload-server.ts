/**
 * The database half of student-drawing-payload: which attempts are held, and
 * the final rubric bands for the ones handed back.
 *
 * Both tolerate an environment without the evaluation tables. Nothing held and
 * no rubric is the honest answer there, and it is what the page already shows.
 */
import { criteriaForBrief, type Band, type BandMap } from './drawing-rubric';
import { briefKeyForSubmission } from './drawing-brief-resolve';
import { buildStudentRubric, type ManualEvaluationLite, type StudentRubric } from './student-drawing-payload';

export async function loadManualEvaluations(supabase: any, submissionIds: string[]): Promise<ManualEvaluationLite[]> {
  if (submissionIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('drawing_evaluation')
      .select('id, submission_id, intent, released_at')
      .in('submission_id', submissionIds)
      .eq('source', 'manual');
    if (error) return [];
    return (data ?? []) as ManualEvaluationLite[];
  } catch {
    return [];
  }
}

export async function loadStudentRubric(
  supabase: any,
  latest: { question_id?: string | null; assignment_id?: string | null } | null,
  evaluations: ManualEvaluationLite[],
  releasedIds: ReadonlySet<string>,
): Promise<StudentRubric | null> {
  const released = evaluations.filter((e) => releasedIds.has(e.submission_id));
  if (!latest || released.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from('drawing_evaluation_criterion')
      .select('evaluation_id, criterion_key, final_band')
      .in('evaluation_id', released.map((e) => e.id));
    if (error || !data?.length) return null;

    const submissionByEvaluation = new Map(released.map((e) => [e.id, e.submission_id]));
    const bandsBySubmission: Record<string, BandMap> = {};
    for (const row of data as Array<{ evaluation_id: string; criterion_key: string; final_band: number | null }>) {
      const submissionId = submissionByEvaluation.get(row.evaluation_id);
      if (!submissionId || row.final_band == null) continue;
      (bandsBySubmission[submissionId] ??= {})[row.criterion_key] = row.final_band as Band;
    }
    if (Object.keys(bandsBySubmission).length === 0) return null;

    // Every attempt answers the same assignment, so one brief covers them all.
    const criteria = criteriaForBrief(await briefKeyForSubmission(supabase, latest));
    return buildStudentRubric(criteria, bandsBySubmission, releasedIds);
  } catch {
    return null;
  }
}
