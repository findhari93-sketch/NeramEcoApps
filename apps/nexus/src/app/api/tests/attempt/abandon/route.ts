import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/tests/attempt/abandon
 * Called via navigator.sendBeacon when user leaves the test page.
 * Marks an in_progress attempt as 'abandoned'.
 * Body: JSON { attempt_id }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { attempt_id } = body;

    if (!attempt_id) {
      return NextResponse.json({ error: 'Missing attempt_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only abandon if still in_progress and owned by this user
    const { error } = await supabase
      .from('nexus_test_attempts')
      .update({
        status: 'abandoned',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', attempt_id)
      .eq('student_id', user.id)
      .eq('status', 'in_progress');

    if (error) throw error;

    return NextResponse.json({ action: 'abandoned' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to abandon attempt';
    console.error('Test attempt abandon error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
