import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/modules/items/toggle
 * Toggle module item completion for the current user (student progress).
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { module_item_id, is_completed } = body;

    if (!module_item_id || typeof is_completed !== 'boolean') {
      return NextResponse.json(
        { error: 'module_item_id and is_completed (boolean) are required' },
        { status: 400 }
      );
    }

    const { data: progress, error } = await supabase
      .from('nexus_student_module_item_progress')
      .upsert(
        {
          user_id: user.id,
          module_item_id,
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        },
        {
          onConflict: 'user_id,module_item_id',
        }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle item progress';
    console.error('Module item toggle error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
