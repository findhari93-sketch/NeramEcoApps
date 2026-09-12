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
 * This route does NOT touch `drawing_submissions.tutor_rating`. It returns the
 * star the rubric implies and the review save stays the single writer of that
 * column, because two writers on one field is how a grade goes missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { evalTables } from '@/lib/drawing-eval/db';
import {
  criteriaForBrief,
  overallFromBands,
  overallToStars,
  type Band,
  type BandMap,
} from '@/lib/drawing-rubric';

const MANUAL_PROMPT_VERSION = 'manual-canvas-v1';

async function requireStaff(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (!user || !['teacher', 'admin'].includes(user.user_type as string)) return null;
  return { supabase, user };
}

/**
 * The brief this drawing was set to, as a `category.sub_type` key.
 *
 * Read straight off the backing question rather than through the brief-type
 * table, so scoring works in an environment where the evaluation tables were
 * never migrated. `sub_type = 'assignment'` is a marker, not a brief dimension,
 * which is why most assignment drawings correctly resolve to nothing and get
 * the shared four criteria.
 */
async function briefKeyFor(supabase: any, submission: { question_id?: string | null }) {
  if (!submission.question_id) return null;
  const { data } = await supabase
    .from('drawing_questions')
    .select('category, sub_type')
    .eq('id', submission.question_id)
    .maybeSingle();
  if (!data?.category || !data?.sub_type || data.sub_type === 'assignment') return null;
  return `${data.category}.${data.sub_type}`;
}

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const { data: submission } = await auth.supabase
      .from('drawing_submissions')
      .select('id, question_id')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const briefKey = await briefKeyFor(auth.supabase, submission);
    const criteria = criteriaForBrief(briefKey);

    let bands: BandMap = {};
    try {
      const db = evalTables(auth.supabase);
      const { data: evaluation } = await db
        .from('drawing_evaluation')
        .select('id')
        .eq('submission_id', id)
        .eq('source', 'manual')
        .maybeSingle();
      if (evaluation?.id) {
        const { data: rows } = await db
          .from('drawing_evaluation_criterion')
          .select('criterion_key, final_band')
          .eq('evaluation_id', evaluation.id);
        for (const row of (rows ?? []) as Array<{ criterion_key: string; final_band: number | null }>) {
          if (row.final_band) bands[row.criterion_key] = row.final_band as Band;
        }
      }
    } catch {
      // No evaluation tables here. The criteria are still worth returning: the
      // teacher can see the rubric even where nothing can be stored against it.
      bands = {};
    }

    const overall = overallFromBands(bands, criteria);
    return NextResponse.json({
      brief_key: briefKey,
      criteria,
      bands,
      overall,
      stars: overallToStars(overall),
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
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const bands = parseBands((body as Record<string, unknown>)?.bands);
    if (!bands) return NextResponse.json({ error: 'Malformed bands' }, { status: 400 });

    const { data: submission } = await auth.supabase
      .from('drawing_submissions')
      .select('id, question_id')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const briefKey = await briefKeyFor(auth.supabase, submission);
    const criteria = criteriaForBrief(briefKey);
    // A score for a criterion this brief does not use is dropped rather than
    // stored. Retagging an assignment later is meant to be cheap, and a stale
    // fifth criterion sitting in the table would quietly rejoin the average.
    const allowed = new Set(criteria.map((c) => c.key));

    const db = evalTables(auth.supabase);

    const { data: existing } = await db
      .from('drawing_evaluation')
      .select('id')
      .eq('submission_id', id)
      .eq('source', 'manual')
      .maybeSingle();

    let evaluationId = existing?.id as string | undefined;
    if (!evaluationId) {
      const { data: created, error } = await db
        .from('drawing_evaluation')
        .insert({
          submission_id: id,
          source: 'manual',
          status: 'reviewed',
          provider: 'manual',
          prompt_version: MANUAL_PROMPT_VERSION,
          created_by: auth.user.id,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      evaluationId = created.id as string;
    }

    // Replace the set: a criterion the teacher cleared has to disappear, and
    // the row count is five at most.
    const { error: clearError } = await db
      .from('drawing_evaluation_criterion')
      .delete()
      .eq('evaluation_id', evaluationId);
    if (clearError) throw new Error(clearError.message);

    const rows = Object.entries(bands)
      .filter(([key, band]) => allowed.has(key) && band)
      .map(([key, band]) => ({
        evaluation_id: evaluationId,
        criterion_key: key,
        // ai_band stays null: nothing drafted this. When the model does, it
        // fills ai_band and was_corrected starts meaning something.
        ai_band: null,
        final_band: band,
        was_corrected: false,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await db.from('drawing_evaluation_criterion').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    const kept: BandMap = Object.fromEntries(rows.map((r) => [r.criterion_key, r.final_band as Band]));
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
    if (/does not exist|schema cache/i.test(message)) return notMigrated(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
