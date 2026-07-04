import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getCurrentBatch } from '@neram/database';

/**
 * GET /api/auth/impersonate/candidates?q={search}
 *
 * Returns the students the caller is allowed to "View as Student". This mirrors
 * the authorization in POST /api/auth/impersonate exactly, so the picker can
 * never offer a student the mint endpoint would reject:
 *   - admin   -> any student in the system
 *   - teacher -> students enrolled in classrooms the caller teaches
 * Only students with a linked Microsoft account (ms_oid) are returned, since
 * impersonation resolves the student by ms_oid.
 *
 * Returns: { students: Array<{ id, name, email, avatar_url, ms_oid, classroomName? }> }
 */
const MAX_RESULTS = 50;

export async function GET(request: NextRequest) {
  try {
    const callerMs = await verifyMsToken(request.headers.get('Authorization'));

    // No nested impersonation: a request already running as a student cannot
    // browse impersonation candidates.
    if (callerMs.impersonatorUserId) {
      return NextResponse.json(
        { error: 'Cannot browse students while already impersonating' },
        { status: 403 }
      );
    }

    const rawQuery = request.nextUrl.searchParams.get('q')?.trim() || '';
    // Escape ILIKE wildcards (_ and %) and backslashes; drop commas so the
    // PostgREST .or() separator is not broken by a comma in the search term.
    const safe = rawQuery
      .replace(/\\/g, '\\\\')
      .replace(/[%_]/g, '\\$&')
      .replace(/,/g, ' ');
    const orFilter = safe ? `name.ilike.%${safe}%,email.ilike.%${safe}%` : null;

    // Optional exam-year cohort scope (users.academic_year). 'current' resolves to
    // the registry current batch; 'none' = untagged. NOT nexus_enrollments.batch_id.
    const examBatchParam = request.nextUrl.searchParams.get('examBatch') || undefined;
    let examBatchCode: string | null = null;
    if (examBatchParam && examBatchParam !== 'all' && examBatchParam !== 'none') {
      examBatchCode = examBatchParam === 'current' ? (await getCurrentBatch()).code : examBatchParam;
    }
    const applyExamBatch = (q: any) => {
      if (examBatchParam === 'none') return q.is('academic_year', null);
      if (examBatchCode) return q.eq('academic_year', examBatchCode);
      return q;
    };

    const supabase = getSupabaseAdminClient();

    // Resolve the caller and confirm they are a teacher/admin.
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', callerMs.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'Caller not found' }, { status: 401 });
    }

    const isAdmin = caller.user_type === 'admin';
    let isTeacher = caller.user_type === 'teacher';

    if (!isAdmin && !isTeacher) {
      const { data: teacherEnrollments } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', caller.id)
        .eq('role', 'teacher')
        .eq('is_active', true);
      isTeacher = !!teacherEnrollments && teacherEnrollments.length > 0;
    }

    if (!isAdmin && !isTeacher) {
      return NextResponse.json(
        { error: 'Only teachers and admins can view as a student' },
        { status: 403 }
      );
    }

    // ---- Admin: any student in the system ----
    if (isAdmin) {
      let query = supabase
        .from('users')
        .select('id, name, email, linked_classroom_email, avatar_url, ms_oid')
        .eq('user_type', 'student')
        .not('ms_oid', 'is', null)
        // Hide synthetic E2E test accounts (e2e-<purpose>@…). Anchored on the dash
        // so the canonical e2etesting* account stays selectable for impersonation.
        .or('email.is.null,email.not.ilike.e2e-*')
        .order('name', { ascending: true })
        .limit(MAX_RESULTS);

      query = applyExamBatch(query);
      if (orFilter) query = query.or(orFilter);

      const { data: students } = await query;
      return NextResponse.json({ students: mapStudents(students) });
    }

    // ---- Teacher: students in classrooms they teach ----
    const { data: myTeacherClassrooms } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, classroom:nexus_classrooms(id, name)')
      .eq('user_id', caller.id)
      .eq('role', 'teacher')
      .eq('is_active', true);

    const teacherClassroomIds = (myTeacherClassrooms || []).map((e: any) => e.classroom_id);
    if (teacherClassroomIds.length === 0) {
      return NextResponse.json({ students: [] });
    }

    // student_id -> classroom name (first classroom the teacher shares with them)
    const { data: studentEnrollments } = await supabase
      .from('nexus_enrollments')
      .select('user_id, classroom:nexus_classrooms(name)')
      .eq('role', 'student')
      .eq('is_active', true)
      .in('classroom_id', teacherClassroomIds);

    const classroomByStudent = new Map<string, string>();
    for (const e of studentEnrollments || []) {
      const id = (e as any).user_id as string;
      const name = (e as any).classroom?.name as string | undefined;
      if (id && !classroomByStudent.has(id) && name) {
        classroomByStudent.set(id, name);
      }
    }

    const studentIds = Array.from(
      new Set((studentEnrollments || []).map((e: any) => e.user_id).filter(Boolean))
    );
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [] });
    }

    let query = supabase
      .from('users')
      .select('id, name, email, linked_classroom_email, avatar_url, ms_oid')
      .in('id', studentIds)
      .eq('user_type', 'student')
      .not('ms_oid', 'is', null)
      // Hide synthetic E2E test accounts (e2e-<purpose>@…). Anchored on the dash
      // so the canonical e2etesting* account stays selectable for impersonation.
      .or('email.is.null,email.not.ilike.e2e-*')
      .order('name', { ascending: true })
      .limit(MAX_RESULTS);

    query = applyExamBatch(query);
    if (orFilter) query = query.or(orFilter);

    const { data: students } = await query;
    return NextResponse.json({ students: mapStudents(students, classroomByStudent) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('Impersonate candidates error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

function mapStudents(rows: any[] | null, classroomByStudent?: Map<string, string>) {
  return (rows || []).map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email || s.linked_classroom_email || null,
    avatar_url: s.avatar_url,
    ms_oid: s.ms_oid,
    classroomName: classroomByStudent?.get(s.id) || null,
  }));
}
