export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';
import { buildEnrollmentBlocklist, selectAddableStudents } from '@/lib/org-directory';

/**
 * GET /api/classrooms/[id]/available-students
 *
 * Lists organisation (@neramclasses.com) student accounts from the Microsoft
 * Entra directory who are NOT yet enrolled in this classroom, so a teacher can
 * add them with one click. New Microsoft accounts appear here automatically,
 * no manual search required.
 *
 * Who counts as a student is decided in two independent steps, and keeping them
 * apart is what makes this correct: the directory says whether the account is a
 * usable org person (lib/org-directory.ts), and the users table says whether that
 * person is staff or graduated. Guessing staff from the mailbox name is what this
 * route used to do, and it hid real students whose names happened to contain a
 * staff member's name. See lib/org-directory.ts for the full history.
 *
 * Teacher/admin only. Returns { students: [{ ms_oid, name, email, inDatabase }] }.
 * If app-only Graph credentials are unavailable, returns 502 so the UI can fall
 * back to the manual "Add Student" search dialog.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classroomId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is teacher/admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // App-only Graph token to page the directory. If unavailable, tell the UI
    // to fall back to the manual search dialog rather than failing hard.
    let token: string;
    try {
      token = await getAppOnlyToken();
    } catch {
      return NextResponse.json(
        { error: 'directory_unavailable', message: 'Organisation directory is temporarily unavailable.' },
        { status: 502 }
      );
    }

    // 1. Page all Entra users. userType is load-bearing: B2B guests carry a UPN on
    // our own tenant domain, so without it they read as insiders. See org-directory.
    let allAdUsers: any[] = [];
    let nextLink: string | null =
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType&$top=100';

    while (nextLink) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const res: Response = await fetch(nextLink, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          throw new Error(`Graph API error: ${res.status} ${err}`);
        }
        const data: any = await res.json();
        allAdUsers = allAdUsers.concat(data.value || []);
        nextLink = data['@odata.nextLink'] || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 2. Exclude anyone already actively enrolled in THIS classroom.
    const { data: enrolled } = await supabase
      .from('nexus_enrollments')
      .select('user:users!nexus_enrollments_user_id_fkey!inner(ms_oid)')
      .eq('classroom_id', classroomId)
      .eq('is_active', true);

    const enrolledOids = new Set(
      (enrolled || []).map((e: any) => e.user?.ms_oid).filter(Boolean)
    );

    // 3. Build the "must never be offered" set: graduated (alumni) students and any
    // staff member. This is the ONLY staff test, and it is on purpose: staff are
    // recognised from their users row, never from their mailbox name. See
    // lib/org-directory.ts for the student accounts a name-based rule was eating.
    // staff_role covers a manager tier whose user_type is neither teacher nor admin.
    const { data: blockedUsers } = await supabase
      .from('users')
      .select('ms_oid, email, personal_email, linked_classroom_email, is_alumni, user_type, staff_role')
      .or('is_alumni.eq.true,user_type.in.(teacher,admin),staff_role.not.is.null');

    const blocklist = buildEnrollmentBlocklist(blockedUsers || []);
    const addable = selectAddableStudents(allAdUsers, enrolledOids as Set<string>, blocklist);

    // 4. Flag which of them already have a local users row (informational only).
    const addableOids = addable.map((u) => u.id);
    const { data: existingUsers } = await supabase
      .from('users')
      .select('ms_oid')
      .in('ms_oid', addableOids.length > 0 ? addableOids : ['__none__']);
    const existingOids = new Set((existingUsers || []).map((u: any) => u.ms_oid));

    const students = addable
      .map((u) => ({
        ms_oid: u.id,
        name: u.displayName || u.userPrincipalName?.split('@')[0] || 'Unknown',
        email: u.mail || u.userPrincipalName || '',
        inDatabase: existingOids.has(u.id),
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return NextResponse.json({ students, total: students.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load available students';
    // verifyMsToken throws on a missing/invalid token — surface that as 401.
    const status = /authorization|token|unauthori/i.test(message) ? 401 : 500;
    console.error('available-students error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}
