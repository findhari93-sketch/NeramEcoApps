import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/library/admin/sync
 *
 * Trigger sync (placeholder - creates a sync log entry).
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

    // Create a sync log entry (placeholder)
    const { data, error } = await supabase
      .from('library_sync_log')
      .insert({
        status: 'pending',
        triggered_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data, message: 'Sync triggered' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to trigger sync';
    console.error('Sync POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
