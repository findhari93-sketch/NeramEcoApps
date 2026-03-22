import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getReviewQueue } from '@neram/database/queries/nexus';

/**
 * GET /api/library/admin/review
 *
 * Review queue with filters.
 * Query params: status, minConfidence, maxConfidence, transcriptStatus, limit, offset
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

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const filters = {
      status: params.get('status') || undefined,
      minConfidence: params.get('minConfidence') ? parseFloat(params.get('minConfidence')!) : undefined,
      maxConfidence: params.get('maxConfidence') ? parseFloat(params.get('maxConfidence')!) : undefined,
      transcriptStatus: params.get('transcriptStatus') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : undefined,
    };

    const result = await getReviewQueue(filters);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load review queue';
    console.error('Review queue GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
