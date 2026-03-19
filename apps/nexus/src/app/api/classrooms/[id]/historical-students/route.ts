import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getHistoricalStudents } from '@neram/database';

/**
 * GET /api/classrooms/[id]/historical-students?reason={category}&search={name}&page={n}&limit={n}
 * List removed students with progress snapshots, filterable by removal reason.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is teacher/admin in this classroom
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const reasonCategory = searchParams.get('reason') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await getHistoricalStudents(id, { reasonCategory, search, page, limit }, supabase);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load historical students';
    console.error('Historical students GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
