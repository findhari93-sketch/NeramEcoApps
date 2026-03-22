import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { logSearch } from '@neram/database/queries/nexus';

/**
 * POST /api/library/search-log
 *
 * Log a search query.
 * Body: { query_text, results_count, clicked_video_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json();
    const { query_text, results_count, clicked_video_id } = body;

    if (!query_text || results_count === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: query_text, results_count' },
        { status: 400 },
      );
    }

    await logSearch(user.id, query_text, results_count, clicked_video_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to log search';
    console.error('Search log POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
