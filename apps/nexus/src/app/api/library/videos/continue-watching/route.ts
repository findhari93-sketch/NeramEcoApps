import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getContinueWatching } from '@neram/database/queries/nexus';

/**
 * GET /api/library/videos/continue-watching
 *
 * Get the student's in-progress videos.
 */
export async function GET(request: NextRequest) {
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

    const data = await getContinueWatching(user.id);

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load continue watching';
    console.error('Continue watching GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
