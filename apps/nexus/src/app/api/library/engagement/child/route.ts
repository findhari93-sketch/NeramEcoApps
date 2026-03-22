import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getChildEngagement } from '@neram/database/queries/nexus';

/**
 * GET /api/library/engagement/child
 *
 * Parent's view of their child's activity.
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

    // Only parents can view child engagement
    if (user.user_type !== 'parent') {
      return NextResponse.json({ error: 'Forbidden: parent role required' }, { status: 403 });
    }

    const engagement = await getChildEngagement(user.id);

    if (!engagement) {
      return NextResponse.json({ error: 'No linked child found' }, { status: 404 });
    }

    return NextResponse.json({ data: engagement });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load child engagement';
    console.error('Child engagement GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
