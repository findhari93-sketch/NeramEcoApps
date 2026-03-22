import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { bulkApproveVideos } from '@neram/database/queries/nexus';

/**
 * POST /api/library/admin/review/bulk-approve
 *
 * Bulk approve videos.
 * Body: { video_ids: string[] }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { video_ids } = body;

    if (!Array.isArray(video_ids) || video_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: video_ids (non-empty array)' },
        { status: 400 },
      );
    }

    const approved = await bulkApproveVideos(video_ids, user.id);

    return NextResponse.json({ data: approved, count: approved.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to bulk approve videos';
    console.error('Bulk approve POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
