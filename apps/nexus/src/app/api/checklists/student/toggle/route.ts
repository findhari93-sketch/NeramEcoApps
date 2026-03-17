import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  toggleEntryProgress,
  toggleModuleItemProgress,
  updateEntryStatus,
  updateModuleItemStatus,
} from '@neram/database/queries/nexus';

/**
 * POST /api/checklists/student/toggle
 *
 * Status-based: { entry_id | module_item_id, action: 'start' | 'complete' }
 * Legacy compat: { entry_id | module_item_id, is_completed: boolean }
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
    const { entry_id, module_item_id, action, is_completed } = body;

    // New status-based flow
    if (action === 'start' || action === 'complete') {
      if (entry_id) {
        const result = await updateEntryStatus(user.id, entry_id, action);
        return NextResponse.json({ progress: result });
      }
      if (module_item_id) {
        const result = await updateModuleItemStatus(user.id, module_item_id, action);
        return NextResponse.json({ progress: result });
      }
      return NextResponse.json(
        { error: 'Either entry_id or module_item_id is required' },
        { status: 400 }
      );
    }

    // Legacy boolean toggle (backward compat)
    if (typeof is_completed === 'boolean') {
      if (entry_id) {
        const result = await toggleEntryProgress(user.id, entry_id, is_completed);
        return NextResponse.json({ progress: result });
      }
      if (module_item_id) {
        const result = await toggleModuleItemProgress(user.id, module_item_id, is_completed);
        return NextResponse.json({ progress: result });
      }
    }

    return NextResponse.json(
      { error: 'action (start|complete) or is_completed (boolean) is required' },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update progress';
    console.error('Toggle progress error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
