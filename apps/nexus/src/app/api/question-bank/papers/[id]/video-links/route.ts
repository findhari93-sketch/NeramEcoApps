import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Bulk-update solution_video_url for questions in a paper.
 * Accepts an array of { question_id, solution_video_url } pairs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { links } = body as {
      links: { question_id: string; solution_video_url: string }[];
    };

    if (!links?.length) {
      return NextResponse.json({ error: 'No links provided' }, { status: 400 });
    }

    if (links.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 links per request' }, { status: 400 });
    }

    // Verify all question_ids belong to this paper
    const questionIds = links.map((l) => l.question_id);
    const { data: paperQuestions } = await supabase
      .from('nexus_qb_questions')
      .select('id')
      .eq('original_paper_id', params.id)
      .in('id', questionIds);

    const validIds = new Set((paperQuestions || []).map((q) => q.id));

    let updated = 0;
    const errors: string[] = [];

    for (const link of links) {
      if (!validIds.has(link.question_id)) {
        errors.push(`Question ${link.question_id} not in this paper`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('nexus_qb_questions')
        .update({
          solution_video_url: link.solution_video_url || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', link.question_id);

      if (updateError) {
        errors.push(updateError.message);
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      data: { updated, errors },
      message: `${updated} video link${updated !== 1 ? 's' : ''} saved`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Video Links API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
