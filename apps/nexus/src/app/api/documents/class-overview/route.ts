import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/class-overview?classroom={id}
 * Returns the students x templates matrix for teachers
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not authorized for this classroom' }, { status: 403 });
    }

    // Use 'any' cast for columns not in generated types (current_standard, is_current, is_deleted, etc.)
    const db = supabase as any;

    // Get enrolled students with current_standard
    const { data: enrollments, error: enrollErr } = await db
      .from('nexus_enrollments')
      .select('user_id, current_standard, users:user_id(id, name, email, avatar_url)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    if (enrollErr) throw enrollErr;

    // Get active templates
    const { data: templates, error: tmplErr } = await db
      .from('nexus_document_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (tmplErr) throw tmplErr;

    // Get all current, non-deleted documents for this classroom
    // is_current and is_deleted are not in generated types
    const { data: docs, error: docsErr } = await db
      .from('nexus_student_documents')
      .select('id, student_id, template_id, status')
      .eq('classroom_id', classroomId)
      .eq('is_current', true)
      .eq('is_deleted', false);

    if (docsErr) throw docsErr;

    // Build matrix
    type MatrixCell = { status: string; document_id: string } | null;
    const matrix: Record<string, Record<string, MatrixCell>> = {};
    const students: Array<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      current_standard: string | null;
    }> = [];

    for (const enrollment of (enrollments || [])) {
      const u = enrollment.users as unknown as { id: string; name: string; email: string; avatar_url: string | null };
      if (!u) continue;
      const cs = (enrollment as Record<string, unknown>).current_standard as string | null;
      students.push({ ...u, current_standard: cs });
      matrix[u.id] = {};
      for (const tmpl of (templates || [])) {
        const doc = (docs || []).find(
          (d: Record<string, unknown>) => d.student_id === u.id && d.template_id === tmpl.id
        );
        matrix[u.id][tmpl.id] = doc
          ? { status: doc.status as string, document_id: doc.id as string }
          : null;
      }
    }

    return NextResponse.json({ students, templates: templates || [], matrix });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
