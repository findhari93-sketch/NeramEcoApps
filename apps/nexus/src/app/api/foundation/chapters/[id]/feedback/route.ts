import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getChapterReaction,
  upsertChapterReaction,
  removeChapterReaction,
  getSingleChapterReactionCounts,
} from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters/[id]/feedback
 * Returns the student's reaction for this chapter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [reaction, counts] = await Promise.all([
      getChapterReaction(user.id, params.id),
      getSingleChapterReactionCounts(params.id),
    ]);
    return NextResponse.json({ reaction, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get feedback';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/foundation/chapters/[id]/feedback
 * Set or remove reaction: { reaction: "like" | "dislike" | null }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (body.reaction === null) {
      await removeChapterReaction(user.id, params.id);
      const counts = await getSingleChapterReactionCounts(params.id);
      return NextResponse.json({ reaction: null, counts });
    }

    if (body.reaction !== 'like' && body.reaction !== 'dislike') {
      return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
    }

    const reaction = await upsertChapterReaction(user.id, params.id, body.reaction);
    const counts = await getSingleChapterReactionCounts(params.id);
    return NextResponse.json({ reaction, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
