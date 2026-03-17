import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/checklists/[id]/progress?classroom={classroomId}
 *
 * Returns per-student progress for a checklist within a specific classroom.
 * Teacher/admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: checklistId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'classroom parameter is required' }, { status: 400 });
    }

    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all students enrolled in this classroom
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('user_id, users!inner(id, name, email)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ students: [], overall: { averageCompletion: 0, totalStudents: 0 } });
    }

    // Get checklist entries
    const { data: entries } = await supabase
      .from('nexus_checklist_entries')
      .select('id, entry_type, module_id, module:nexus_modules(id, module_type, items:nexus_module_items(id))')
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: true });

    if (!entries || entries.length === 0) {
      const students = enrollments.map((e: any) => ({
        id: e.users.id,
        name: e.users.name || e.users.email || 'Unknown',
        completedEntries: 0,
        totalEntries: 0,
        percentage: 0,
        lastActivity: null,
      }));
      return NextResponse.json({
        students,
        overall: { averageCompletion: 0, totalStudents: students.length },
      });
    }

    // Compute total items per student: simple entries + module items
    const simpleEntryIds = entries
      .filter((e: any) => e.entry_type === 'simple_item')
      .map((e: any) => e.id);

    const moduleItemIds = entries
      .filter((e: any) => e.entry_type === 'module' && e.module)
      .flatMap((e: any) => (e.module.items || []).map((i: any) => i.id));

    const totalItems = simpleEntryIds.length + moduleItemIds.length;

    const studentIds = enrollments.map((e: any) => e.user_id);

    // Fetch ALL entry progress (not just completed) for status tracking
    const { data: entryProgress } = simpleEntryIds.length > 0
      ? await supabase
          .from('nexus_student_entry_progress')
          .select('student_id, entry_id, is_completed, status, started_at, completed_at')
          .in('student_id', studentIds)
          .in('entry_id', simpleEntryIds)
      : { data: [] };

    // Fetch ALL module item progress
    const { data: moduleProgress } = moduleItemIds.length > 0
      ? await supabase
          .from('nexus_student_module_item_progress')
          .select('student_id, module_item_id, is_completed, status, started_at, completed_at')
          .in('student_id', studentIds)
          .in('module_item_id', moduleItemIds)
      : { data: [] };

    // Build per-student maps
    // entryProgressByStudent: Map<studentId, Map<entryId, progress>>
    const entryProgressByStudent = new Map<string, Map<string, any>>();
    for (const p of entryProgress || []) {
      if (!entryProgressByStudent.has(p.student_id)) {
        entryProgressByStudent.set(p.student_id, new Map());
      }
      entryProgressByStudent.get(p.student_id)!.set(p.entry_id, p);
    }

    // moduleProgressByStudent: Map<studentId, Map<moduleItemId, progress>>
    const moduleProgressByStudent = new Map<string, Map<string, any>>();
    for (const p of moduleProgress || []) {
      if (!moduleProgressByStudent.has(p.student_id)) {
        moduleProgressByStudent.set(p.student_id, new Map());
      }
      moduleProgressByStudent.get(p.student_id)!.set(p.module_item_id, p);
    }

    // Build ordered entry list for "current step" detection
    const orderedEntries = (entries as any[]).sort((a: any, b: any) => a.sort_order - b.sort_order);

    const now = new Date();
    let staleCount = 0;

    const students = enrollments.map((e: any) => {
      const studentEntryMap = entryProgressByStudent.get(e.user_id) || new Map();
      const studentModuleMap = moduleProgressByStudent.get(e.user_id) || new Map();

      // Count completed items
      let completedCount = 0;
      let latestActivity: string | null = null;

      for (const [, p] of studentEntryMap) {
        if (p.is_completed) completedCount++;
        const ts = p.completed_at || p.started_at;
        if (ts && (!latestActivity || ts > latestActivity)) latestActivity = ts;
      }
      for (const [, p] of studentModuleMap) {
        if (p.is_completed) completedCount++;
        const ts = p.completed_at || p.started_at;
        if (ts && (!latestActivity || ts > latestActivity)) latestActivity = ts;
      }

      // Find current step (first incomplete entry in order)
      let currentStepTitle: string | null = null;
      let currentStepStatus: string | null = null;
      let currentStepStartedAt: string | null = null;

      for (const entry of orderedEntries) {
        if (entry.entry_type === 'simple_item') {
          const prog = studentEntryMap.get(entry.id);
          if (!prog || !prog.is_completed) {
            currentStepTitle = entry.title || `Step ${entry.sort_order + 1}`;
            currentStepStatus = prog?.status || 'not_started';
            currentStepStartedAt = prog?.started_at || null;
            break;
          }
        } else if (entry.entry_type === 'module' && entry.module) {
          const moduleItems = (entry.module.items || []) as any[];
          const allDone = moduleItems.length > 0 && moduleItems.every(
            (item: any) => studentModuleMap.get(item.id)?.is_completed
          );
          if (!allDone) {
            currentStepTitle = entry.module.title || `Step ${entry.sort_order + 1}`;
            // Check if any item in the module is started
            const anyStarted = moduleItems.some(
              (item: any) => studentModuleMap.has(item.id)
            );
            currentStepStatus = anyStarted ? 'in_progress' : 'not_started';
            // Find earliest started_at among module items
            let earliest: string | null = null;
            for (const item of moduleItems) {
              const mp = studentModuleMap.get(item.id);
              if (mp?.started_at && (!earliest || mp.started_at < earliest)) {
                earliest = mp.started_at;
              }
            }
            currentStepStartedAt = earliest;
            break;
          }
        }
      }

      // Days since last activity
      let daysSinceLastActivity: number | null = null;
      if (latestActivity) {
        const diff = now.getTime() - new Date(latestActivity).getTime();
        daysSinceLastActivity = Math.floor(diff / (1000 * 60 * 60 * 24));
      }

      // Stale = has started but idle > 7 days
      const isStale = latestActivity !== null && daysSinceLastActivity !== null && daysSinceLastActivity > 7 && completedCount < totalItems;
      if (isStale) staleCount++;

      return {
        id: e.users.id,
        name: e.users.name || e.users.email || 'Unknown',
        completedEntries: completedCount,
        totalEntries: totalItems,
        percentage: totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0,
        lastActivity: latestActivity,
        currentStepTitle,
        currentStepStatus,
        currentStepStartedAt,
        daysSinceLastActivity,
        isStale,
      };
    });

    // Sort by percentage descending
    students.sort((a: any, b: any) => b.percentage - a.percentage);

    const averageCompletion =
      students.length > 0
        ? Math.round(students.reduce((sum: number, s: any) => sum + s.percentage, 0) / students.length)
        : 0;

    return NextResponse.json({
      students,
      overall: { averageCompletion, totalStudents: students.length, staleStudents: staleCount },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load progress';
    console.error('Checklist progress GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
