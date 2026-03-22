import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { updateVideoReview } from '@neram/database/queries/nexus';

/**
 * PATCH /api/library/admin/review/[id]
 *
 * Update a video review (approve/reject/edit).
 * Body: LibraryVideoUpdate fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { id: videoId } = await params;
    const body = await request.json();

    // Add reviewer info
    const update = {
      ...body,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };

    const video = await updateVideoReview(videoId, update);

    return NextResponse.json({ data: video });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update video review';
    console.error('Review PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
