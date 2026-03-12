import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents?classroom={id}
 * Returns student's own documents
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('nexus_student_documents')
      .select('*')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ documents: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load documents';
    console.error('Documents GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents
 * Upload a document record
 * Body: { classroom_id, category, title, file_url, file_type }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: doc, error } = await supabase
      .from('nexus_student_documents')
      .insert({
        student_id: user.id,
        classroom_id: body.classroom_id,
        category: body.category,
        title: body.title,
        file_url: body.file_url,
        file_type: body.file_type || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save document';
    console.error('Documents POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
