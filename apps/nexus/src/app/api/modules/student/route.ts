import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/student
 * List all published modules with item counts and student progress.
 */
export async function GET(request: NextRequest) {
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

    // If classroom param provided, scope modules through checklist assignment chain
    const classroomId = request.nextUrl.searchParams.get('classroom');
    let moduleFilter: string[] | null = null;

    if (classroomId) {
      // Find module IDs assigned to this classroom via checklists
      const { data: assignments } = await supabase
        .from('nexus_checklist_classrooms')
        .select('checklist_id')
        .eq('classroom_id', classroomId);

      if (assignments && assignments.length > 0) {
        const checklistIds = assignments.map((a: any) => a.checklist_id);
        const { data: entries } = await supabase
          .from('nexus_checklist_entries')
          .select('module_id')
          .in('checklist_id', checklistIds)
          .eq('entry_type', 'module')
          .not('module_id', 'is', null);

        moduleFilter = (entries || []).map((e: any) => e.module_id);
      } else {
        moduleFilter = [];
      }
    }

    // Only published modules (optionally filtered by classroom assignment)
    let query = supabase
      .from('nexus_modules')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: true });

    if (moduleFilter !== null) {
      if (moduleFilter.length === 0) {
        return NextResponse.json({ modules: [] });
      }
      query = query.in('id', moduleFilter);
    }

    const { data: modules, error } = await query;

    if (error) throw error;

    const moduleIds = (modules || []).map((m: any) => m.id);

    // Get item counts per module (only published items)
    const { data: items } = await supabase
      .from('nexus_module_items')
      .select('id, module_id')
      .in('module_id', moduleIds)
      .eq('is_published', true)
      .eq('is_active', true);

    const itemCounts: Record<string, number> = {};
    const allItemIds: string[] = [];
    for (const item of items || []) {
      itemCounts[item.module_id] = (itemCounts[item.module_id] || 0) + 1;
      allItemIds.push(item.id);
    }

    // Get student progress for all items
    let completedCounts: Record<string, number> = {};
    if (allItemIds.length > 0) {
      const { data: progress } = await supabase
        .from('nexus_module_student_progress')
        .select('module_item_id')
        .eq('student_id', user.id)
        .eq('status', 'completed')
        .in('module_item_id', allItemIds);

      // Map completed items back to their modules
      const itemToModule: Record<string, string> = {};
      for (const item of items || []) {
        itemToModule[item.id] = item.module_id;
      }
      for (const p of progress || []) {
        const mid = itemToModule[p.module_item_id];
        if (mid) {
          completedCounts[mid] = (completedCounts[mid] || 0) + 1;
        }
      }
    }

    const result = (modules || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      icon: m.icon,
      color: m.color,
      module_type: m.module_type,
      itemCount: itemCounts[m.id] || 0,
      completedCount: completedCounts[m.id] || 0,
    }));

    return NextResponse.json({ modules: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load modules';
    console.error('Student modules GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
