import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable/teachers
 *
 * Teaching staff (teachers + admins with a real Microsoft/Entra identity) for the
 * "Teacher (tutor)" picker in the class scheduler. Any teacher or admin may call.
 * `isSelf` flags the caller so the dialog can default the tutor to the person
 * scheduling the class. Test-login seeds (test-oid-*) and identity-less rows are
 * excluded, mirroring getNexusMemberUserIds.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: staff, error } = await supabase
      .from('users')
      .select('id, name, email, avatar_url, ms_oid, user_type')
      .in('user_type', ['teacher', 'admin'])
      .order('name', { ascending: true });

    if (error) throw error;

    const teachers = (staff || [])
      .filter(
        (s: any) => s.email && s.ms_oid && !String(s.ms_oid).startsWith('test-oid-'),
      )
      .map((s: any) => ({
        id: s.id,
        name: s.name || s.email,
        email: s.email,
        avatar_url: s.avatar_url || null,
        user_type: s.user_type,
        isSelf: s.id === caller.id,
      }));

    return NextResponse.json({ teachers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load teachers';
    console.error('Timetable teachers error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
