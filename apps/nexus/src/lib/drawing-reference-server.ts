/**
 * What a teacher's score on each criterion can be compared against.
 *
 * Reads, for one drawing: the AI draft's bands if there is one, the previous
 * attempt's scores, the student's most recent scores elsewhere, and the rest
 * of the class on this assignment. lib/drawing-teaching-moment.ts decides which
 * of those is the reference; this only fetches them, in a fixed handful of
 * queries whatever the class size.
 */

import type { ReferenceInputs } from './drawing-teaching-moment';

export const MANUAL_PROMPT_VERSION = 'manual-canvas-v1';

interface SubmissionRef {
  id: string;
  student_id: string;
  assignment_id: string | null;
  submitted_at: string | null;
}

type Bands = Record<string, number>;

/** Manual scores per submission, for the submissions given. */
async function manualBands(supabase: any, submissionIds: string[]): Promise<Map<string, Bands>> {
  const out = new Map<string, Bands>();
  if (submissionIds.length === 0) return out;
  const { data: evals } = await supabase
    .from('drawing_evaluation')
    .select('id, submission_id')
    .in('submission_id', submissionIds)
    .eq('source', 'manual');
  const evalToSub = new Map<string, string>(
    ((evals ?? []) as Array<{ id: string; submission_id: string }>).map((e) => [e.id, e.submission_id]),
  );
  if (evalToSub.size === 0) return out;
  const { data: rows } = await supabase
    .from('drawing_evaluation_criterion')
    .select('evaluation_id, criterion_key, final_band')
    .in('evaluation_id', Array.from(evalToSub.keys()));
  for (const row of (rows ?? []) as Array<{ evaluation_id: string; criterion_key: string; final_band: number | null }>) {
    if (!row.final_band) continue;
    const sub = evalToSub.get(row.evaluation_id);
    if (!sub) continue;
    const bands = out.get(sub) ?? {};
    bands[row.criterion_key] = row.final_band;
    out.set(sub, bands);
  }
  return out;
}

/**
 * Only ever called with the evaluation tables present; any failure reads as "no
 * reference", which simply means no teaching moment. Scoring never depends on it.
 */
export async function loadReferenceInputs(
  supabase: any,
  submission: SubmissionRef,
  criterionKeys: string[],
): Promise<Record<string, ReferenceInputs>> {
  const inputs: Record<string, ReferenceInputs> = Object.fromEntries(criterionKeys.map((k) => [k, {}]));
  try {
    // The AI draft on this very sheet.
    const { data: aiEval } = await supabase
      .from('drawing_evaluation')
      .select('id')
      .eq('submission_id', submission.id)
      .eq('source', 'ai')
      // A running, failed or superseded row carries no scores. Taking it as
      // "the newest draft" would drop the AI band from beside every score.
      .in('status', ['draft', 'reviewed', 'released'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aiEval?.id) {
      const { data: aiRows } = await supabase
        .from('drawing_evaluation_criterion')
        .select('criterion_key, ai_band')
        .eq('evaluation_id', aiEval.id);
      for (const r of (aiRows ?? []) as Array<{ criterion_key: string; ai_band: number | null }>) {
        if (inputs[r.criterion_key] && r.ai_band) inputs[r.criterion_key].aiBand = r.ai_band;
      }
    }

    // This student's other drawings, newest first: earlier rounds of this
    // assignment are "previous attempt", anything else is "last drawing".
    const { data: mine } = await supabase
      .from('drawing_submissions')
      .select('id, assignment_id, submitted_at, reviewed_at')
      .eq('student_id', submission.student_id)
      .neq('id', submission.id)
      .order('submitted_at', { ascending: false })
      .limit(30);
    const own = (mine ?? []) as Array<{ id: string; assignment_id: string | null; submitted_at: string | null }>;
    const earlierRounds = submission.assignment_id
      ? own.filter((s) => s.assignment_id === submission.assignment_id && (s.submitted_at ?? '') < (submission.submitted_at ?? ''))
      : [];
    const elsewhere = own.filter((s) => !submission.assignment_id || s.assignment_id !== submission.assignment_id);

    // The class on this assignment, other students only.
    let classmates: Array<{ id: string; student_id: string; submitted_at: string | null }> = [];
    if (submission.assignment_id) {
      const { data } = await supabase
        .from('drawing_submissions')
        .select('id, student_id, submitted_at')
        .eq('assignment_id', submission.assignment_id)
        .neq('student_id', submission.student_id)
        .order('submitted_at', { ascending: false })
        .limit(500);
      classmates = data ?? [];
    }

    const bandsBySub = await manualBands(supabase, [
      ...earlierRounds.map((s) => s.id),
      ...elsewhere.map((s) => s.id),
      ...classmates.map((s) => s.id),
    ]);

    for (const key of criterionKeys) {
      const previous = earlierRounds.find((s) => bandsBySub.get(s.id)?.[key]);
      if (previous) inputs[key].previousAttemptBand = bandsBySub.get(previous.id)![key];
      const last = elsewhere.find((s) => bandsBySub.get(s.id)?.[key]);
      if (last) inputs[key].studentLastBand = bandsBySub.get(last.id)![key];

      // Each classmate counts once, by their newest scored round.
      const seen = new Set<string>();
      const classBands: number[] = [];
      for (const c of classmates) {
        const band = bandsBySub.get(c.id)?.[key];
        if (!band || seen.has(c.student_id)) continue;
        seen.add(c.student_id);
        classBands.push(band);
      }
      inputs[key].classBands = classBands;
    }
  } catch {
    // No references is a valid answer.
  }
  return inputs;
}

/**
 * The one manual evaluation row for a drawing, created if missing.
 *
 * The rubric save and a correction can arrive together for a sheet that has
 * never been scored, and the unique index allows one manual row per drawing,
 * so a lost insert race re-reads rather than failing.
 */
export async function ensureManualEvaluation(supabase: any, submissionId: string, userId: string): Promise<string> {
  const find = async () => {
    const { data } = await supabase
      .from('drawing_evaluation')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('source', 'manual')
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const existing = await find();
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from('drawing_evaluation')
    .insert({
      submission_id: submissionId,
      source: 'manual',
      status: 'reviewed',
      provider: 'manual',
      prompt_version: MANUAL_PROMPT_VERSION,
      created_by: userId,
    })
    .select('id')
    .single();
  if (!error && created?.id) return created.id as string;
  const raced = await find();
  if (raced) return raced;
  throw new Error(error?.message ?? 'Could not start the review record');
}
