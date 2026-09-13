import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

import { verifyMsToken } from '@/lib/ms-verify';
import { evalTables } from '@/lib/drawing-eval/db';
import { overallFromBands, overallToStars, SHARED_CRITERIA, BRIEF_CRITERION, type BandMap } from '@/lib/drawing-rubric';

/**
 * Graded sheets that could anchor a band for one brief type.
 *
 * Filters to the brief type's own (category, sub_type) and to submissions that
 * have actually been graded, then optionally to a rating, so choosing the band
 * 4 anchor starts from the sheets already rated 4.
 *
 * The rating is a starting point, not the answer. Those ratings were given over
 * many months with no fixed reference to compare against, and the review text
 * stored beside them is mostly pasted model output, so it does not corroborate
 * them. Picking an anchor is the moment that judgement gets pinned down, which
 * is why this returns a shortlist for a person to look at rather than choosing
 * the top-rated sheet automatically.
 *
 * Two additions since per-criterion scoring:
 *  - sheets from ASSIGNMENTS tagged with the brief are candidates too, which is
 *    where most drawings now live;
 *  - a sheet scored on the rubric is placed by its rubric overall, the mean of
 *    five judged criteria, rather than by the one star beside it. Band 1 had no
 *    examples as a whole-sheet star; as a rubric overall it can.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const db = evalTables(supabase);

    const key = request.nextUrl.searchParams.get('brief_type');
    if (!key) return NextResponse.json({ error: 'brief_type is required' }, { status: 400 });

    const bandParam = request.nextUrl.searchParams.get('band');
    const band = bandParam ? Number(bandParam) : null;

    const { data: briefType, error: briefError } = await db
      .from('drawing_brief_type')
      .select('id, category, sub_type')
      .eq('key', key)
      .maybeSingle();

    // Distinguished from "no such brief type" on purpose: an unapplied
    // migration must not read to the picker as an empty candidate list.
    if (briefError) {
      return NextResponse.json(
        { error: `Drawing evaluation is not available in this environment: ${briefError.message}` },
        { status: 503 },
      );
    }
    if (!briefType) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    const { data: questions } = await supabase
      .from('drawing_questions')
      .select('id')
      .eq('category', briefType.category)
      .eq('sub_type', briefType.sub_type);
    const questionIds = ((questions || []) as Array<{ id: string }>).map((q) => q.id);

    let assignmentIds: string[] = [];
    try {
      const { data: tagged } = await (supabase as any)
        .from('nexus_class_assignments')
        .select('id')
        .eq('brief_type_id', (briefType as any).id);
      assignmentIds = ((tagged || []) as Array<{ id: string }>).map((a) => a.id);
    } catch {
      assignmentIds = [];
    }
    if (questionIds.length === 0 && assignmentIds.length === 0) return NextResponse.json({ candidates: [] });

    const columns = 'id, original_image_url, tutor_rating, tutor_marks, reviewed_at, question_id, assignment_id, student:users!drawing_submissions_student_id_fkey(id, name)';
    const pool = async (column: 'question_id' | 'assignment_id', ids: string[]) => {
      if (ids.length === 0) return [] as any[];
      const { data } = await (supabase as any)
        .from('drawing_submissions')
        .select(columns)
        .in(column, ids)
        .in('status', ['completed', 'reviewed'])
        .not('original_image_url', 'is', null)
        .order('reviewed_at', { ascending: false })
        .limit(200);
      return (data || []) as any[];
    };
    const [fromQuestions, fromAssignments] = await Promise.all([pool('question_id', questionIds), pool('assignment_id', assignmentIds)]);
    const byId = new Map<string, any>();
    for (const row of [...fromQuestions, ...fromAssignments]) byId.set(row.id, row);
    const all = Array.from(byId.values());

    // Rubric overall per sheet, from its manual criterion scores.
    const criteria = [...SHARED_CRITERIA, ...(BRIEF_CRITERION[key] ? [BRIEF_CRITERION[key]] : [])];
    const overallBySub = new Map<string, number>();
    if (all.length > 0) {
      const { data: evals } = await db
        .from('drawing_evaluation')
        .select('id, submission_id')
        .in('submission_id', all.map((r) => r.id))
        .eq('source', 'manual');
      const evalToSub = new Map<string, string>(((evals || []) as Array<{ id: string; submission_id: string }>).map((e) => [e.id, e.submission_id]));
      if (evalToSub.size > 0) {
        const { data: rows } = await db
          .from('drawing_evaluation_criterion')
          .select('evaluation_id, criterion_key, final_band')
          .in('evaluation_id', Array.from(evalToSub.keys()));
        const bandsBySub = new Map<string, BandMap>();
        for (const r of (rows || []) as Array<{ evaluation_id: string; criterion_key: string; final_band: number | null }>) {
          const sub = evalToSub.get(r.evaluation_id);
          if (!sub || !r.final_band) continue;
          const bands = bandsBySub.get(sub) ?? {};
          bands[r.criterion_key] = r.final_band as 1 | 2 | 3 | 4 | 5;
          bandsBySub.set(sub, bands);
        }
        for (const [sub, bands] of Array.from(bandsBySub.entries())) {
          const overall = overallFromBands(bands, criteria);
          if (overall != null) overallBySub.set(sub, overall);
        }
      }
    }

    const wantBand = band !== null && Number.isInteger(band) && band >= 1 && band <= 5 ? band : null;
    const candidates = all
      .map((row) => ({ ...row, rubric_overall: overallBySub.get(row.id) ?? null }))
      .filter((row) => {
        if (wantBand === null) return true;
        return row.rubric_overall != null ? overallToStars(row.rubric_overall) === wantBand : row.tutor_rating === wantBand;
      })
      // Rubric-scored sheets first: five judgements beat one star.
      .sort((a, b) => Number(b.rubric_overall != null) - Number(a.rubric_overall != null)
        || String(b.reviewed_at ?? '').localeCompare(String(a.reviewed_at ?? '')))
      .slice(0, 40);

    return NextResponse.json({
      candidates,
      // Surfaced so the screen can say "no sheets were ever rated 1" rather
      // than showing an empty list that looks like a loading failure. Band 1
      // has no examples in the graded history at all.
      filtered_by_band: band,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
