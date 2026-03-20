import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getStudentQBReports,
  getTeacherQBReports,
} from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Students see their own reports; teachers/admins see all reports
    if (['teacher', 'admin'].includes(caller.user_type ?? '')) {
      const status = request.nextUrl.searchParams.get('status') || undefined;
      const reports = await getTeacherQBReports(status ? { status } : undefined);
      return NextResponse.json({ data: reports }, { status: 200 });
    } else {
      const reports = await getStudentQBReports(caller.id);
      return NextResponse.json({ data: reports }, { status: 200 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Reports list error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
