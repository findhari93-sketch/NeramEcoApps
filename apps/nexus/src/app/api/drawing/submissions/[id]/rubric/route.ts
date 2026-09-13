/**
 * Per-criterion scores for one drawing.
 *
 * Five anonymous stars used to carry the whole judgement, so nothing was
 * comparable between two students or between the same student across a year,
 * and a grade could not be defended past "it felt like a 3". A score is now
 * four fixed criteria plus one the brief decides. See lib/drawing-rubric.ts for
 * why those five and not others.
 *
 * Scores land on `drawing_evaluation_criterion` with `ai_band` left null and
 * `final_band` set, hanging off the same `source = 'manual'` evaluation row the
 * canvas marks use. That is the shape the model would fill in later, so when
 * the AI does start drafting, this screen already speaks its language and the
 * only change is that `ai_band` stops being null.
 *
 * GET also returns, per criterion, the REFERENCE a score is compared against
 * and any reason already recorded, so the review screen can ask "why" at the
 * moment a score disagrees. See lib/drawing-teaching-moment.ts.
 *
 * This route does NOT touch `drawing_submissions.tutor_rating`. It returns the
 * star the rubric implies and the review save stays the single writer of that
 * column, because two writers on one field is how a grade goes missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import {
  criteriaForBrief,
  overallFromBands,
  overallToStars,
  type Band,
  type BandMap,
} from '@/lib/drawing-rubric';
import { referenceFor } from '@/lib/drawing-teaching-moment';
import { ensureManualEvaluation, loadReferenceInputs } from '@/lib/drawing-reference-server';
import { briefKeyForSubmission } from '@/lib/drawing-brief-resolve';

function parseBands(input: unknown): BandMap | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: BandMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-z_]{1,60}$/.test(key)) return null;
    if (value == null) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) return null;
    out[key] = value as Band;
  }
  return out;
}

const notMigrated = (message: string) =>
  NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });

const CORRECTION_CLEARED = {
  reference_band: null,
  reference_kind: null,
  correction_reason_code: null,
  correction_reason_text: null,
  corrected_at: null,
  corrected_by: null,
  applied_rule_id: null,
};

interface CriterionRow {
  id: string;
  criterion_key: string;
  final_band: number | null;
  correction_reason_code?: string | null;
  correction_reason_text?: string | null;
  corrected_at?: string | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const supabase = auth.supabase;

    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('id, question_id, student_id, assignment_id, submitted_at')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const briefKey = await briefKeyForSubmission(supabase, submission);
    const criteria = criteriaForBrief(briefKey);

    let bands: BandMap = {};
    const corrections: Record<string, { reason_code: string | null; reason_text: string | null }> = {};
    let rows: CriterionRow[] = [];
    try {
      const { data: evaluation } = await supabase
        .from('drawing_evaluation')
        .select('id')
        .eq('submission_id', id)
        .eq('source', 'manual')
        .maybeSingle();
      if (evaluation?.id) {
        let res = await supabase
          .from('drawing_evaluation_criterion')
          .select('id, criterion_key, final_band, correction_reason_code, correction_reason_text, corrected_at')
          .eq('evaluation_id', evaluation.id);
        // Before the correction columns exist, scores still load.
        if (res.error && isNotMigrated(res.error.message)) {
          res = await supabase.from('drawing_evaluation_criterion').select('id, criterion_key, final_band').eq('evaluation_id', evaluation.id);
        }
        rows = (res.data ?? []) as CriterionRow[];
      }
    } catch {
      // No evaluation tables here. The criteria are still worth returning: the
      // teacher can see the rubric even where nothing can be stored against it.
      rows = [];
    }
    for (const row of rows) {
      if (row.final_band) bands[row.criterion_key] = row.final_band as Band;
      if (row.corrected_at) {
        corrections[row.criterion_key] = {
          reason_code: row.correction_reason_code ?? null,
          reason_text: row.correction_reason_text ?? null,
        };
      }
    }

    const inputs = await loadReferenceInputs(supabase, submission, criteria.map((c) => c.key));
    const references = Object.fromEntries(criteria.map((c) => [c.key, referenceFor(inputs[c.key] ?? {})]));

    let rules: unknown[] = [];
    try {
      const { data } = await supabase
        .from('drawing_grading_rule')
        .select('id, teacher_id, brief_type_id, criterion_key, reason_code, text, is_active, applied_count, created_at')
        .eq('teacher_id', auth.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      rules = data ?? [];
    } catch {
      rules = [];
    }

    const overall = overallFromBands(bands, criteria);
    return NextResponse.json({
      brief_key: briefKey,
      criteria,
      bands,
      overall,
      stars: overallToStars(overall),
      references,
      corrections,
      rules,
      assignment_id: submission.assignment_id ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load the rubric' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const supabase = auth.supabase;

    const body = await request.json().catch(() => null);
    const bands = parseBands((body as Record<string, unknown>)?.bands);
    if (!bands) return NextResponse.json({ error: 'Malformed bands' }, { status: 400 });

    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('id, question_id, assignment_id')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const briefKey = await briefKeyForSubmission(supabase, submission);
    const criteria = criteriaForBrief(briefKey);
    // A score for a criterion this brief does not use is dropped rather than
    // stored. Retagging an assignment later is meant to be cheap, and a stale
    // fifth criterion sitting in the table would quietly rejoin the average.
    const allowed = new Set(criteria.map((c) => c.key));
    const wanted = new Map(
      Object.entries(bands).filter(([key, band]) => allowed.has(key) && band) as Array<[string, Band]>,
    );

    const evaluationId = await ensureManualEvaluation(supabase, id, auth.user.id);

    const { data: existingRows, error: readError } = await supabase
      .from('drawing_evaluation_criterion')
      .select('id, criterion_key, final_band')
      .eq('evaluation_id', evaluationId);
    if (readError) throw new Error(readError.message);
    const existing = new Map(((existingRows ?? []) as CriterionRow[]).map((r) => [r.criterion_key, r]));

    // Change only what changed. Replacing the whole set, as this used to, would
    // wipe the reason a teacher gave for a score every time any score moved.
    const removed = Array.from(existing.values()).filter((r) => !wanted.has(r.criterion_key)).map((r) => r.id);
    if (removed.length > 0) {
      const { error } = await supabase.from('drawing_evaluation_criterion').delete().in('id', removed);
      if (error) throw new Error(error.message);
    }

    for (const [key, band] of Array.from(wanted.entries())) {
      const row = existing.get(key);
      if (!row) {
        const { error } = await supabase.from('drawing_evaluation_criterion').upsert(
          // ai_band stays null: nothing drafted this. When the model does, it
          // fills ai_band and was_corrected starts meaning something.
          { evaluation_id: evaluationId, criterion_key: key, final_band: band },
          { onConflict: 'evaluation_id,criterion_key' },
        );
        if (error) throw new Error(error.message);
      } else if (row.final_band !== band) {
        // A re-score makes any reason given for the old score stale. If the new
        // score still disagrees, the screen asks again.
        let { error } = await supabase
          .from('drawing_evaluation_criterion')
          .update({ final_band: band, ...CORRECTION_CLEARED })
          .eq('id', row.id);
        if (error && isNotMigrated(error.message)) {
          ({ error } = await supabase.from('drawing_evaluation_criterion').update({ final_band: band }).eq('id', row.id));
        }
        if (error) throw new Error(error.message);
      }
    }

    const kept: BandMap = Object.fromEntries(Array.from(wanted.entries()));
    const overall = overallFromBands(kept, criteria);

    return NextResponse.json({
      ok: true,
      evaluation_id: evaluationId,
      bands: kept,
      overall,
      // The review save writes tutor_rating; this is the value it should use.
      stars: overallToStars(overall),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save the rubric';
    if (isNotMigrated(message)) return notMigrated(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
