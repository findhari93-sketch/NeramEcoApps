import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { abandonAttempt, getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/tests/attempt/abandon
 * Called via navigator.sendBeacon when the student leaves the test page.
 * Marks an in_progress attempt as 'abandoned'.
 * Body: JSON { attempt_id }
 *
 * Until the status CHECK was widened, this write violated the constraint and
 * the attempt silently stayed in_progress, which then blocked the next one.
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

    await abandonAttempt(attempt_id, user.id);
    return NextResponse.json({ action: 'abandoned' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to abandon attempt';
    console.error('Test attempt abandon error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
