/**
 * Record why a score differs from its reference, and optionally keep a rule.
 *
 * POST { criterion_key, final_band, reference_band, reference_kind,
 *        reason_code?, reason_text?, remember? }
 *
 * Writes the reason onto the criterion row itself, beside the score, so the
 * training signal and the band sentence cannot drift apart from the grade they
 * explain. The score is written too, which makes this safe to call before the
 * rubric save for the same keystroke has landed.
 *
 * With `remember`, the reason becomes a grading rule, and the response lists
 * other open AI drafts that made the same call, to OFFER opening them. Nothing
 * else is changed. Until drafts exist, that list is always empty.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { parseCorrection, ruleTextFor } from '@/lib/drawing-teaching-moment';
import { ensureManualEvaluation } from '@/lib/drawing-reference-server';
import { matchingDrafts, type OpenDraftCriterion } from '@/lib/drawing-grading-rules';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const supabase = auth.supabase;

    const parsed = parseCorrection(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const c = parsed.value;

    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('id, assignment_id')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const evaluationId = await ensureManualEvaluation(supabase, id, auth.user.id);

    let rule: { id: string; text: string } | null = null;
    if (c.remember) {
      const { data, error } = await supabase
        .from('drawing_grading_rule')
        .insert({
          teacher_id: auth.user.id,
          criterion_key: c.criterion_key,
          reason_code: c.reason_code,
          text: ruleTextFor(c),
          origin: 'teacher',
        })
        .select('id, text')
        .single();
      if (error) throw new Error(error.message);
      rule = data;
    }

    const { error: writeError } = await supabase.from('drawing_evaluation_criterion').upsert(
      {
        evaluation_id: evaluationId,
        criterion_key: c.criterion_key,
        final_band: c.final_band,
        reference_band: c.reference_band,
        reference_kind: c.reference_kind,
        correction_reason_code: c.reason_code,
        correction_reason_text: c.reason_text,
        corrected_at: new Date().toISOString(),
        corrected_by: auth.user.id,
        applied_rule_id: rule?.id ?? null,
        // Only an override of a model's band is a correction in the training sense.
        was_corrected: c.reference_kind === 'ai',
        ...(c.reference_kind === 'ai' ? { ai_band: c.reference_band } : {}),
      },
      { onConflict: 'evaluation_id,criterion_key' },
    );
    if (writeError) throw new Error(writeError.message);

    let matches: string[] = [];
    if (rule && c.reference_kind === 'ai' && submission.assignment_id) {
      matches = await openDraftsLike(supabase, submission.assignment_id, {
        teacher_id: auth.user.id,
        criterion_key: c.criterion_key,
        brief_type_id: null,
        is_active: true,
      }, c.reference_band, id);
    }

    return NextResponse.json({ ok: true, rule, matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record the reason';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Correction capture is not migrated here', detail: message }, { status: 503 });
    }
    return errorResponse(err, message);
  }
}

/** Open AI drafts on this assignment that made the same call on this criterion. */
async function openDraftsLike(
  supabase: any,
  assignmentId: string,
  rule: { teacher_id: string; criterion_key: string; brief_type_id: string | null; is_active: boolean },
  correctedFromBand: number,
  exceptSubmissionId: string,
): Promise<string[]> {
  const { data: subs } = await supabase.from('drawing_submissions').select('id').eq('assignment_id', assignmentId);
  const ids = ((subs ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (ids.length === 0) return [];
  const { data: evals } = await supabase
    .from('drawing_evaluation')
    .select('id, submission_id, created_by, brief_type_id, released_at, status')
    .in('submission_id', ids)
    .eq('source', 'ai')
    // A replaced draft keeps its criterion rows; counting it would count one
    // sheet twice.
    .in('status', ['draft', 'reviewed', 'released']);
  const byEval = new Map(((evals ?? []) as Array<any>).map((e) => [e.id, e]));
  if (byEval.size === 0) return [];
  const { data: rows } = await supabase
    .from('drawing_evaluation_criterion')
    .select('evaluation_id, criterion_key, ai_band, was_corrected')
    .in('evaluation_id', Array.from(byEval.keys()))
    .eq('criterion_key', rule.criterion_key);
  const drafts: OpenDraftCriterion[] = ((rows ?? []) as Array<any>).map((r) => {
    const e = byEval.get(r.evaluation_id);
    return {
      submission_id: e.submission_id,
      teacher_id: e.created_by,
      brief_type_id: e.brief_type_id,
      criterion_key: r.criterion_key,
      ai_band: r.ai_band,
      was_corrected: r.was_corrected,
      released: !!e.released_at || e.status === 'released',
    };
  });
  return matchingDrafts(rule, correctedFromBand, drafts, exceptSubmissionId);
}
