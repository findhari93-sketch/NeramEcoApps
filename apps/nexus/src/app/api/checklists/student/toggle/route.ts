import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  toggleEntryProgress,
  toggleModuleItemProgress,
} from '@neram/database/queries/nexus';

/**
 * POST /api/checklists/student/toggle
 *
 * Toggle completion for a checklist entry (simple_item) or module item.
 * Body: { entry_id, is_completed } for simple items
 *    or { module_item_id, is_completed } for module items
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
    const { entry_id, module_item_id, is_completed } = body;

    if (typeof is_completed !== 'boolean') {
      return NextResponse.json({ error: 'is_completed (boolean) is required' }, { status: 400 });
    }

    if (entry_id) {
      const result = await toggleEntryProgress(user.id, entry_id, is_completed);
      return NextResponse.json({ progress: result });
    }

    if (module_item_id) {
      const result = await toggleModuleItemProgress(user.id, module_item_id, is_completed);
      return NextResponse.json({ progress: result });
    }

    return NextResponse.json(
      { error: 'Either entry_id or module_item_id is required' },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle progress';
    console.error('Toggle progress error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
