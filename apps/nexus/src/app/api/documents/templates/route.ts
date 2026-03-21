import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/templates?standard=10th
 * List active document templates, optionally filtered by standard
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('nexus_document_templates')
      .select('*')
      .eq('is_active', true);

    const standard = request.nextUrl.searchParams.get('standard');
    if (standard) {
      query = query.contains('applicable_standards', [standard]);
    }

    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;

    return NextResponse.json({ templates: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load templates';
    console.error('Templates GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/templates
 * Create a new document template (teacher/admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Verify teacher/admin role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can create templates' }, { status: 403 });
    }

    const body = await request.json();

    const { data: template, error } = await supabase
      .from('nexus_document_templates')
      .insert({
        name: body.name,
        description: body.description || null,
        category: body.category,
        applicable_standards: body.applicable_standards || [],
        is_required: body.is_required || false,
        unlock_date: body.unlock_date || null,
        linked_exam: body.linked_exam || null,
        exam_state_threshold: body.exam_state_threshold || null,
        max_file_size_mb: body.max_file_size_mb || 10,
        allowed_file_types: body.allowed_file_types || ['image/jpeg', 'image/png', 'application/pdf'],
        sort_order: body.sort_order || 0,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create template';
    console.error('Templates POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
