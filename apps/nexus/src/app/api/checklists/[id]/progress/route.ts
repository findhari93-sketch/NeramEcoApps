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

    // Fetch all simple entry progress
    const { data: entryProgress } = simpleEntryIds.length > 0
      ? await supabase
          .from('nexus_student_entry_progress')
          .select('student_id, entry_id, is_completed, completed_at')
          .in('student_id', studentIds)
          .in('entry_id', simpleEntryIds)
          .eq('is_completed', true)
      : { data: [] };

    // Fetch all module item progress
    const { data: moduleProgress } = moduleItemIds.length > 0
      ? await supabase
          .from('nexus_student_module_item_progress')
          .select('student_id, module_item_id, is_completed, completed_at')
          .in('student_id', studentIds)
          .in('module_item_id', moduleItemIds)
          .eq('is_completed', true)
      : { data: [] };

    // Build per-student progress
    const entryCountByStudent = new Map<string, number>();
    const moduleCountByStudent = new Map<string, number>();
    const lastActivityByStudent = new Map<string, string>();

    for (const p of entryProgress || []) {
      entryCountByStudent.set(p.student_id, (entryCountByStudent.get(p.student_id) || 0) + 1);
      if (p.completed_at) {
        const existing = lastActivityByStudent.get(p.student_id);
        if (!existing || p.completed_at > existing) {
          lastActivityByStudent.set(p.student_id, p.completed_at);
        }
      }
    }

    for (const p of moduleProgress || []) {
      moduleCountByStudent.set(p.student_id, (moduleCountByStudent.get(p.student_id) || 0) + 1);
      if (p.completed_at) {
        const existing = lastActivityByStudent.get(p.student_id);
        if (!existing || p.completed_at > existing) {
          lastActivityByStudent.set(p.student_id, p.completed_at);
        }
      }
    }

    const students = enrollments.map((e: any) => {
      const completed =
        (entryCountByStudent.get(e.user_id) || 0) + (moduleCountByStudent.get(e.user_id) || 0);
      return {
        id: e.users.id,
        name: e.users.name || e.users.email || 'Unknown',
        completedEntries: completed,
        totalEntries: totalItems,
        percentage: totalItems > 0 ? Math.round((completed / totalItems) * 100) : 0,
        lastActivity: lastActivityByStudent.get(e.user_id) || null,
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
      overall: { averageCompletion, totalStudents: students.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load progress';
    console.error('Checklist progress GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
