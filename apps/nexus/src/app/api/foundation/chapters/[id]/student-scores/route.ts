import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getChapterStudentScores } from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters/[id]/student-scores
 *
 * Returns all students' section-wise quiz scores for a chapter.
 * Teacher/admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: chapterId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    // Verify user is a teacher or admin
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const scores = await getChapterStudentScores(chapterId);
    return NextResponse.json(scores);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch scores';
    console.error('Student scores error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
