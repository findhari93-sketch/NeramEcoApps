import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/checklist/toggle
 *
 * Toggle checklist item completion for the current student.
 * Body: { item_id, completed }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const body = await request.json();
    const { item_id, completed } = body;

    if (!item_id || typeof completed !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: item_id (string), completed (boolean)' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient();

    // Look up user by MS OID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Upsert progress record
    const { error } = await supabase
      .from('nexus_student_checklist_progress')
      .upsert(
        {
          student_id: user.id,
          checklist_item_id: item_id,
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
        },
        {
          onConflict: 'student_id,checklist_item_id',
        },
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle checklist item';
    console.error('Checklist toggle error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
