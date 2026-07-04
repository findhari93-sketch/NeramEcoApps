import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, listPublishedRecapsForStudent } from '@neram/database';

/**
 * GET /api/student/class-recaps
 * Published recaps across the student's classrooms, with their own progress.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const recaps = await listPublishedRecapsForStudent(user.id);
    return NextResponse.json({ recaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recaps';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
