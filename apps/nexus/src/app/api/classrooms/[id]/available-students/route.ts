export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';

/**
 * GET /api/classrooms/[id]/available-students
 *
 * Lists organisation (@neramclasses.com) student accounts from the Microsoft
 * Entra directory who are NOT yet enrolled in this classroom, so a teacher can
 * add them with one click. New Microsoft accounts appear here automatically —
 * no manual search required. Mirrors the admin sync-entra directory filter.
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

    // 1. Page all Entra users (same fields the admin sync-entra flow uses)
    let allAdUsers: any[] = [];
    let nextLink: string | null =
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,accountEnabled&$top=100';

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

    // 2. Filter to student accounts only (exclude staff + service mailboxes).
    // Kept in sync with apps/admin sync-entra GET.
    const staffPatterns = ['admin', 'teacher', 'hari', 'info@neramclasses.com', 'shanthi', 'paramesh', 'tamil'];
    const serviceLocalParts = new Set([
      'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'info', 'contact',
      'hello', 'office', 'accounts', 'billing', 'help', 'mail', 'team', 'postmaster',
      'webmaster', 'hr', 'careers', 'jobs', 'enquiry', 'enquiries', 'noreply-neram',
    ]);
    const studentAccounts = allAdUsers.filter((u: any) => {
      if (!u.accountEnabled) return false;
      const email = (u.userPrincipalName || '').toLowerCase();
      if (serviceLocalParts.has(email.split('@')[0])) return false;
      if (staffPatterns.some((p) => email.includes(p.toLowerCase()))) return false;
      return (
        email.includes('neramclasses') ||
        email.includes('nerasmclasses') ||
        email.includes('neram.co.in')
      );
    });

    // 3. Exclude anyone already actively enrolled in THIS classroom.
    const { data: enrolled } = await supabase
      .from('nexus_enrollments')
      .select('user:users!nexus_enrollments_user_id_fkey!inner(ms_oid)')
      .eq('classroom_id', classroomId)
      .eq('is_active', true);

    const enrolledOids = new Set(
      (enrolled || []).map((e: any) => e.user?.ms_oid).filter(Boolean)
    );

    // 4. Flag which directory users already have a local users row (informational).
    const allOids = studentAccounts.map((u: any) => u.id);
    const { data: existingUsers } = await supabase
      .from('users')
      .select('ms_oid')
      .in('ms_oid', allOids.length > 0 ? allOids : ['__none__']);
    const existingOids = new Set((existingUsers || []).map((u: any) => u.ms_oid));

    // 5. Build the "must never be offered" set: graduated (alumni) students and
    // any teacher/admin account. Match on BOTH ms_oid AND every known email, not
    // ms_oid alone: some graduated rows have a null/mismatched ms_oid (e.g. a
    // Google-first signup whose oid lives on a duplicate row), or a UPN whose
    // casing differs from the stored email. Email matching closes those gaps.
    const { data: blockedUsers } = await supabase
      .from('users')
      .select('ms_oid, email, personal_email, linked_classroom_email, is_alumni, user_type')
      .or('is_alumni.eq.true,user_type.in.(teacher,admin)');

    const blockedOids = new Set<string>();
    const blockedEmails = new Set<string>();
    for (const u of blockedUsers || []) {
      if (u.ms_oid) blockedOids.add(u.ms_oid);
      for (const e of [u.email, u.personal_email, u.linked_classroom_email]) {
        if (e) blockedEmails.add(String(e).trim().toLowerCase());
      }
    }
    const isBlocked = (u: any): boolean => {
      if (blockedOids.has(u.id)) return true;
      const upn = (u.userPrincipalName || '').trim().toLowerCase();
      const mail = (u.mail || '').trim().toLowerCase();
      return (!!upn && blockedEmails.has(upn)) || (!!mail && blockedEmails.has(mail));
    };

    const students = studentAccounts
      .filter((u: any) => !enrolledOids.has(u.id) && !isBlocked(u))
      .map((u: any) => ({
        ms_oid: u.id,
        name: u.displayName || u.userPrincipalName?.split('@')[0] || 'Unknown',
        email: u.mail || u.userPrincipalName || '',
        inDatabase: existingOids.has(u.id),
      }))
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    return NextResponse.json({ students, total: students.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load available students';
    // verifyMsToken throws on a missing/invalid token — surface that as 401.
    const status = /authorization|token|unauthori/i.test(message) ? 401 : 500;
    console.error('available-students error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}
