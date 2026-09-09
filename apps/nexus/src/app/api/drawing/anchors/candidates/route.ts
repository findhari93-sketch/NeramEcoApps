import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

import { verifyMsToken } from '@/lib/ms-verify';
import { evalTables } from '@/lib/drawing-eval/db';

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
    if (questionIds.length === 0) return NextResponse.json({ candidates: [] });

    let query = supabase
      .from('drawing_submissions')
      .select('id, original_image_url, tutor_rating, tutor_marks, reviewed_at, question_id, student:users!drawing_submissions_student_id_fkey(id, name)')
      .in('question_id', questionIds)
      .in('status', ['completed', 'reviewed'])
      .not('original_image_url', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(40);

    if (band !== null && Number.isInteger(band) && band >= 1 && band <= 5) {
      query = query.eq('tutor_rating', band);
    }

    const { data: candidates } = await query;

    return NextResponse.json({
      candidates: candidates || [],
      // Surfaced so the screen can say "no sheets were ever rated 1" rather
      // than showing an empty list that looks like a loading failure. Band 1
      // has no examples in the graded history at all.
      filtered_by_band: band,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
