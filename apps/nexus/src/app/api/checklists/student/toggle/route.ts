import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  toggleEntryProgress,
  toggleModuleItemProgress,
  updateEntryStatus,
  updateModuleItemStatus,
  recordGamificationEvent,
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

    // Helper: record gamification for checklist completion
    const recordChecklistPoints = async (itemId: string, itemType: 'entry' | 'module_item') => {
      try {
        const supabase = getSupabaseAdminClient() as any;
        // Get classroom and batch for this student
        const { data: enrollments } = await supabase
          .from('nexus_enrollments')
          .select('classroom_id, batch_id')
          .eq('user_id', user.id)
          .eq('role', 'student')
          .limit(1)
          .single();
        if (!enrollments) return;

        await recordGamificationEvent({
          student_id: user.id,
          classroom_id: enrollments.classroom_id,
          batch_id: enrollments.batch_id || null,
          event_type: 'checklist_item_completed',
          points: 5,
          source_id: `chk_${itemType}_${itemId}_${user.id}`,
          activity_type: 'checklist_item_completed',
          activity_title: 'Completed checklist item',
          metadata: { [itemType === 'entry' ? 'entry_id' : 'module_item_id']: itemId },
        });
      } catch {
        // Non-critical — don't fail the checklist toggle
      }
    };

    // New status-based flow
    if (action === 'start' || action === 'complete') {
      if (entry_id) {
        const result = await updateEntryStatus(user.id, entry_id, action);
        if (action === 'complete') recordChecklistPoints(entry_id, 'entry');
        return NextResponse.json({ progress: result });
      }
      if (module_item_id) {
        const result = await updateModuleItemStatus(user.id, module_item_id, action);
        if (action === 'complete') recordChecklistPoints(module_item_id, 'module_item');
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
        if (is_completed) recordChecklistPoints(entry_id, 'entry');
        return NextResponse.json({ progress: result });
      }
      if (module_item_id) {
        const result = await toggleModuleItemProgress(user.id, module_item_id, is_completed);
        if (is_completed) recordChecklistPoints(module_item_id, 'module_item');
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
