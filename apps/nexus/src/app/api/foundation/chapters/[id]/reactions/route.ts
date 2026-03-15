import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getSingleChapterReactionCounts,
  getChapterReactionDetails,
} from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters/[id]/reactions
 * Teachers/Admins only: Get reaction counts + who liked/disliked
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { id: chapterId } = await params;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const [counts, details] = await Promise.all([
      getSingleChapterReactionCounts(chapterId),
      getChapterReactionDetails(chapterId),
    ]);

    return NextResponse.json({ counts, details });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reactions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
