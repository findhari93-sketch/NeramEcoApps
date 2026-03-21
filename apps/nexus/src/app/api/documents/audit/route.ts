import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/audit?student={id}&document={id}&classroom={id}
 * Returns audit log entries
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let query = supabase
      .from('nexus_document_audit_log')
      .select('*, performer:performed_by(id, name)')
      .order('created_at', { ascending: false })
      .limit(100);

    const studentId = request.nextUrl.searchParams.get('student');
    const documentId = request.nextUrl.searchParams.get('document');
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (studentId) query = query.eq('student_id', studentId);
    if (documentId) query = query.eq('document_id', documentId);
    if (classroomId) query = query.eq('classroom_id', classroomId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ entries: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load audit log';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
